import { eq, and, gt, isNotNull, sql } from 'drizzle-orm';
import { stockQuants, stockLots, products, locations, warehouses, scraps, type DbOrTx } from '@plantero/db';
import { D, toDb, round4, sum, ZERO } from '../money.js';
import { businessDate, addDays } from '../dates.js';
import { nextDocNo } from '../sequences.js';
import { NotFoundError, ValidationError } from '../auth/errors.js';
import { postStockMove } from './ledger.js';
import { getScrapLocation } from './locations.js';
import type { ActorCtx } from '../types.js';

/** SKT panosu — `stock/ledger.fefoDates`teki 30/60/90 kuralı ile aynı eşikler (`components/expiry-badge.tsx`). */

export type ExpiryBucket = 'expired' | 'critical' | 'warning' | 'notice';

export type ExpiryRow = {
  quantId: string; productId: string; productName: string; sku: string; lotId: string; lotNo: string;
  locationId: string; locationCode: string; warehouseId: string | null; warehouseCode: string | null;
  qty: string; unitCost: string; value: string; expiryDate: string; daysLeft: number; bucket: ExpiryBucket;
};

export type ExpiryBuckets = { rows: ExpiryRow[]; totals: Record<ExpiryBucket, { count: number; qtyValue: string }> };

function bucketOf(daysLeft: number): ExpiryBucket {
  if (daysLeft < 0) return 'expired';
  if (daysLeft < 30) return 'critical';
  if (daysLeft < 60) return 'warning';
  return 'notice'; // < 90 (getExpiryBuckets zaten yalnızca <90 gün olanları döner)
}

/** SKT'si 90 gün içinde dolan (veya geçmiş) tüm lotları depo bazında listeler; 4 kovaya ayırır. */
export async function getExpiryBuckets(db: DbOrTx, opts: { warehouseId?: string; asOf?: Date } = {}): Promise<ExpiryBuckets> {
  const asOf = opts.asOf ?? new Date();
  const horizon = addDays(businessDate(asOf), 90);
  const conds = [gt(stockQuants.qty, '0'), isNotNull(stockLots.expiryDate), sql`${stockLots.expiryDate} <= ${horizon}`];
  if (opts.warehouseId) conds.push(eq(locations.warehouseId, opts.warehouseId));

  const rows = await db
    .select({
      quantId: stockQuants.id, productId: products.id, productName: products.name, sku: products.sku,
      lotId: stockLots.id, lotNo: stockLots.lotNo, locationId: locations.id, locationCode: locations.code,
      warehouseId: locations.warehouseId, warehouseCode: warehouses.code,
      qty: stockQuants.qty, unitCost: stockLots.unitCost, expiryDate: stockLots.expiryDate,
    })
    .from(stockQuants)
    .innerJoin(products, eq(products.id, stockQuants.productId))
    .innerJoin(stockLots, eq(stockLots.id, stockQuants.lotId))
    .innerJoin(locations, eq(locations.id, stockQuants.locationId))
    .leftJoin(warehouses, eq(warehouses.id, locations.warehouseId))
    .where(and(...conds))
    .orderBy(stockLots.expiryDate);

  const todayIdx = Date.parse(`${businessDate(asOf)}T00:00:00Z`);
  const out: ExpiryRow[] = rows
    .filter((r) => r.expiryDate !== null)
    .map((r) => {
      const daysLeft = Math.round((Date.parse(`${r.expiryDate}T00:00:00Z`) - todayIdx) / 86_400_000);
      const value = round4(D(r.qty).mul(D(r.unitCost)));
      return {
        quantId: r.quantId, productId: r.productId, productName: r.productName, sku: r.sku, lotId: r.lotId, lotNo: r.lotNo,
        locationId: r.locationId, locationCode: r.locationCode, warehouseId: r.warehouseId, warehouseCode: r.warehouseCode ?? null,
        qty: r.qty, unitCost: r.unitCost, value: toDb(value), expiryDate: r.expiryDate!, daysLeft, bucket: bucketOf(daysLeft),
      };
    });

  const totals = { expired: { count: 0, qtyValue: '0.0000' }, critical: { count: 0, qtyValue: '0.0000' }, warning: { count: 0, qtyValue: '0.0000' }, notice: { count: 0, qtyValue: '0.0000' } } as ExpiryBuckets['totals'];
  for (const b of ['expired', 'critical', 'warning', 'notice'] as ExpiryBucket[]) {
    const inBucket = out.filter((r) => r.bucket === b);
    totals[b] = { count: inBucket.length, qtyValue: toDb(sum(inBucket.map((r) => D(r.value)))) };
  }
  return { rows: out, totals };
}

/** Bir lotu (verilen lokasyondaki ya da tüm eldeki) hurdaya ayırır — `scrap` hareketi + lot durumu `expired`. */
export async function scrapExpired(tx: DbOrTx, input: { lotId: string; locationId?: string | null; reason?: string }, ctx: ActorCtx): Promise<{ movedQty: string }> {
  const [lot] = await tx.select().from(stockLots).where(eq(stockLots.id, input.lotId)).limit(1);
  if (!lot) throw new NotFoundError('Lot', input.lotId);
  const conds = [eq(stockQuants.lotId, input.lotId), gt(stockQuants.qty, '0')];
  if (input.locationId) conds.push(eq(stockQuants.locationId, input.locationId));
  const quants = await tx.select({ id: stockQuants.id, locationId: stockQuants.locationId, qty: stockQuants.qty }).from(stockQuants).innerJoin(locations, eq(locations.id, stockQuants.locationId)).where(and(...conds));
  if (!quants.length) throw new ValidationError('Bu lot için hurdaya ayrılacak stok bulunamadı');

  const [product] = await tx.select().from(products).where(eq(products.id, lot.productId)).limit(1);
  if (!product) throw new NotFoundError('Ürün', lot.productId);
  const movedAt = new Date();
  let total = ZERO;
  const scrapLocByWarehouse = new Map<string, string>();

  for (const q of quants) {
    const [loc] = await tx.select().from(locations).where(eq(locations.id, q.locationId)).limit(1);
    const warehouseId = loc?.warehouseId;
    if (!warehouseId) continue;
    let scrapLocId = scrapLocByWarehouse.get(warehouseId);
    if (!scrapLocId) {
      scrapLocId = (await getScrapLocation(tx, warehouseId)).id;
      scrapLocByWarehouse.set(warehouseId, scrapLocId);
    }
    const scrapDocNo = await nextDocNo(tx, 'SCR', movedAt);
    const [scrapDoc] = await tx
      .insert(scraps)
      .values({ docNo: scrapDocNo, productId: lot.productId, lotId: lot.id, fromLocationId: q.locationId, qty: q.qty, uomId: lot.uomId, reason: 'expired', unitCost: lot.unitCost, status: 'done', doneAt: movedAt, note: input.reason ?? 'SKT geçti', createdBy: ctx.userId ?? null })
      .returning();
    await postStockMove(tx, {
      kind: 'scrap', productId: lot.productId, lotId: lot.id, fromLocationId: q.locationId, toLocationId: scrapLocId,
      qty: D(q.qty), uomId: lot.uomId, refType: 'scrap', refId: scrapDoc!.id, refNo: scrapDoc!.docNo, origin: 'manual',
      note: input.reason ?? 'SKT geçti', movedAt,
    }, ctx);
    total = total.plus(D(q.qty));
  }

  await tx.update(stockLots).set({ status: 'expired', updatedBy: ctx.userId ?? null }).where(eq(stockLots.id, lot.id));
  return { movedQty: toDb(total) };
}
