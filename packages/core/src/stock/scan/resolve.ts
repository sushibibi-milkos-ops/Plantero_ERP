import { eq, and, gt } from 'drizzle-orm';
import { products, productBarcodes, stockLots, stockQuants, locations, warehouses, type DbOrTx } from '@plantero/db';
import { D, toDb, round4, sum } from '../../money.js';

/**
 * `/depo/tara` tek giriş alanı çözümleyicisi. Klavye emülasyonlu el terminali varsayımı (kamera yok);
 * `code` barkod/QR/lot no/lokasyon kodu olabilir. Sıra: ürün barkodu → lot no (`LOT:` öneki de kabul) →
 * lokasyon kodu/barkodu (`LOC:` öneki de kabul).
 */

export type ScanResult =
  | { kind: 'product'; product: typeof products.$inferSelect; onHandQty: string; onHandValue: string }
  | { kind: 'lot'; lot: typeof stockLots.$inferSelect; product: typeof products.$inferSelect; quants: Array<{ locationId: string; locationCode: string; qty: string }> }
  | { kind: 'location'; location: typeof locations.$inferSelect; warehouseCode: string | null; quants: Array<{ productId: string; productName: string; lotId: string | null; lotNo: string | null; qty: string }> }
  | { kind: 'not_found'; code: string };

const stripPrefix = (code: string, prefix: string) => (code.toUpperCase().startsWith(prefix) ? code.slice(prefix.length) : code);

export async function resolveScan(db: DbOrTx, rawCode: string): Promise<ScanResult> {
  const code = rawCode.trim();
  if (!code) return { kind: 'not_found', code: rawCode };

  const lotCode = stripPrefix(code, 'LOT:');
  const locCode = stripPrefix(code, 'LOC:');

  // 1) Ürün barkodu (ana barkod ya da ek barkod)
  const [byBarcode] = await db.select().from(products).where(eq(products.barcode, code)).limit(1);
  const [byExtraBarcode] = byBarcode ? [] : await db.select({ p: products }).from(productBarcodes).innerJoin(products, eq(products.id, productBarcodes.productId)).where(eq(productBarcodes.barcode, code)).limit(1);
  const product = byBarcode ?? byExtraBarcode?.p;
  if (product) {
    const rows = await db.select({ qty: stockQuants.qty, lotCost: stockLots.unitCost, avgCost: products.averageCost }).from(stockQuants).innerJoin(products, eq(products.id, stockQuants.productId)).leftJoin(stockLots, eq(stockLots.id, stockQuants.lotId)).where(eq(stockQuants.productId, product.id));
    const qty = sum(rows.map((r) => r.qty));
    const value = round4(sum(rows.map((r) => D(r.qty).mul(D(r.lotCost ?? r.avgCost)))));
    return { kind: 'product', product, onHandQty: toDb(qty), onHandValue: toDb(value) };
  }

  // 2) Lot no
  const [lot] = await db.select().from(stockLots).where(eq(stockLots.lotNo, lotCode)).limit(1);
  if (lot) {
    const [lotProduct] = await db.select().from(products).where(eq(products.id, lot.productId)).limit(1);
    const quantRows = await db.select({ locationId: stockQuants.locationId, locationCode: locations.code, qty: stockQuants.qty }).from(stockQuants).innerJoin(locations, eq(locations.id, stockQuants.locationId)).where(and(eq(stockQuants.lotId, lot.id), gt(stockQuants.qty, '0')));
    return { kind: 'lot', lot, product: lotProduct!, quants: quantRows };
  }

  // 3) Lokasyon kodu / barkodu
  const [byCode] = await db.select().from(locations).where(eq(locations.code, locCode)).limit(1);
  const [byBarcodeLoc] = byCode ? [byCode] : await db.select().from(locations).where(eq(locations.barcode, code)).limit(1);
  const location = byCode ?? byBarcodeLoc;
  if (location) {
    const wh = location.warehouseId ? (await db.select({ code: warehouses.code }).from(warehouses).where(eq(warehouses.id, location.warehouseId)).limit(1))[0] : undefined;
    const quantRows = await db
      .select({ productId: stockQuants.productId, productName: products.name, lotId: stockQuants.lotId, lotNo: stockLots.lotNo, qty: stockQuants.qty })
      .from(stockQuants)
      .innerJoin(products, eq(products.id, stockQuants.productId))
      .leftJoin(stockLots, eq(stockLots.id, stockQuants.lotId))
      .where(and(eq(stockQuants.locationId, location.id), gt(stockQuants.qty, '0')));
    return { kind: 'location', location, warehouseCode: wh?.code ?? null, quants: quantRows.map((r) => ({ ...r, lotNo: r.lotNo ?? null })) };
  }

  return { kind: 'not_found', code: rawCode };
}
