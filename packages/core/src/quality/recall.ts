import { and, eq, gt, inArray } from 'drizzle-orm';
import { recalls, recallItems, stockLots, stockQuants, products, partners, partnerContacts, locations, type DbOrTx } from '@plantero/db';
import { D, toDb, sum } from '../money.js';
import { nextDocNo } from '../sequences.js';
import { writeAudit } from '../audit/index.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import { postStockMove } from '../stock/ledger.js';
import { getScrapLocation, getQuarantineLocation } from '../stock/locations.js';
import { simulateRecall as traceSimulateRecall, type RecallImpact } from '../lots/trace.js';
import { notify } from '../notifications/send.js';
import { indexDocument, linkDocuments } from '../documents/chain.js';
import type { ActorCtx } from '../types.js';

/**
 * Geri çağırma — `/kalite/geri-cagirma` (docs kabul: simülasyon → başlat → aksiyon takibi → kapat).
 * Etki hesabı `lots/trace.ts`teki `simulateRecall` (zaten hazır) üzerine kuruludur; bu dosya onu
 * `recalls`/`recall_items` kayıtlarına, gerçek lot bloklamaya ve aksiyon takibine bağlar.
 */

export type SimulateInput = { rootLotId: string; direction?: 'forward' | 'backward' | 'both'; reason: string };
export type SimulateResult = {
  recall: typeof recalls.$inferSelect;
  impact: RecallImpact;
  customers: Array<{ id: string; name: string; email: string | null; phone: string | null; whatsapp: string | null }>;
  draftMessage: string;
};

export function buildDraftMessage(reason: string, impact: RecallImpact): string {
  return [
    `Sayın Yetkili,`,
    ``,
    `Plantero (Bigetaş Biyoteknoloji A.Ş.) olarak, aşağıda belirtilen ürün lotu/lotlarıyla ilgili bir geri çağırma sürecini başlatmış bulunuyoruz.`,
    `Gerekçe: ${reason}`,
    `Etkilenen lot sayısı: ${impact.counts.lots} · Sevk edilen miktar: ${impact.qtyDelivered}`,
    ``,
    `Elinizdeki ilgili ürünü kullanmayı/satmayı durdurmanızı ve tarafımızla iletişime geçmenizi rica ederiz. İade/değişim süreci ekibimiz tarafından yönetilecektir.`,
    ``,
    `Saygılarımızla,`,
    `Plantero Kalite Güvence`,
  ].join('\n');
}

export async function simulate(tx: DbOrTx, input: SimulateInput, ctx: ActorCtx): Promise<SimulateResult> {
  const [lot] = await tx.select().from(stockLots).where(eq(stockLots.id, input.rootLotId)).limit(1);
  if (!lot) throw new NotFoundError('Lot', input.rootLotId);
  if (!input.reason?.trim()) throw new ValidationError('Geri çağırma gerekçesi gerekli');

  const direction = input.direction ?? 'both';
  const impact = await traceSimulateRecall(tx, input.rootLotId, direction);

  const docNo = await nextDocNo(tx, 'RC');
  const [row] = await tx
    .insert(recalls)
    .values({ docNo, status: 'simulation', rootLotId: input.rootLotId, direction, reason: input.reason.trim(), impact: impact as unknown as Record<string, unknown>, initiatedBy: ctx.userId })
    .returning();
  if (!row) throw new ValidationError('Geri çağırma simülasyonu oluşturulamadı');

  const customerIds = impact.customers.map((c) => c.id);
  const contactRows = customerIds.length
    ? await tx.select({ partnerId: partnerContacts.partnerId, email: partnerContacts.email, phone: partnerContacts.phone, whatsapp: partnerContacts.whatsapp, isPrimary: partnerContacts.isPrimary }).from(partnerContacts).where(inArray(partnerContacts.partnerId, customerIds))
    : [];
  const partnerRows = customerIds.length ? await tx.select({ id: partners.id, email: partners.email, phone: partners.phone, whatsapp: partners.whatsapp }).from(partners).where(inArray(partners.id, customerIds)) : [];
  const partnerById = new Map(partnerRows.map((p) => [p.id, p]));

  const customers = impact.customers.map((c) => {
    const primaryContact = contactRows.filter((r) => r.partnerId === c.id).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0];
    const fallback = partnerById.get(c.id);
    return { id: c.id, name: c.name, email: primaryContact?.email ?? fallback?.email ?? null, phone: primaryContact?.phone ?? fallback?.phone ?? null, whatsapp: primaryContact?.whatsapp ?? fallback?.whatsapp ?? null };
  });

  const draftMessage = buildDraftMessage(input.reason, impact);

  await indexDocument(tx, { type: 'recall', recordId: row.id, docNo, status: row.status, origin: 'manual', title: `Geri Çağırma ${docNo} — ${lot.lotNo}` });
  if (lot.originReceiptId) await linkDocuments(tx, { sourceType: 'receipt', sourceId: lot.originReceiptId, targetType: 'recall', targetId: row.id }, ctx);
  if (lot.originWorkOrderId) await linkDocuments(tx, { sourceType: 'work_order', sourceId: lot.originWorkOrderId, targetType: 'recall', targetId: row.id }, ctx);

  await writeAudit(tx, {
    action: 'create', tableName: 'recalls', recordId: row.id,
    summary: `Geri çağırma simülasyonu ${docNo} — lot ${lot.lotNo}, ${impact.counts.lots} lot / ${impact.counts.customers} müşteri etkileniyor`,
    after: { impact },
  }, ctx);

  return { recall: row, impact, customers, draftMessage };
}

export type InitiateResult = { recall: typeof recalls.$inferSelect; blockedLots: number; notifiedCustomers: number; pendingNotificationIds: string[] };

/**
 * Geri çağırmayı başlatır: etki taze hesaplanır (simülasyondan bu yana stok değişmiş olabilir),
 * zincirdeki TÜM lotlar `recalled` durumuna alınır (ledger.ts `enforceLotRules` artık bu lotları
 * scrap/return_out/recall_return/count_loss dışında hiçbir yere göndermez — I16 ile aynı disiplin),
 * `recall_items` etki anlık görüntüsü olarak yazılır, etkilenen müşterilere bildirim taslağı
 * (`packages/core/src/notifications/send.ts`) oluşturulur (gerçek e-posta/WhatsApp gönderimi web
 * katmanında, `@plantero/integrations` ile, bu servisin çağrıldığı transaction'ın DIŞINDA yapılır —
 * sözleşme #3 katman kuralı: core entegrasyon paketi import etmez).
 */
export async function initiate(tx: DbOrTx, recallId: string, ctx: ActorCtx): Promise<InitiateResult> {
  const [recall] = await tx.select().from(recalls).where(eq(recalls.id, recallId)).for('update');
  if (!recall) throw new NotFoundError('Geri çağırma', recallId);
  if (recall.status !== 'simulation') throw new DomainError('RECALL_NOT_SIMULATION', `${recall.docNo} zaten başlatılmış (durum: ${recall.status})`, { recallId });

  const impact = await traceSimulateRecall(tx, recall.rootLotId, recall.direction as 'forward' | 'backward' | 'both');
  const movedAt = new Date();

  const lotIds = impact.lots.map((l) => l.id);
  const productByLotId = new Map<string, typeof products.$inferSelect>();
  const uomByLotId = new Map<string, string>();
  if (lotIds.length) {
    const lotRows = await tx.select({ lotId: stockLots.id, uomId: stockLots.uomId, product: products }).from(stockLots).innerJoin(products, eq(products.id, stockLots.productId)).where(inArray(stockLots.id, lotIds));
    for (const r of lotRows) { productByLotId.set(r.lotId, r.product); uomByLotId.set(r.lotId, r.uomId); }
  }

  let blockedLots = 0;
  for (const l of impact.lots) {
    /**
     * Fiziksel blok (P0 düzeltmesi — docs/INVARIANTS.md I27 canlı ihlali): lot durumu 'recalled'
     * yazılmadan ÖNCE, satılabilir ('internal') lokasyondaki eldeki miktar `postStockMove` ile
     * karantinaya taşınır — `recordRecallAction('destroy')` içindeki aynı kalıp (lokasyon →
     * depo → karantina lokasyonu). Sıra kasıtlı: `stock/ledger.ts` `enforceLotRules`, lot statüsü
     * zaten 'recalled' (BAD_LOT_STATUSES) iken YALNIZCA `scrap/return_out/recall_return/count_loss`
     * hareketine izin verir — 'transfer' bunların dışında olduğundan statü güncellemesi ÖNCE
     * yapılırsa bu blok kendi hareketini ledger'a reddettirir. Önceden bu blok hiç yoktu: lot
     * `recalled` işaretleniyor ama fiziksel olarak satılabilir rafta kalıyordu (I27
     * `bad_lot_status_in_internal_location`, canlı egzersizle kanıtlandı).
     */
    const quantRows = await tx.select({ id: stockQuants.id, qty: stockQuants.qty, locationId: stockQuants.locationId }).from(stockQuants).where(and(eq(stockQuants.lotId, l.id), gt(stockQuants.qty, '0')));
    for (const q of quantRows) {
      const [loc] = await tx.select({ warehouseId: locations.warehouseId, usage: locations.usage }).from(locations).where(eq(locations.id, q.locationId)).limit(1);
      if (!loc?.warehouseId || loc.usage !== 'internal') continue; // sanal lokasyon ya da zaten karantina/red/hurda — dokunma
      const quarantineLoc = await getQuarantineLocation(tx, loc.warehouseId);
      if (quarantineLoc.id === q.locationId) continue;
      const uomId = uomByLotId.get(l.id);
      if (!uomId) continue;
      await postStockMove(tx, {
        kind: 'transfer', productId: productByLotId.get(l.id)?.id ?? '', lotId: l.id, fromLocationId: q.locationId, toLocationId: quarantineLoc.id,
        qty: D(q.qty), uomId, refType: 'recall', refId: recallId, refNo: recall.docNo, origin: 'manual', movedAt, note: `Geri çağırma ${recall.docNo} — karantinaya alındı`,
      }, ctx);
    }

    await tx.update(stockLots).set({ status: 'recalled', recallId, updatedBy: ctx.userId ?? null }).where(eq(stockLots.id, l.id));
    blockedLots += 1;
    const afterQuantRows = await tx.select({ qty: stockQuants.qty }).from(stockQuants).where(and(eq(stockQuants.lotId, l.id), gt(stockQuants.qty, '0')));
    const qtyInStock = sum(afterQuantRows.map((q) => q.qty));
    const hop = productByLotId.get(l.id)?.type ?? 'unknown';
    await tx.insert(recallItems).values({
      recallId, lotId: l.id, hop, depth: l.depth, qtyInStock: toDb(qtyInStock), qtyDelivered: toDb(0),
      action: 'block', actionStatus: 'done', actionAt: movedAt,
    });
  }

  for (const d of impact.deliveries) {
    await tx.insert(recallItems).values({
      recallId, lotId: impact.lots[0]?.id ?? recall.rootLotId, hop: 'delivered', depth: 0, deliveryId: d.id,
      qtyInStock: toDb(0), qtyDelivered: toDb(d.qty), action: 'notify_customer', actionStatus: 'pending',
    });
  }

  const customerIds = Array.from(new Set(impact.customers.map((c) => c.id)));
  const pendingNotificationIds: string[] = [];
  for (const c of customerIds) {
    const res = await notify(tx, {
      partnerId: c, title: `Ürün geri çağırma bildirimi — ${recall.docNo}`,
      body: `İşletmenize teslim edilmiş bir ürün için geri çağırma süreci başlatılmıştır. Gerekçe: ${recall.reason}. Lütfen ilgili ürünü kullanmayı/satmayı durdurun.`,
      href: `/kalite/geri-cagirma/${recallId}`, channel: ['email', 'whatsapp'], refTable: 'recalls', refId: recallId,
    }, ctx);
    pendingNotificationIds.push(...res.ids);
  }
  // İç ekipler (kalite + satış) de haberdar edilir.
  await notify(tx, {
    roleCodes: ['kalite', 'satis', 'genel_mudur'], title: `Geri çağırma başlatıldı — ${recall.docNo}`,
    body: `${blockedLots} lot bloklandı, ${customerIds.length} müşteri bilgilendiriliyor. Gerekçe: ${recall.reason}`,
    href: `/kalite/geri-cagirma/${recallId}`, channel: ['in_app'], refTable: 'recalls', refId: recallId,
  }, ctx);

  const [updated] = await tx.update(recalls).set({ status: 'open', impact: impact as unknown as Record<string, unknown> }).where(eq(recalls.id, recallId)).returning();
  await indexDocument(tx, { type: 'recall', recordId: recallId, docNo: recall.docNo, status: 'open', origin: 'manual', title: `Geri Çağırma ${recall.docNo}` });

  await writeAudit(tx, {
    action: 'other', tableName: 'recalls', recordId: recallId,
    summary: `Geri çağırma ${recall.docNo} başlatıldı — ${blockedLots} lot bloklandı, ${customerIds.length} müşteri bilgilendiriliyor`,
  }, ctx);

  return { recall: updated!, blockedLots, notifiedCustomers: customerIds.length, pendingNotificationIds };
}

export type RecallActionKind = 'block' | 'notify' | 'return' | 'destroy';

export async function recordRecallAction(tx: DbOrTx, itemId: string, action: RecallActionKind, note: string | null, ctx: ActorCtx): Promise<typeof recallItems.$inferSelect> {
  const [item] = await tx.select().from(recallItems).where(eq(recallItems.id, itemId)).for('update');
  if (!item) throw new NotFoundError('Geri çağırma kalemi', itemId);
  const [recall] = await tx.select().from(recalls).where(eq(recalls.id, item.recallId)).for('update');
  if (!recall) throw new NotFoundError('Geri çağırma', item.recallId);
  if (recall.status === 'closed') throw new DomainError('RECALL_CLOSED', `${recall.docNo} kapatılmış — aksiyon eklenemez`, { recallId: recall.id });

  if (action === 'destroy') {
    const [lot] = await tx.select().from(stockLots).where(eq(stockLots.id, item.lotId)).limit(1);
    if (lot) {
      const quants = await tx.select().from(stockQuants).where(and(eq(stockQuants.lotId, lot.id), gt(stockQuants.qty, '0')));
      for (const q of quants) {
        const [loc] = await tx.select({ warehouseId: locations.warehouseId }).from(locations).where(eq(locations.id, q.locationId)).limit(1);
        if (!loc?.warehouseId) continue; // sanal/depo-bağımsız lokasyonda fiziksel stok olamaz
        const scrapLoc = await getScrapLocation(tx, loc.warehouseId);
        await postStockMove(tx, {
          kind: 'scrap', productId: lot.productId, lotId: lot.id, fromLocationId: q.locationId, toLocationId: scrapLoc.id,
          qty: D(q.qty), uomId: lot.uomId, refType: 'recall', refId: recall.id, refNo: recall.docNo, origin: 'manual', note: note ?? 'Geri çağırma — imha',
        }, ctx);
      }
    }
  }

  const [updated] = await tx
    .update(recallItems)
    .set({ action, actionStatus: 'done', actionAt: new Date() })
    .where(eq(recallItems.id, itemId))
    .returning();

  if (recall.status === 'open') await tx.update(recalls).set({ status: 'in_progress' }).where(eq(recalls.id, recall.id));

  await writeAudit(tx, { action: 'update', tableName: 'recall_items', recordId: itemId, summary: `${recall.docNo}: aksiyon kaydedildi (${action})${note ? ` — ${note}` : ''}` }, ctx);
  return updated!;
}

export async function closeRecall(tx: DbOrTx, recallId: string, ctx: ActorCtx): Promise<typeof recalls.$inferSelect> {
  const [recall] = await tx.select().from(recalls).where(eq(recalls.id, recallId)).for('update');
  if (!recall) throw new NotFoundError('Geri çağırma', recallId);
  if (recall.status === 'closed') return recall;
  if (recall.status === 'simulation') throw new DomainError('RECALL_NOT_STARTED', `${recall.docNo} henüz başlatılmadı — önce başlatın`, { recallId });
  const [updated] = await tx.update(recalls).set({ status: 'closed', closedAt: new Date() }).where(eq(recalls.id, recallId)).returning();
  await indexDocument(tx, { type: 'recall', recordId: recallId, docNo: recall.docNo, status: 'closed', origin: 'manual', title: `Geri Çağırma ${recall.docNo}` });
  await writeAudit(tx, { action: 'update', tableName: 'recalls', recordId: recallId, summary: `Geri çağırma ${recall.docNo} kapatıldı` }, ctx);
  return updated!;
}
