import { eq, and } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { stockCounts, stockCountLines, stockQuants, locations, products, stockLots, approvals, type DbOrTx } from '@plantero/db';
import { D, toDb, round4, sum, ZERO } from '../money.js';
import { businessDate } from '../dates.js';
import { nextDocNo } from '../sequences.js';
import { indexDocument } from '../documents/chain.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import { postStockMove } from './ledger.js';
import { getInventoryLossLocation, subtreeCondition } from './locations.js';
import type { ActorCtx } from '../types.js';

/**
 * Sayım — snapshot → sayım girişi → inceleme → onay (>5.000 TL fark GM onay kuyruğu) → kayıt
 * (`count_gain`/`count_loss`, `stock/ledger.postStockMove`).
 */

/** Fark değeri (mutlak) bu eşiği aşarsa GM onayı gerekir (`approvals` kuyruğu) */
export const COUNT_APPROVAL_THRESHOLD = new Decimal(5000);

export type CreateCountInput = { warehouseId: string; scopeLocationId?: string | null; countDate: string | Date; note?: string | null };
export type CountWithLines = { count: typeof stockCounts.$inferSelect; lines: Array<typeof stockCountLines.$inferSelect> };

export async function createCount(tx: DbOrTx, input: CreateCountInput, ctx: ActorCtx): Promise<typeof stockCounts.$inferSelect> {
  const docNo = await nextDocNo(tx, 'CNT');
  const [count] = await tx
    .insert(stockCounts)
    .values({ docNo, status: 'draft', warehouseId: input.warehouseId, scopeLocationId: input.scopeLocationId ?? null, countDate: businessDate(input.countDate), countedBy: ctx.userId ?? null, note: input.note ?? null, createdBy: ctx.userId ?? null })
    .returning();
  await indexDocument(tx, { type: 'stock_count', recordId: count!.id, docNo, status: 'draft', origin: 'manual', title: `Sayım ${docNo}`, docDate: new Date() });
  return count!;
}

/** Kapsamdaki (depo/lokasyon alt ağacı) tüm quant'ları sistem miktarı olarak satıra döker. */
export async function snapshotCount(tx: DbOrTx, countId: string, ctx: ActorCtx): Promise<CountWithLines> {
  const [count] = await tx.select().from(stockCounts).where(eq(stockCounts.id, countId)).for('update');
  if (!count) throw new NotFoundError('Sayım', countId);
  if (count.status !== 'draft') throw new DomainError('COUNT_ALREADY_SNAPSHOT', `Sayım ${count.docNo} zaten görüntü alınmış`, { status: count.status });

  const conds = [eq(locations.warehouseId, count.warehouseId), eq(locations.usage, 'internal')];
  if (count.scopeLocationId) {
    const [scope] = await tx.select().from(locations).where(eq(locations.id, count.scopeLocationId)).limit(1);
    if (!scope) throw new NotFoundError('Lokasyon', count.scopeLocationId);
    conds.push(subtreeCondition(scope));
  }

  const rows = await tx
    .select({ productId: stockQuants.productId, lotId: stockQuants.lotId, locationId: stockQuants.locationId, qty: stockQuants.qty, lotCost: stockLots.unitCost, avgCost: products.averageCost })
    .from(stockQuants)
    .innerJoin(locations, eq(locations.id, stockQuants.locationId))
    .innerJoin(products, eq(products.id, stockQuants.productId))
    .leftJoin(stockLots, eq(stockLots.id, stockQuants.lotId))
    .where(and(...conds));

  const lines: Array<typeof stockCountLines.$inferSelect> = [];
  for (const r of rows) {
    const unitCost = r.lotId ? D(r.lotCost) : D(r.avgCost);
    const [row] = await tx
      .insert(stockCountLines)
      .values({ countId, productId: r.productId, lotId: r.lotId, locationId: r.locationId, systemQty: r.qty, countedQty: null, varianceQty: toDb(0), unitCost: toDb(unitCost) })
      .returning();
    lines.push(row!);
  }

  const [updated] = await tx.update(stockCounts).set({ status: 'counting', updatedBy: ctx.userId ?? null }).where(eq(stockCounts.id, countId)).returning();
  await indexDocument(tx, { type: 'stock_count', recordId: countId, docNo: count.docNo, status: 'counting', origin: 'manual', title: `Sayım ${count.docNo}` });
  return { count: updated!, lines };
}

export type RecordCountInput = { countId: string; lineId?: string; productId?: string; lotId?: string | null; locationId?: string; countedQty: Decimal };

/** Sayılan miktarı girer; `lineId` verilmezse (bulunmayan lot/ürün) yeni satır açar. */
export async function recordCount(tx: DbOrTx, input: RecordCountInput, ctx: ActorCtx): Promise<typeof stockCountLines.$inferSelect> {
  const [count] = await tx.select().from(stockCounts).where(eq(stockCounts.id, input.countId)).limit(1);
  if (!count) throw new NotFoundError('Sayım', input.countId);
  if (count.status !== 'counting') throw new DomainError('COUNT_NOT_COUNTING', `Sayım ${count.docNo} sayım aşamasında değil (durum: ${count.status})`);
  const countedQty = round4(D(input.countedQty));
  if (countedQty.lt(0)) throw new ValidationError('Sayılan miktar negatif olamaz');

  let row: typeof stockCountLines.$inferSelect | undefined;
  if (input.lineId) {
    const [line] = await tx.select().from(stockCountLines).where(eq(stockCountLines.id, input.lineId)).limit(1);
    if (!line || line.countId !== input.countId) throw new NotFoundError('Sayım satırı', input.lineId);
    const variance = round4(countedQty.minus(D(line.systemQty)));
    [row] = await tx.update(stockCountLines).set({ countedQty: toDb(countedQty), varianceQty: toDb(variance), countedAt: new Date() }).where(eq(stockCountLines.id, line.id)).returning();
  } else {
    if (!input.productId || !input.locationId) throw new ValidationError('Yeni satır için ürün ve lokasyon gerekli');
    let unitCost = ZERO;
    if (input.lotId) {
      const [lot] = await tx.select().from(stockLots).where(eq(stockLots.id, input.lotId)).limit(1);
      unitCost = D(lot?.unitCost);
    } else {
      const [product] = await tx.select().from(products).where(eq(products.id, input.productId)).limit(1);
      unitCost = D(product?.averageCost);
    }
    [row] = await tx
      .insert(stockCountLines)
      .values({ countId: input.countId, productId: input.productId, lotId: input.lotId ?? null, locationId: input.locationId, systemQty: toDb(0), countedQty: toDb(countedQty), varianceQty: toDb(countedQty), unitCost: toDb(unitCost), countedAt: new Date() })
      .returning();
  }

  const lines = await tx.select().from(stockCountLines).where(eq(stockCountLines.countId, input.countId));
  const varianceValue = sum(lines.map((l) => D(l.varianceQty).mul(D(l.unitCost))));
  await tx.update(stockCounts).set({ varianceValue: toDb(varianceValue), updatedBy: ctx.userId ?? null }).where(eq(stockCounts.id, input.countId));
  return row!;
}

/** Sayımı incelemeye gönderir — tüm satırlar sayılmış olmalı. */
export async function submitReview(tx: DbOrTx, countId: string, ctx: ActorCtx): Promise<typeof stockCounts.$inferSelect> {
  const [count] = await tx.select().from(stockCounts).where(eq(stockCounts.id, countId)).for('update');
  if (!count) throw new NotFoundError('Sayım', countId);
  if (count.status !== 'counting') throw new DomainError('COUNT_NOT_COUNTING', `Sayım ${count.docNo} sayım aşamasında değil`);
  const lines = await tx.select().from(stockCountLines).where(eq(stockCountLines.countId, countId));
  if (!lines.length) throw new ValidationError('Sayımda satır yok');
  if (lines.some((l) => l.countedQty === null)) throw new DomainError('COUNT_INCOMPLETE', 'Bazı satırlar henüz sayılmadı');
  const [updated] = await tx.update(stockCounts).set({ status: 'review', updatedBy: ctx.userId ?? null }).where(eq(stockCounts.id, countId)).returning();
  await indexDocument(tx, { type: 'stock_count', recordId: countId, docNo: count.docNo, status: 'review', origin: 'manual', title: `Sayım ${count.docNo}` });
  return updated!;
}

export type ApproveCountResult = { status: 'approved'; count: typeof stockCounts.$inferSelect } | { status: 'pending_approval'; approvalId: string; count: typeof stockCounts.$inferSelect };

/** Fark değeri eşiği aşmıyorsa doğrudan onaylar; aşıyorsa GM onay kuyruğuna düşer (approvals). */
export async function approveCount(tx: DbOrTx, countId: string, ctx: ActorCtx): Promise<ApproveCountResult> {
  const [count] = await tx.select().from(stockCounts).where(eq(stockCounts.id, countId)).for('update');
  if (!count) throw new NotFoundError('Sayım', countId);
  if (count.status !== 'review') throw new DomainError('COUNT_NOT_IN_REVIEW', `Sayım ${count.docNo} incelemede değil (durum: ${count.status})`);
  const varianceValue = D(count.varianceValue).abs();

  const finalizeApproved = async (approvedBy: string | null, approvedAt: Date) => {
    const [updated] = await tx.update(stockCounts).set({ status: 'approved', approvedBy, approvedAt, updatedBy: ctx.userId ?? null }).where(eq(stockCounts.id, countId)).returning();
    await indexDocument(tx, { type: 'stock_count', recordId: countId, docNo: count.docNo, status: 'approved', origin: 'manual', title: `Sayım ${count.docNo}` });
    return updated!;
  };

  if (varianceValue.lte(COUNT_APPROVAL_THRESHOLD)) {
    return { status: 'approved', count: await finalizeApproved(ctx.userId, new Date()) };
  }

  if (count.approvalId) {
    const [approval] = await tx.select().from(approvals).where(eq(approvals.id, count.approvalId)).limit(1);
    if (approval?.status === 'approved') {
      return { status: 'approved', count: await finalizeApproved(approval.decidedBy, approval.decidedAt ?? new Date()) };
    }
    if (approval?.status === 'rejected') throw new DomainError('COUNT_APPROVAL_REJECTED', 'Sayım farkı GM tarafından reddedildi', { approvalId: approval.id });
    return { status: 'pending_approval', approvalId: count.approvalId, count };
  }

  const [approval] = await tx
    .insert(approvals)
    .values({
      kind: 'count_variance', refTable: 'stock_counts', refId: countId, title: `Sayım farkı onayı — ${count.docNo}`,
      summary: `Toplam fark değeri ${toDb(varianceValue)} TL (eşik ${toDb(COUNT_APPROVAL_THRESHOLD)} TL) — Genel Müdür onayı gerekiyor`,
      payload: { varianceValue: toDb(varianceValue), countId, docNo: count.docNo }, status: 'pending', requestedBy: ctx.userId ?? null,
    })
    .returning();
  await tx.update(stockCounts).set({ approvalId: approval!.id, updatedBy: ctx.userId ?? null }).where(eq(stockCounts.id, countId));
  return { status: 'pending_approval', approvalId: approval!.id, count: { ...count, approvalId: approval!.id } };
}

/** Onaylı sayımı kaydeder: fark satırları için `count_gain`/`count_loss` hareketleri. */
export async function postCount(tx: DbOrTx, countId: string, ctx: ActorCtx): Promise<CountWithLines> {
  const [count] = await tx.select().from(stockCounts).where(eq(stockCounts.id, countId)).for('update');
  if (!count) throw new NotFoundError('Sayım', countId);
  if (count.status !== 'approved') throw new DomainError('COUNT_NOT_APPROVED', `Sayım ${count.docNo} onaylanmadı (durum: ${count.status})`);
  const lines = await tx.select().from(stockCountLines).where(eq(stockCountLines.countId, countId));
  const lossLoc = await getInventoryLossLocation(tx, count.warehouseId);
  const movedAt = new Date();

  for (const line of lines) {
    const variance = D(line.varianceQty);
    if (variance.isZero()) continue;
    const [product] = await tx.select().from(products).where(eq(products.id, line.productId)).limit(1);
    if (!product) continue;
    if (variance.gt(0)) {
      await postStockMove(tx, {
        kind: 'count_gain', productId: line.productId, lotId: line.lotId, fromLocationId: lossLoc.id, toLocationId: line.locationId,
        qty: variance, uomId: product.uomId, unitCost: D(line.unitCost), refType: 'stock_count', refId: countId, refLineId: line.id, refNo: count.docNo, origin: 'manual', movedAt,
      }, ctx);
    } else {
      await postStockMove(tx, {
        kind: 'count_loss', productId: line.productId, lotId: line.lotId, fromLocationId: line.locationId, toLocationId: lossLoc.id,
        qty: variance.abs(), uomId: product.uomId, unitCost: D(line.unitCost), refType: 'stock_count', refId: countId, refLineId: line.id, refNo: count.docNo, origin: 'manual', movedAt,
      }, ctx);
    }
    await tx.update(stockCountLines).set({ isApproved: true }).where(eq(stockCountLines.id, line.id));
  }

  const [updated] = await tx.update(stockCounts).set({ status: 'posted', postedAt: movedAt, updatedBy: ctx.userId ?? null }).where(eq(stockCounts.id, countId)).returning();
  await indexDocument(tx, { type: 'stock_count', recordId: countId, docNo: count.docNo, status: 'posted', origin: 'manual', title: `Sayım ${count.docNo}`, docDate: movedAt });
  const finalLines = await tx.select().from(stockCountLines).where(eq(stockCountLines.countId, countId));
  return { count: updated!, lines: finalLines };
}
