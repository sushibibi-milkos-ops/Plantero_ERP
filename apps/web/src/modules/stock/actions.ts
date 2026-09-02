'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db, schema } from '@plantero/db';
import { eq } from 'drizzle-orm';
import {
  D, postStockMove,
  createAndReceive,
  createDeliveryFromOrder, reserveFefo, confirmPick, shipDelivery, markDelivered,
  createTransfer, completeTransfer, receiveTransfer,
  createCount, snapshotCount, recordCount, submitReview, approveCount, postCount,
  scrapExpired, resolveScan,
} from '@plantero/core';
import { requirePermission } from '@/lib/auth';
import { withAudit } from '@/lib/actions';
import { listLocationStock } from './queries';

const { stockLots } = schema;

/* ==================================================================== */
/* Barkod/QR/lot tarama — toplama ve sayım ekranları                    */
/* ==================================================================== */

const scanSchema = z.object({ code: z.string().trim().min(1) });

export const scanCodeAction = withAudit('stock.scanCode', async (raw: z.infer<typeof scanSchema>) => {
  await requirePermission('stock.view');
  const input = scanSchema.parse(raw);
  const result = await resolveScan(db, input.code);
  return { data: result };
});

const locationIdSchema = z.object({ locationId: z.string().uuid() });

/** Transfer/sayım formlarında kaynak lokasyondaki lot combobox'ı için */
export const getLocationStockAction = withAudit('stock.getLocationStock', async (raw: z.infer<typeof locationIdSchema>) => {
  await requirePermission('stock.view');
  const input = locationIdSchema.parse(raw);
  const rows = await listLocationStock(input.locationId);
  return { data: rows };
});

/* ==================================================================== */
/* Mal kabul                                                             */
/* ==================================================================== */

const receiptLineSchema = z.object({
  purchaseOrderLineId: z.string().uuid().optional().nullable(),
  productId: z.string().uuid(),
  qty: z.string().min(1),
  uomId: z.string().uuid(),
  unitCost: z.string().min(1),
  supplierLotNo: z.string().trim().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  productionDate: z.string().optional().nullable(),
  disposition: z.enum(['quarantine', 'released', 'rejected']).optional(),
  toLocationId: z.string().uuid().optional().nullable(),
  rejectedQty: z.string().optional(),
  rejectReason: z.string().trim().optional().nullable(),
});

const createReceiptSchema = z.object({
  warehouseId: z.string().uuid(),
  partnerId: z.string().uuid().optional().nullable(),
  purchaseOrderId: z.string().uuid().optional().nullable(),
  supplierDeliveryNo: z.string().trim().optional().nullable(),
  supplierDeliveryDate: z.string().optional().nullable(),
  note: z.string().trim().optional().nullable(),
  lines: z.array(receiptLineSchema).min(1, 'En az bir satır ekleyin'),
});

export const receiveGoodsAction = withAudit('stock.receiveGoods', async (raw: z.infer<typeof createReceiptSchema>) => {
  const user = await requirePermission('stock.receive');
  const input = createReceiptSchema.parse(raw);
  const result = await db.transaction(async (tx) =>
    createAndReceive(tx, {
      warehouseId: input.warehouseId,
      partnerId: input.partnerId || null,
      purchaseOrderId: input.purchaseOrderId || null,
      supplierDeliveryNo: input.supplierDeliveryNo || null,
      supplierDeliveryDate: input.supplierDeliveryDate || null,
      note: input.note || null,
      lines: input.lines.map((l) => ({
        purchaseOrderLineId: l.purchaseOrderLineId || null,
        productId: l.productId,
        qty: D(l.qty),
        uomId: l.uomId,
        unitCost: D(l.unitCost),
        supplierLotNo: l.supplierLotNo || null,
        expiryDate: l.expiryDate || null,
        productionDate: l.productionDate || null,
        disposition: l.disposition,
        toLocationId: l.toLocationId || null,
        rejectedQty: l.rejectedQty ? D(l.rejectedQty) : undefined,
        rejectReason: l.rejectReason || null,
      })),
    }, user.actor),
  );
  revalidatePath('/depo/mal-kabul');
  revalidatePath('/depo/stok');
  revalidatePath('/depo/lotlar');
  return {
    data: { id: result.receipt.id, docNo: result.receipt.docNo },
    audit: { action: 'create', tableName: 'receipts', recordId: result.receipt.id, summary: `Mal kabul ${result.receipt.docNo} kaydedildi (${result.lines.length} satır)`, after: result.receipt },
  };
});

/* ==================================================================== */
/* Lot yönetimi — karantina serbest/red (quality.release)                */
/* ==================================================================== */

const lotDecisionSchema = z.object({ lotId: z.string().uuid(), toLocationId: z.string().uuid(), note: z.string().trim().optional().nullable() });

export const releaseLotAction = withAudit('quality.releaseLot', async (raw: z.infer<typeof lotDecisionSchema>) => {
  const user = await requirePermission('quality.release');
  const input = lotDecisionSchema.parse(raw);
  const lot = await db.transaction(async (tx) => {
    const [l] = await tx.select().from(stockLots).where(eq(stockLots.id, input.lotId)).limit(1);
    if (!l) throw new Error('Lot bulunamadı');
    const { stockQuants } = schema;
    const [quant] = await tx.select().from(stockQuants).where(eq(stockQuants.lotId, l.id)).limit(1);
    if (!quant) throw new Error('Bu lotun eldeki lokasyonu bulunamadı');
    await postStockMove(tx, {
      kind: 'quarantine_release', productId: l.productId, lotId: l.id, fromLocationId: quant.locationId, toLocationId: input.toLocationId,
      qty: D(quant.qty), uomId: l.uomId, refType: 'quality_check', refId: l.id, refNo: l.lotNo, origin: 'manual', note: input.note ?? null,
    }, user.actor);
    const [updated] = await tx.select().from(stockLots).where(eq(stockLots.id, l.id)).limit(1);
    return updated!;
  });
  revalidatePath('/depo/lotlar');
  revalidatePath(`/depo/lotlar/${lot.id}`);
  revalidatePath('/depo/stok');
  return { data: { id: lot.id }, audit: { action: 'approve', tableName: 'stock_lots', recordId: lot.id, summary: `Lot ${lot.lotNo} serbest bırakıldı`, after: lot } };
});

const rejectLotSchema = z.object({ lotId: z.string().uuid(), rejectedLocationId: z.string().uuid(), reason: z.string().trim().min(2, 'Red gerekçesi gerekli') });

export const rejectLotAction = withAudit('quality.rejectLot', async (raw: z.infer<typeof rejectLotSchema>) => {
  const user = await requirePermission('quality.release');
  const input = rejectLotSchema.parse(raw);
  const lot = await db.transaction(async (tx) => {
    const [l] = await tx.select().from(stockLots).where(eq(stockLots.id, input.lotId)).limit(1);
    if (!l) throw new Error('Lot bulunamadı');
    const { stockQuants } = schema;
    const [quant] = await tx.select().from(stockQuants).where(eq(stockQuants.lotId, l.id)).limit(1);
    if (!quant) throw new Error('Bu lotun eldeki lokasyonu bulunamadı');
    await postStockMove(tx, {
      kind: 'quarantine_reject', productId: l.productId, lotId: l.id, fromLocationId: quant.locationId, toLocationId: input.rejectedLocationId,
      qty: D(quant.qty), uomId: l.uomId, refType: 'quality_check', refId: l.id, refNo: l.lotNo, origin: 'manual', note: input.reason,
    }, user.actor);
    const [updated] = await tx.select().from(stockLots).where(eq(stockLots.id, l.id)).limit(1);
    return updated!;
  });
  revalidatePath('/depo/lotlar');
  revalidatePath(`/depo/lotlar/${lot.id}`);
  revalidatePath('/depo/stok');
  return { data: { id: lot.id }, audit: { action: 'reject', tableName: 'stock_lots', recordId: lot.id, summary: `Lot ${lot.lotNo} reddedildi`, after: lot } };
});

/* ==================================================================== */
/* Sevkiyat                                                              */
/* ==================================================================== */

const createDeliverySchema = z.object({ salesOrderId: z.string().uuid(), warehouseId: z.string().uuid().optional(), scheduledDate: z.string().optional().nullable(), carrier: z.string().trim().optional().nullable() });

export const createDeliveryAction = withAudit('stock.createDelivery', async (raw: z.infer<typeof createDeliverySchema>) => {
  const user = await requirePermission('stock.pick');
  const input = createDeliverySchema.parse(raw);
  const { delivery } = await db.transaction(async (tx) => createDeliveryFromOrder(tx, input.salesOrderId, { warehouseId: input.warehouseId, scheduledDate: input.scheduledDate || null, carrier: input.carrier || null }, user.actor));
  revalidatePath('/depo/sevkiyat');
  return { data: { id: delivery.id, docNo: delivery.docNo }, audit: { action: 'create', tableName: 'deliveries', recordId: delivery.id, summary: `İrsaliye ${delivery.docNo} oluşturuldu`, after: delivery } };
});

const idSchema = z.object({ id: z.string().uuid() });

export const reserveFefoAction = withAudit('stock.reserveFefo', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('stock.pick');
  const input = idSchema.parse(raw);
  const { delivery } = await db.transaction(async (tx) => reserveFefo(tx, input.id, user.actor));
  revalidatePath(`/depo/sevkiyat/${input.id}`);
  return { data: { id: delivery.id }, audit: { action: 'update', tableName: 'deliveries', recordId: delivery.id, summary: `İrsaliye ${delivery.docNo} FEFO ile rezerve edildi` } };
});

const confirmPickSchema = z.object({ deliveryId: z.string().uuid(), lineId: z.string().uuid(), scannedLotId: z.string().uuid().optional().nullable() });

export const confirmPickAction = withAudit('stock.confirmPick', async (raw: z.infer<typeof confirmPickSchema>) => {
  const user = await requirePermission('stock.pick');
  const input = confirmPickSchema.parse(raw);
  const { delivery } = await db.transaction(async (tx) => confirmPick(tx, { deliveryId: input.deliveryId, lineId: input.lineId, scannedLotId: input.scannedLotId }, user.actor));
  revalidatePath(`/depo/sevkiyat/${input.deliveryId}/topla`);
  return { data: { status: delivery.status }, audit: { action: 'update', tableName: 'delivery_lines', recordId: input.lineId, summary: `İrsaliye ${delivery.docNo} satırı toplandı` } };
});

export const shipDeliveryAction = withAudit('stock.shipDelivery', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('stock.pick');
  const input = idSchema.parse(raw);
  const { delivery } = await db.transaction(async (tx) => shipDelivery(tx, input.id, user.actor));
  revalidatePath('/depo/sevkiyat');
  revalidatePath(`/depo/sevkiyat/${input.id}`);
  revalidatePath('/depo/stok');
  return { data: { id: delivery.id }, audit: { action: 'post', tableName: 'deliveries', recordId: delivery.id, summary: `İrsaliye ${delivery.docNo} sevk edildi`, after: delivery } };
});

export const markDeliveredAction = withAudit('stock.markDelivered', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('stock.pick');
  const input = idSchema.parse(raw);
  const delivery = await db.transaction(async (tx) => markDelivered(tx, input.id, user.actor));
  revalidatePath(`/depo/sevkiyat/${input.id}`);
  return { data: { id: delivery.id }, audit: { action: 'update', tableName: 'deliveries', recordId: delivery.id, summary: `İrsaliye ${delivery.docNo} teslim edildi işaretlendi` } };
});

/* ==================================================================== */
/* Transfer                                                              */
/* ==================================================================== */

const transferLineSchema = z.object({ productId: z.string().uuid(), lotId: z.string().uuid().optional().nullable(), qty: z.string().min(1), uomId: z.string().uuid(), fromLocationId: z.string().uuid(), toLocationId: z.string().uuid() });

const createTransferSchema = z.object({
  fromWarehouseId: z.string().uuid(), toWarehouseId: z.string().uuid(), scheduledDate: z.string().optional().nullable(),
  reason: z.string().trim().optional().nullable(), note: z.string().trim().optional().nullable(), lines: z.array(transferLineSchema).min(1),
});

export const createTransferAction = withAudit('stock.createTransfer', async (raw: z.infer<typeof createTransferSchema>) => {
  const user = await requirePermission('stock.transfer');
  const input = createTransferSchema.parse(raw);
  const { transfer } = await db.transaction(async (tx) =>
    createTransfer(tx, { ...input, lines: input.lines.map((l) => ({ ...l, qty: D(l.qty), lotId: l.lotId || null })) }, user.actor),
  );
  revalidatePath('/depo/transfer');
  return { data: { id: transfer.id, docNo: transfer.docNo }, audit: { action: 'create', tableName: 'transfers', recordId: transfer.id, summary: `Transfer ${transfer.docNo} oluşturuldu`, after: transfer } };
});

export const completeTransferAction = withAudit('stock.completeTransfer', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('stock.transfer');
  const input = idSchema.parse(raw);
  const { transfer } = await db.transaction(async (tx) => completeTransfer(tx, input.id, user.actor));
  revalidatePath('/depo/transfer');
  revalidatePath('/depo/stok');
  return { data: { status: transfer.status }, audit: { action: 'post', tableName: 'transfers', recordId: transfer.id, summary: `Transfer ${transfer.docNo}: ${transfer.status === 'in_transit' ? 'yola çıktı' : 'tamamlandı'}`, after: transfer } };
});

export const receiveTransferAction = withAudit('stock.receiveTransfer', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('stock.transfer');
  const input = idSchema.parse(raw);
  const { transfer } = await db.transaction(async (tx) => receiveTransfer(tx, input.id, user.actor));
  revalidatePath('/depo/transfer');
  revalidatePath('/depo/stok');
  return { data: { status: transfer.status }, audit: { action: 'post', tableName: 'transfers', recordId: transfer.id, summary: `Transfer ${transfer.docNo} teslim alındı`, after: transfer } };
});

/* ==================================================================== */
/* Sayım                                                                 */
/* ==================================================================== */

const createCountSchema = z.object({ warehouseId: z.string().uuid(), scopeLocationId: z.string().uuid().optional().nullable(), countDate: z.string(), note: z.string().trim().optional().nullable() });

export const createCountAction = withAudit('stock.createCount', async (raw: z.infer<typeof createCountSchema>) => {
  const user = await requirePermission('stock.count');
  const input = createCountSchema.parse(raw);
  const count = await db.transaction(async (tx) => createCount(tx, { ...input, scopeLocationId: input.scopeLocationId || null }, user.actor));
  revalidatePath('/depo/sayim');
  return { data: { id: count.id, docNo: count.docNo }, audit: { action: 'create', tableName: 'stock_counts', recordId: count.id, summary: `Sayım ${count.docNo} oluşturuldu`, after: count } };
});

export const snapshotCountAction = withAudit('stock.snapshotCount', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('stock.count');
  const input = idSchema.parse(raw);
  const { count } = await db.transaction(async (tx) => snapshotCount(tx, input.id, user.actor));
  revalidatePath(`/depo/sayim/${input.id}`);
  return { data: { id: count.id }, audit: { action: 'update', tableName: 'stock_counts', recordId: count.id, summary: `Sayım ${count.docNo} görüntüsü alındı` } };
});

const recordCountSchema = z.object({ countId: z.string().uuid(), lineId: z.string().uuid().optional(), productId: z.string().uuid().optional(), lotId: z.string().uuid().optional().nullable(), locationId: z.string().uuid().optional(), countedQty: z.string() });

export const recordCountAction = withAudit('stock.recordCount', async (raw: z.infer<typeof recordCountSchema>) => {
  const user = await requirePermission('stock.count');
  const input = recordCountSchema.parse(raw);
  const line = await db.transaction(async (tx) => recordCount(tx, { ...input, countedQty: D(input.countedQty) }, user.actor));
  revalidatePath(`/depo/sayim/${input.countId}`);
  return { data: { id: line.id }, audit: { action: 'update', tableName: 'stock_count_lines', recordId: line.id, summary: `Sayım satırı güncellendi (${line.countedQty})` } };
});

export const submitReviewAction = withAudit('stock.submitCountReview', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('stock.count');
  const input = idSchema.parse(raw);
  const count = await db.transaction(async (tx) => submitReview(tx, input.id, user.actor));
  revalidatePath(`/depo/sayim/${input.id}`);
  return { data: { status: count.status }, audit: { action: 'update', tableName: 'stock_counts', recordId: count.id, summary: `Sayım ${count.docNo} incelemeye gönderildi` } };
});

export const approveCountAction = withAudit('stock.approveCount', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('stock.approve_count');
  const input = idSchema.parse(raw);
  const result = await db.transaction(async (tx) => approveCount(tx, input.id, user.actor));
  revalidatePath(`/depo/sayim/${input.id}`);
  return {
    data: { status: result.status },
    audit: { action: result.status === 'approved' ? 'approve' : 'other', tableName: 'stock_counts', recordId: result.count.id, summary: result.status === 'approved' ? `Sayım ${result.count.docNo} onaylandı` : `Sayım ${result.count.docNo} farkı GM onayına gönderildi (>5.000 TL)` },
  };
});

export const postCountAction = withAudit('stock.postCount', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('stock.approve_count');
  const input = idSchema.parse(raw);
  const { count } = await db.transaction(async (tx) => postCount(tx, input.id, user.actor));
  revalidatePath(`/depo/sayim/${input.id}`);
  revalidatePath('/depo/stok');
  return { data: { status: count.status }, audit: { action: 'post', tableName: 'stock_counts', recordId: count.id, summary: `Sayım ${count.docNo} kaydedildi (fark: ${count.varianceValue} TL)`, after: count } };
});

/* ==================================================================== */
/* SKT — hurdaya ayır                                                    */
/* ==================================================================== */

const scrapExpiredSchema = z.object({ lotId: z.string().uuid(), locationId: z.string().uuid().optional().nullable(), reason: z.string().trim().optional() });

export const scrapExpiredAction = withAudit('stock.scrapExpired', async (raw: z.infer<typeof scrapExpiredSchema>) => {
  const user = await requirePermission('stock.count');
  const input = scrapExpiredSchema.parse(raw);
  const result = await db.transaction(async (tx) => scrapExpired(tx, { lotId: input.lotId, locationId: input.locationId || null, reason: input.reason }, user.actor));
  revalidatePath('/depo/skt');
  revalidatePath('/depo/stok');
  revalidatePath('/depo/lotlar');
  return { data: result, audit: { action: 'post', tableName: 'stock_lots', recordId: input.lotId, summary: `Lot hurdaya ayrıldı (${result.movedQty})` } };
});
