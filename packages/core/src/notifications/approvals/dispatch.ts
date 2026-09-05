import { desc, eq, inArray } from 'drizzle-orm';
import { approvals, dunningActions, purchaseOrders, type DbOrTx } from '@plantero/db';
import { NotFoundError, DomainError } from '../../auth/errors.js';
import { writeAudit } from '../../audit/index.js';
import { approvePurchaseOrder, rejectPurchaseOrder } from '../../purchasing/orders.js';
import { approveCount } from '../../stock/counts.js';
import { approveDunningDraft } from '../../finance/dunning.js';
import { approveReconciliationMatch, rejectReconciliationMatch, listPendingMatches } from '../../accounting/reconciliation.js';
import type { ActorCtx } from '../../types.js';

/**
 * Onay merkezi (`/onaylar`) tür→işleyici haritası — tüm `approvals` türlerini TEK kuyrukta toplar.
 * Mutabakat önerileri (`reconciliation_matches`, `status='suggested'`) ayrı bir tablodadır (muhasebe
 * modülü `approvals` kuyruğunu kullanmıyor) — burada senkron bir "kind: reconciliation" satırına
 * dönüştürülür; onay/red kendi core fonksiyonlarına (`accounting/reconciliation.ts`) yönlendirilir.
 * `recipe_release` (Ar-Ge) ve `price_change` (Satış) haritada TANIMLIDIR ama bugün hiçbir modül bu
 * türde `approvals` satırı üretmiyor (arge/sales modüllerinin henüz onay akışı yok) — kuyrukta
 * göründükleri an (ilgili modül eklendiğinde) otomatik çalışırlar; şimdilik daima boş listelenirler.
 */

export type ApprovalKind = 'purchase_draft' | 'count_variance' | 'dunning_message' | 'reconciliation' | 'recipe_release' | 'price_change';

export type ApprovalQueueItem = {
  id: string;
  kind: ApprovalKind | string;
  refTable: string;
  refId: string;
  title: string;
  summary: string | null;
  /** numeric(18,4) ham string — ekran `formatMoney` ile biçimlendirir (tabular-nums, sağa hizalı, ayrı alan). Yapısal
   *  tutarı olmayan türlerde (ör. `dunning_message`) `null`; ekran o zaman tutar alanını hiç render etmez. */
  amount: string | null;
  confidence: number | null;
  createdAt: Date;
  requestedBy: string | null;
  href: string;
  requiredPermission: string;
};

const KIND_META: Record<string, { href: (refId: string) => string; permission: string }> = {
  purchase_draft: { href: (id) => `/satin-alma/siparisler/${id}`, permission: 'purchasing.approve' },
  count_variance: { href: (id) => `/depo/sayim/${id}`, permission: 'stock.approve_count' },
  dunning_message: { href: () => `/finans/tahsilat-takibi`, permission: 'finance.dunning' },
  reconciliation: { href: () => `/muhasebe/mutabakat`, permission: 'accounting.reconcile' },
  recipe_release: { href: () => `/arge/receteler`, permission: 'rnd.release' },
  price_change: { href: () => `/satis/fiyat-listeleri`, permission: 'sales.price' },
};

export function permissionForKind(kind: string): string {
  return KIND_META[kind]?.permission ?? 'admin.settings';
}

/** `reconciliation_matches.kind` (recon_match_kind enum) → Türkçe etiket — ham İngilizce enum ekrana asla sızmaz. */
const MATCH_KIND_LABEL: Record<string, string> = {
  invoice: 'Fatura', partner_on_account: 'Cari avans', loan_installment: 'Kredi taksiti', expense: 'Gider',
  transfer: 'Transfer', marketplace_payout: 'Pazaryeri ödemesi', tax: 'Vergi', fee: 'Ücret', unknown: 'Bilinmiyor',
};

/** Tek kuyruk: `approvals` (pending) + mutabakat önerileri (suggested), tarihe göre azalan. */
export async function listApprovalQueue(tx: DbOrTx): Promise<ApprovalQueueItem[]> {
  const rows = await tx.select().from(approvals).where(eq(approvals.status, 'pending')).orderBy(desc(approvals.createdAt));

  // Tur 3 P1 bulgu (onaylar-15): `purchase_draft` satırlarında sağ hizalı tutar sütunu boştu — tutar
  // yalnızca `summary` cümlesine gömülüydü. `approvals` şemasında yapısal bir tutar kolonu yok
  // (dondurulmuş şema — bkz. rapor "Şema talepleri"), ama kaynak belge (`purchase_orders.refId`)
  // zaten kendi `grandTotal`'ini taşıyor — metni yeniden ayrıştırmak yerine kaynağa join atıyoruz.
  const purchaseDraftIds = rows.filter((r) => r.kind === 'purchase_draft').map((r) => r.refId);
  const poAmountByOrderId = new Map<string, string>();
  if (purchaseDraftIds.length > 0) {
    const poRows = await tx.select({ id: purchaseOrders.id, grandTotal: purchaseOrders.grandTotal }).from(purchaseOrders).where(inArray(purchaseOrders.id, purchaseDraftIds));
    for (const po of poRows) poAmountByOrderId.set(po.id, po.grandTotal);
  }

  const items: ApprovalQueueItem[] = rows.map((r) => ({
    id: r.id, kind: r.kind, refTable: r.refTable, refId: r.refId, title: r.title, summary: r.summary,
    // `purchase_draft` için `purchase_orders.grandTotal`; yapısal tutarı olmayan diğer türlerde
    // (ör. `dunning_message`, `count_variance`) bilinçli olarak `null` kalır — ekran o zaman tutar
    // alanını hiç render etmez.
    amount: r.kind === 'purchase_draft' ? (poAmountByOrderId.get(r.refId) ?? null) : null,
    confidence: r.confidence !== null ? Number(r.confidence) : null, createdAt: r.createdAt, requestedBy: r.requestedBy,
    href: (KIND_META[r.kind]?.href ?? (() => '/kokpit'))(r.refId), requiredPermission: permissionForKind(r.kind),
  }));

  const recon = await listPendingMatches(tx);
  for (const r of recon) {
    // Başlık artık tür ön eki taşımıyor (kart zaten "Mutabakat önerisi" rozetini gösteriyor — Tur 1 P1
    // onaylar-05, tekrar 376px sütunda başlığın ayırt edici kısmını kırpıyordu). Özet, ham İngilizce
    // `kind` enumunu değil Türkçe karşılığını taşır ve güveni tekrarlamaz (rozet zaten gösteriyor —
    // onaylar-06); tutar artık metne gömülü değil, kendi yapısal alanında (onaylar-08).
    const kindLabel = MATCH_KIND_LABEL[r.m.kind] ?? MATCH_KIND_LABEL.unknown!;
    items.push({
      id: r.m.id, kind: 'reconciliation', refTable: 'reconciliation_matches', refId: r.m.id,
      title: r.bt.description,
      summary: r.m.rationale ? `${kindLabel} — ${r.m.rationale}` : kindLabel,
      amount: r.bt.amount,
      confidence: Number(r.m.confidence), createdAt: r.m.createdAt, requestedBy: null,
      href: KIND_META.reconciliation!.href(r.m.id), requiredPermission: KIND_META.reconciliation!.permission,
    });
  }

  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

async function loadApproval(tx: DbOrTx, id: string) {
  const [row] = await tx.select().from(approvals).where(eq(approvals.id, id)).limit(1);
  if (!row) throw new NotFoundError('Onay kaydı', id);
  return row;
}

/** Onaylar — `kind` haritadan işleyiciyi seçer; `id`, `reconciliation` için doğrudan match id'sidir, diğerlerinde `approvals.id`. */
export async function approveQueueItem(tx: DbOrTx, kind: string, id: string, ctx: ActorCtx): Promise<void> {
  switch (kind) {
    case 'purchase_draft': {
      const a = await loadApproval(tx, id);
      await approvePurchaseOrder(tx, a.refId, ctx);
      await tx.update(approvals).set({ status: 'approved', decidedBy: ctx.userId, decidedAt: new Date() }).where(eq(approvals.id, id));
      return;
    }
    case 'count_variance': {
      const a = await loadApproval(tx, id);
      await tx.update(approvals).set({ status: 'approved', decidedBy: ctx.userId, decidedAt: new Date() }).where(eq(approvals.id, id));
      await approveCount(tx, a.refId, ctx); // approvals satırı artık 'approved' — sayımı sonlandırır
      return;
    }
    case 'dunning_message': {
      const a = await loadApproval(tx, id);
      await approveDunningDraft(tx, a.refId, ctx); // approvals satırını kendi içinde günceller
      return;
    }
    case 'reconciliation': {
      await approveReconciliationMatch(tx, id, ctx);
      return;
    }
    default:
      throw new DomainError('APPROVAL_KIND_UNSUPPORTED', `${kind} türü onay merkezinde henüz desteklenmiyor`, { kind });
  }
}

export async function rejectQueueItem(tx: DbOrTx, kind: string, id: string, reason: string | null, ctx: ActorCtx): Promise<void> {
  switch (kind) {
    case 'purchase_draft': {
      const a = await loadApproval(tx, id);
      await rejectPurchaseOrder(tx, a.refId, reason, ctx);
      await tx.update(approvals).set({ status: 'rejected', decidedBy: ctx.userId, decidedAt: new Date(), decisionNote: reason }).where(eq(approvals.id, id));
      return;
    }
    case 'count_variance': {
      await tx.update(approvals).set({ status: 'rejected', decidedBy: ctx.userId, decidedAt: new Date(), decisionNote: reason }).where(eq(approvals.id, id));
      await writeAudit(tx, { action: 'reject', tableName: 'approvals', recordId: id, summary: `Sayım farkı onayı reddedildi${reason ? `: ${reason}` : ''}` }, ctx);
      return;
    }
    case 'dunning_message': {
      const a = await loadApproval(tx, id);
      await tx.update(dunningActions).set({ status: 'cancelled' }).where(eq(dunningActions.id, a.refId));
      await tx.update(approvals).set({ status: 'rejected', decidedBy: ctx.userId, decidedAt: new Date(), decisionNote: reason }).where(eq(approvals.id, id));
      await writeAudit(tx, { action: 'reject', tableName: 'dunning_actions', recordId: a.refId, summary: `Tahsilat hatırlatma taslağı reddedildi${reason ? `: ${reason}` : ''}` }, ctx);
      return;
    }
    case 'reconciliation': {
      await rejectReconciliationMatch(tx, id, reason, ctx);
      return;
    }
    default:
      throw new DomainError('APPROVAL_KIND_UNSUPPORTED', `${kind} türü onay merkezinde henüz desteklenmiyor`, { kind });
  }
}
