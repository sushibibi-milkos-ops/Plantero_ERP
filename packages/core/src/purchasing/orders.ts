import { and, eq, inArray } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { purchaseOrders, purchaseOrderLines, partners, receipts, receiptLines, invoices, invoiceLines, type DbOrTx } from '@plantero/db';
import { D, toDb, round4, sum, ZERO } from '../money.js';
import { businessDate } from '../dates.js';
import { nextDocNo } from '../sequences.js';
import { indexDocument, linkDocuments } from '../documents/chain.js';
import { computeLineTotals } from '../sales/pricing.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import type { ActorCtx, DocumentOrigin } from '../types.js';

/**
 * Satın alma siparişi (PO) yaşam döngüsü — `docs/modules/tedarik.md`.
 * `packages/core` katmanı yalnızca DB/domain kurallarını taşır; tedarikçiye gönderim (e-posta/WhatsApp,
 * `packages/integrations`) katman kuralı gereği (`docs/ARCHITECTURE.md` §1: core → integrations bağımlılığı
 * YOK, integrations → core VAR) burada değil `apps/web/src/modules/purchasing/actions.ts`'te yapılır;
 * bu modül yalnızca durumu `sent` olarak işaretleyen `markPurchaseOrderSent`'i sağlar.
 */

export type PurchaseOrderStatus = (typeof purchaseOrders.$inferSelect)['status'];

export type CreatePurchaseOrderLineInput = {
  productId: string;
  qty: Decimal;
  uomId: string;
  unitPrice: Decimal;
  vatRate?: Decimal | null;
  expectedDate?: string | Date | null;
  reorderRuleId?: string | null;
  description?: string | null;
};

export type CreatePurchaseOrderInput = {
  partnerId: string;
  warehouseId: string;
  orderDate?: string | Date;
  expectedDate?: string | Date | null;
  paymentTermDays?: number;
  currency?: string;
  buyerId?: string | null;
  origin?: DocumentOrigin;
  isAiGenerated?: boolean;
  aiRationale?: string | null;
  aiConfidence?: Decimal | null;
  /** Verilmezse: AI taslağı → 'ai_draft', aksi halde 'draft'. */
  status?: 'draft' | 'ai_draft' | 'pending_approval';
  note?: string | null;
  lines: CreatePurchaseOrderLineInput[];
};

export type PurchaseOrderWithLines = { order: typeof purchaseOrders.$inferSelect; lines: Array<typeof purchaseOrderLines.$inferSelect> };

const OPEN_STATUSES: PurchaseOrderStatus[] = ['ai_draft', 'draft', 'pending_approval', 'approved', 'sent', 'confirmed', 'partially_received'];

async function reindex(tx: DbOrTx, order: typeof purchaseOrders.$inferSelect): Promise<void> {
  await indexDocument(tx, {
    type: 'purchase_order', recordId: order.id, docNo: order.docNo, partnerId: order.partnerId, status: order.status,
    origin: order.origin, title: `Satın Alma Siparişi ${order.docNo}`, amount: D(order.grandTotal), docDate: new Date(order.orderDate),
  });
}

/**
 * Yeni PO — satırlardan toplamları hesaplar, dizi numarası atar, belge indeksine yazar.
 * SÖZLEŞME (docs/INVARIANTS.md I17): bu fonksiyon `purchase_orders` için audit_log satırı YAZMAZ —
 * audit yalnızca çağıran katmanda (web: `withAudit`, seed: `writeAudit`) üretilir. Bu fonksiyonu
 * `withAudit`/`writeAudit` olmadan doğrudan çağırmak (ör. tek seferlik script, konsol, ad-hoc test)
 * I17'yi anında ihlal eder — üründe eksik değil, çağıranda eksik audit'tir.
 */
export async function createPurchaseOrder(tx: DbOrTx, input: CreatePurchaseOrderInput, ctx: ActorCtx): Promise<PurchaseOrderWithLines> {
  if (!input.lines.length) throw new ValidationError('En az bir satır gerekli');
  const [partner] = await tx.select().from(partners).where(eq(partners.id, input.partnerId)).limit(1);
  if (!partner) throw new NotFoundError('Tedarikçi', input.partnerId);

  const orderDate = businessDate(input.orderDate ?? new Date());
  const docNo = await nextDocNo(tx, 'PO', new Date(orderDate));

  const built = input.lines.map((l) => {
    const qty = round4(D(l.qty));
    if (qty.lte(0)) throw new ValidationError('Satır miktarı sıfırdan büyük olmalı');
    const vatRate = l.vatRate ? D(l.vatRate) : D(20);
    return { ...l, qty, vatRate, ...computeLineTotals({ qty, unitPrice: D(l.unitPrice), vatRate }) };
  });

  const subtotal = round4(sum(built.map((l) => l.lineSubtotal)));
  const vatTotal = round4(sum(built.map((l) => l.lineVat)));
  const grandTotal = round4(sum(built.map((l) => l.lineTotal)));

  const status: PurchaseOrderStatus = input.status ?? (input.isAiGenerated ? 'ai_draft' : 'draft');

  const [order] = await tx
    .insert(purchaseOrders)
    .values({
      docNo, status, partnerId: partner.id, warehouseId: input.warehouseId, orderDate,
      expectedDate: input.expectedDate ? businessDate(input.expectedDate) : null,
      currency: input.currency ?? 'TRY', paymentTermDays: input.paymentTermDays ?? partner.paymentTermDays ?? 0,
      subtotal: toDb(subtotal), vatTotal: toDb(vatTotal), grandTotal: toDb(grandTotal),
      isAiGenerated: input.isAiGenerated ?? false, aiRationale: input.aiRationale ?? null,
      aiConfidence: input.aiConfidence ? toDb(input.aiConfidence) : null,
      // docs/INVARIANTS.md I7 ("kaynak referanssız belge yalnızca origin='manual' olabilir"): PO'nun
      // AI tarafından önerilmiş olması (`isAiGenerated`) belgeye bir üst belge/kaynak kazandırmaz — kritik
      // stok kuralları (`reorder_rules`) `document_index`'te izlenen bir belge türü değildir, dolayısıyla
      // bağlanacak bir kaynak yoktur. `origin: 'chain'` yalnızca çağıran gerçekten `linkDocuments` ile bir
      // kaynağa bağlayacaksa verilmelidir (bkz. `createRetroactivePurchaseOrderForReceipt` — burada da 'manual').
      buyerId: input.buyerId ?? null, origin: input.origin ?? 'manual',
      note: input.note ?? null, createdBy: ctx.userId ?? null,
    })
    .returning();

  const lines: Array<typeof purchaseOrderLines.$inferSelect> = [];
  let seq = 10;
  for (const l of built) {
    const [row] = await tx
      .insert(purchaseOrderLines)
      .values({
        orderId: order!.id, productId: l.productId, description: l.description ?? null, qty: toDb(l.qty), uomId: l.uomId,
        unitPrice: toDb(D(l.unitPrice)), vatRate: toDb(l.vatRate), lineSubtotal: toDb(l.lineSubtotal), lineVat: toDb(l.lineVat),
        lineTotal: toDb(l.lineTotal), expectedDate: l.expectedDate ? businessDate(l.expectedDate) : null,
        reorderRuleId: l.reorderRuleId ?? null, sequence: seq,
      })
      .returning();
    lines.push(row!);
    seq += 10;
  }

  await reindex(tx, order!);
  return { order: order!, lines };
}

async function getOrderOrThrow(tx: DbOrTx, id: string): Promise<typeof purchaseOrders.$inferSelect> {
  const [row] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).for('update');
  if (!row) throw new NotFoundError('Satın alma siparişi', id);
  return row;
}

function assertStatus(order: typeof purchaseOrders.$inferSelect, allowed: PurchaseOrderStatus[]): void {
  if (!allowed.includes(order.status)) {
    throw new DomainError('INVALID_PO_STATUS', `${order.docNo} durumu (${order.status}) bu işlem için uygun değil`, { status: order.status, allowed });
  }
}

/** Taslak/AI taslağı/onay bekleyen → onaylandı. */
export async function approvePurchaseOrder(tx: DbOrTx, id: string, ctx: ActorCtx): Promise<typeof purchaseOrders.$inferSelect> {
  const order = await getOrderOrThrow(tx, id);
  assertStatus(order, ['draft', 'ai_draft', 'pending_approval']);
  const [updated] = await tx
    .update(purchaseOrders)
    .set({ status: 'approved', approvedBy: ctx.userId ?? null, approvedAt: new Date(), updatedBy: ctx.userId ?? null })
    .where(eq(purchaseOrders.id, id))
    .returning();
  await reindex(tx, updated!);
  return updated!;
}

/** AI taslağı/onay bekleyen → reddedildi (tedarikçiye gönderilmez, kalem kritik listede kalır). */
export async function rejectPurchaseOrder(tx: DbOrTx, id: string, reason: string | null, ctx: ActorCtx): Promise<typeof purchaseOrders.$inferSelect> {
  const order = await getOrderOrThrow(tx, id);
  assertStatus(order, ['draft', 'ai_draft', 'pending_approval']);
  const [updated] = await tx
    .update(purchaseOrders)
    .set({ status: 'rejected', note: reason ? `${order.note ? `${order.note}\n` : ''}Reddedildi: ${reason}` : order.note, updatedBy: ctx.userId ?? null })
    .where(eq(purchaseOrders.id, id))
    .returning();
  await reindex(tx, updated!);
  return updated!;
}

/**
 * Onaylı sipariş → tedarikçiye gönderildi. Gerçek gönderim (e-posta/WhatsApp/PDF) `packages/integrations`
 * ile web katmanında yapılır; bu fonksiyon yalnızca sonucu kalıcılaştırır (sözleşme #1: core kendi
 * transaction'ını açmaz, dış API çağırmaz).
 */
export async function markPurchaseOrderSent(
  tx: DbOrTx,
  id: string,
  opts: { sentVia: string; sentTo?: string | null; pdfPath?: string | null; isAutoApproved?: boolean },
  ctx: ActorCtx,
): Promise<typeof purchaseOrders.$inferSelect> {
  const order = await getOrderOrThrow(tx, id);
  assertStatus(order, ['approved']);
  const [updated] = await tx
    .update(purchaseOrders)
    .set({
      status: 'sent', sentAt: new Date(), sentVia: opts.sentVia, sentTo: opts.sentTo ?? null, pdfPath: opts.pdfPath ?? null,
      isAutoApproved: opts.isAutoApproved ?? order.isAutoApproved, updatedBy: ctx.userId ?? null,
    })
    .where(eq(purchaseOrders.id, id))
    .returning();
  await reindex(tx, updated!);
  return updated!;
}

/** Tedarikçi teyidi (opsiyonel adım — beklenen tarih/tedarikçi referansı netleşir). */
export async function confirmPurchaseOrder(tx: DbOrTx, id: string, opts: { supplierRef?: string | null; expectedDate?: string | Date | null }, ctx: ActorCtx) {
  const order = await getOrderOrThrow(tx, id);
  assertStatus(order, ['sent']);
  const [updated] = await tx
    .update(purchaseOrders)
    .set({
      status: 'confirmed', supplierConfirmedAt: new Date(), supplierRef: opts.supplierRef ?? order.supplierRef,
      expectedDate: opts.expectedDate ? businessDate(opts.expectedDate) : order.expectedDate, updatedBy: ctx.userId ?? null,
    })
    .where(eq(purchaseOrders.id, id))
    .returning();
  await reindex(tx, updated!);
  return updated!;
}

/** Henüz mal kabul/faturalama başlamamış sipariş iptali. */
export async function cancelPurchaseOrder(tx: DbOrTx, id: string, reason: string | null, ctx: ActorCtx): Promise<typeof purchaseOrders.$inferSelect> {
  const order = await getOrderOrThrow(tx, id);
  assertStatus(order, ['draft', 'ai_draft', 'pending_approval', 'approved', 'sent', 'confirmed']);
  const [updated] = await tx
    .update(purchaseOrders)
    .set({ status: 'cancelled', note: reason ? `${order.note ? `${order.note}\n` : ''}İptal: ${reason}` : order.note, updatedBy: ctx.userId ?? null })
    .where(eq(purchaseOrders.id, id))
    .returning();
  await reindex(tx, updated!);
  return updated!;
}

/**
 * Sipariş durumunu satır bazlı alınan/faturalanan miktarlara göre yeniden hesaplar. `stock/receipts.ts`
 * (`receiveGoods`) ve `purchasing/invoicing.ts` (`createPurchaseInvoiceFromReceipt`) zaten kendi
 * geçişlerini uygular; bu yalnızca dışarıdan (ör. elle düzeltme sonrası) tutarlılığı yeniden kurmak
 * için sağlanan idempotent bir yardımcıdır.
 */
export async function recomputePurchaseOrderStatus(tx: DbOrTx, id: string): Promise<typeof purchaseOrders.$inferSelect> {
  const order = await getOrderOrThrow(tx, id);
  if (['cancelled', 'rejected', 'closed'].includes(order.status)) return order;
  const lines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.orderId, id));
  if (!lines.length) return order;

  const allInvoiced = lines.every((l) => D(l.invoicedQty).gte(D(l.qty)));
  const allReceived = lines.every((l) => D(l.receivedQty).gte(D(l.qty)));
  const anyReceived = lines.some((l) => D(l.receivedQty).gt(0));

  let next: PurchaseOrderStatus = order.status;
  if (allInvoiced && allReceived) next = 'invoiced';
  else if (allReceived) next = 'received';
  else if (anyReceived) next = 'partially_received';

  if (next === order.status) return order;
  const [updated] = await tx.update(purchaseOrders).set({ status: next }).where(eq(purchaseOrders.id, id)).returning();
  await reindex(tx, updated!);
  return updated!;
}

/** Belirli bir ürünün henüz tamamen alınmamış siparişlerindeki açık (kalan) miktarı — kritik stok motoru "açık PO" toplamı için. */
export async function getOpenPoQtyByProduct(tx: DbOrTx, productId: string, warehouseId?: string): Promise<Decimal> {
  const rows = await tx
    .select({ qty: purchaseOrderLines.qty, receivedQty: purchaseOrderLines.receivedQty, warehouseId: purchaseOrders.warehouseId })
    .from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.orderId))
    .where(and(eq(purchaseOrderLines.productId, productId), inArray(purchaseOrders.status, OPEN_STATUSES)));
  return rows
    .filter((r) => !warehouseId || r.warehouseId === warehouseId)
    .reduce((acc, r) => acc.plus(Decimal.max(ZERO, D(r.qty).minus(D(r.receivedQty)))), ZERO);
}

/**
 * Geriye dönük PO oluşturma (I24 kapatma yardımcısı) — yalnızca seed/veri düzeltme senaryoları için.
 * PO'suz bir mal kabul (`receipts.purchase_order_id IS NULL`) verildiğinde, kabulün satırlarından
 * birebir eşleşen, doğrudan 'received'/'invoiced' durumuna geçirilmiş bir PO üretir ve kabule bağlar
 * (docs/INVARIANTS.md I24). Gerçek/canlı akışta PO her zaman kabulden ÖNCE var olmalı — bu yol yalnızca
 * PO adımı atlanmış geçmiş/harici (seed) kayıtları tutarlı hale getirmek içindir, `receipt-form.tsx`
 * PO seçimini ikame etmez. Zaten PO'su olan kabul için no-op (idempotent).
 */
export async function createRetroactivePurchaseOrderForReceipt(tx: DbOrTx, receiptId: string, ctx: ActorCtx): Promise<typeof purchaseOrders.$inferSelect> {
  const [receipt] = await tx.select().from(receipts).where(eq(receipts.id, receiptId)).limit(1);
  if (!receipt) throw new NotFoundError('Mal kabul', receiptId);
  if (receipt.purchaseOrderId) {
    const [existing] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, receipt.purchaseOrderId)).limit(1);
    if (existing) return existing;
  }
  if (!receipt.partnerId) throw new ValidationError('Tedarikçisiz mal kabul için geriye dönük sipariş oluşturulamaz', { receiptId });

  const lines = await tx.select().from(receiptLines).where(eq(receiptLines.receiptId, receiptId)).orderBy(receiptLines.sequence);
  if (!lines.length) throw new ValidationError('Mal kabulde satır yok', { receiptId });

  const { order, lines: poLines } = await createPurchaseOrder(tx, {
    partnerId: receipt.partnerId, warehouseId: receipt.warehouseId,
    orderDate: receipt.supplierDeliveryDate ?? businessDate(receipt.receivedAt ?? receipt.createdAt),
    expectedDate: receipt.supplierDeliveryDate ?? null, origin: 'manual', status: 'draft',
    note: `Geriye dönük oluşturuldu: mal kabul ${receipt.docNo} PO referanssız girilmişti (docs/INVARIANTS.md I24)`,
    // receipt_lines.qty zaten TOPLAM (kabul + red) miktardır — bkz. receipts.ts receiveGoods
    // (totalLineQty = acceptedQty + finalRejectedQty === line.qty); ikinci kez rejectedQty eklemek çift sayım olur.
    lines: lines.map((l) => ({ productId: l.productId, qty: D(l.qty), uomId: l.uomId, unitPrice: D(l.unitCost) })),
  }, ctx);

  await approvePurchaseOrder(tx, order.id, ctx);
  await markPurchaseOrderSent(tx, order.id, { sentVia: 'manual', sentTo: null }, ctx);

  // Kabul zaten geçmişte tamamen alınmış (ve — receiveGoods'un otomatik faturalaması sayesinde — muhtemelen
  // zaten faturalanmış) olduğundan PO satırlarını doğrudan "tam alındı/faturalandı" olarak işaretliyoruz.
  const existingInvoiceLine = await tx
    .select({ line: invoiceLines, invoiceId: invoices.id })
    .from(invoiceLines)
    .innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
    .where(and(eq(invoices.receiptId, receiptId), eq(invoices.kind, 'purchase')));
  const invoiceLineByReceiptLine = new Map(existingInvoiceLine.map((r) => [r.line.receiptLineId, r]));

  for (let i = 0; i < lines.length; i += 1) {
    const rl = lines[i]!;
    const pol = poLines[i]!;
    const totalQty = round4(D(rl.qty));
    const invLine = invoiceLineByReceiptLine.get(rl.id);
    await tx
      .update(purchaseOrderLines)
      .set({ receivedQty: toDb(totalQty), invoicedQty: invLine ? toDb(totalQty) : '0.0000' })
      .where(eq(purchaseOrderLines.id, pol.id));
    await tx.update(receiptLines).set({ purchaseOrderLineId: pol.id }).where(eq(receiptLines.id, rl.id));
    if (invLine) await tx.update(invoiceLines).set({ purchaseOrderLineId: pol.id }).where(eq(invoiceLines.id, invLine.line.id));
    await linkDocuments(tx, { sourceType: 'purchase_order', sourceId: order.id, sourceLineId: pol.id, targetType: 'receipt', targetId: receipt.id, targetLineId: rl.id, qty: totalQty }, ctx);
  }
  await tx.update(receipts).set({ purchaseOrderId: order.id, updatedBy: ctx.userId ?? null }).where(eq(receipts.id, receiptId));
  await linkDocuments(tx, { sourceType: 'purchase_order', sourceId: order.id, targetType: 'receipt', targetId: receipt.id }, ctx);
  if (existingInvoiceLine.length) {
    const invoiceId = existingInvoiceLine[0]!.invoiceId;
    await tx.update(invoices).set({ purchaseOrderId: order.id }).where(eq(invoices.id, invoiceId));
    await linkDocuments(tx, { sourceType: 'purchase_order', sourceId: order.id, targetType: 'invoice', targetId: invoiceId }, ctx);
  }

  return recomputePurchaseOrderStatus(tx, order.id);
}
