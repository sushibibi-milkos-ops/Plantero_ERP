import { eq, and, gt } from 'drizzle-orm';
import { stockLots, stockQuants, products, locations, warehouses, uoms, type DbOrTx } from '@plantero/db';
import { toDb, sum } from '../money.js';
import { NotFoundError } from '../auth/errors.js';

/**
 * Etiket verisi — `/depo/etiket` A6 baskı sayfası bu verilerden QR (`qrcode` paketi, apps/web) üretir.
 * QR gövdesi metindir; ürün barkod tarayıcılarıyla da okunabilir olsun diye sade tutulur.
 */

export const lotQrPayload = (lotNo: string): string => `LOT:${lotNo}`;
export const locationQrPayload = (code: string): string => `LOC:${code}`;

export type LotLabelData = {
  lotId: string; lotNo: string; qrText: string; productName: string; sku: string; expiryDate: string | null;
  productionDate: string | null; qty: string; uom: string; status: string; supplierLotNo: string | null;
};

export async function getLotLabelData(db: DbOrTx, lotId: string): Promise<LotLabelData> {
  const [row] = await db
    .select({ lot: stockLots, productName: products.name, sku: products.sku, uom: uoms.code })
    .from(stockLots)
    .innerJoin(products, eq(products.id, stockLots.productId))
    .innerJoin(uoms, eq(uoms.id, products.uomId))
    .where(eq(stockLots.id, lotId))
    .limit(1);
  if (!row) throw new NotFoundError('Lot', lotId);
  const quants = await db.select({ qty: stockQuants.qty }).from(stockQuants).where(and(eq(stockQuants.lotId, lotId), gt(stockQuants.qty, '0')));
  const qty = sum(quants.map((q) => q.qty));
  return {
    lotId: row.lot.id, lotNo: row.lot.lotNo, qrText: lotQrPayload(row.lot.lotNo), productName: row.productName, sku: row.sku,
    expiryDate: row.lot.expiryDate, productionDate: row.lot.productionDate, qty: toDb(qty), uom: row.uom, status: row.lot.status,
    supplierLotNo: row.lot.supplierLotNo,
  };
}

export type LocationLabelData = {
  locationId: string; code: string; name: string; qrText: string; warehouseCode: string | null; itemCount: number;
};

export async function getLocationLabelData(db: DbOrTx, locationId: string): Promise<LocationLabelData> {
  const [loc] = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1);
  if (!loc) throw new NotFoundError('Lokasyon', locationId);
  const wh = loc.warehouseId ? (await db.select({ code: warehouses.code }).from(warehouses).where(eq(warehouses.id, loc.warehouseId)).limit(1))[0] : undefined;
  const items = await db.select({ id: stockQuants.id }).from(stockQuants).where(and(eq(stockQuants.locationId, locationId), gt(stockQuants.qty, '0')));
  return { locationId: loc.id, code: loc.code, name: loc.name, qrText: locationQrPayload(loc.code), warehouseCode: wh?.code ?? null, itemCount: items.length };
}
