import { and, eq, sql } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { workOrders, workOrderMaterials, workOrderConsumptions, workOrderEvents, productionLines, stockLots, stockQuants, products, type DbOrTx } from '@plantero/db';
import { D, toDb, round4, sum } from '../money.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import { postStockMove, pickFefo } from '../stock/ledger.js';
import { resolveWarehouseRoot } from '../stock/locations.js';
import { resolveScan } from '../stock/scan/resolve.js';
import type { ActorCtx } from '../types.js';

/**
 * Üretim tüketimi — operatör "Okut" ekranı. Her satır bir `work_order_consumptions` kaydı ve
 * `stock/ledger.postStockMove(kind:'consumption')` hareketi üretir (kaynak: malzemenin fiziksel
 * lokasyonu, hedef: hattın üretim [sanal] lokasyonu — WIP, 151.01).
 */

export type MaterialWithProduct = { material: typeof workOrderMaterials.$inferSelect; product: typeof products.$inferSelect };

async function loadOpen(tx: DbOrTx, workOrderId: string, lock = false) {
  const q = tx.select().from(workOrders).where(eq(workOrders.id, workOrderId));
  const [wo] = lock ? await q.for('update') : await q.limit(1);
  if (!wo) throw new NotFoundError('İş emri', workOrderId);
  if (!['in_progress', 'paused'].includes(wo.status)) {
    throw new DomainError('WO_NOT_ACTIVE', `İş emri ${wo.docNo} tüketim kabul etmiyor (durum: ${wo.status}); önce başlatın`, { status: wo.status });
  }
  return wo;
}

async function findMaterial(tx: DbOrTx, workOrderId: string, productId: string): Promise<MaterialWithProduct> {
  const [row] = await tx
    .select({ material: workOrderMaterials, product: products })
    .from(workOrderMaterials)
    .innerJoin(products, eq(products.id, workOrderMaterials.productId))
    .where(and(eq(workOrderMaterials.workOrderId, workOrderId), eq(workOrderMaterials.productId, productId), eq(workOrderMaterials.isByproduct, false)))
    .limit(1);
  if (!row) throw new DomainError('MATERIAL_NOT_IN_BOM', 'Bu ürün bu iş emrinin reçetesinde yok', { workOrderId, productId });
  return row;
}

async function locationsForLot(tx: DbOrTx, lotId: string): Promise<Array<{ locationId: string; qty: Decimal }>> {
  const rows = await tx.select({ locationId: stockQuants.locationId, qty: stockQuants.qty }).from(stockQuants).where(eq(stockQuants.lotId, lotId));
  return rows.map((r) => ({ locationId: r.locationId, qty: D(r.qty) })).filter((r) => r.qty.gt(0));
}

export type ConsumeResult = {
  consumption: typeof workOrderConsumptions.$inferSelect | null;
  material: typeof workOrderMaterials.$inferSelect;
  fefoWarning: boolean;
  /** FEFO uyarısında: sırada beklenen lot no (bilgilendirme) */
  expectedLotNo?: string | null;
};

/**
 * Tek bir lotu belirli miktarda tüketime yazar. `forceOverride` verilmezse ve okutulan lot FEFO
 * sırasındaki lot değilse `fefoWarning: true` ile (stok DEĞİŞMEDEN) döner — çağıran (UI) operatöre
 * "yine de kullan?" sorar ve `forceOverride: true` ile tekrar çağırır.
 */
export async function consumeLot(
  tx: DbOrTx,
  input: { workOrderId: string; lotId: string; qty: Decimal; forceOverride?: boolean; scannedBarcode?: string | null; asOf?: Date },
  ctx: ActorCtx,
): Promise<ConsumeResult> {
  const wo = await loadOpen(tx, input.workOrderId);
  const [lot] = await tx.select().from(stockLots).where(eq(stockLots.id, input.lotId)).limit(1);
  if (!lot) throw new NotFoundError('Lot', input.lotId);
  const { material } = await findMaterial(tx, wo.id, lot.productId);

  const qty = round4(D(input.qty));
  if (qty.lte(0)) throw new ValidationError('Miktar sıfırdan büyük olmalı');
  if (lot.status !== 'released') {
    throw new DomainError('LOT_NOT_RELEASED', `Lot ${lot.lotNo} serbest değil (${lot.status}); üretimde kullanılamaz`, { lotId: lot.id, status: lot.status });
  }

  if (!input.forceOverride) {
    const root = await resolveWarehouseRoot(tx, wo.warehouseId, (await tx.select({ type: products.type }).from(products).where(eq(products.id, lot.productId)).limit(1))[0]!.type);
    const [nextFefo] = await pickFefo(tx, { productId: lot.productId, qty: D('0.0001'), rootLocationId: root.id, allowStatuses: ['released'], allowPartial: true });
    if (nextFefo?.lotId && nextFefo.lotId !== lot.id) {
      return { fefoWarning: true, consumption: null, material, expectedLotNo: nextFefo.lotNo };
    }
  }

  const quants = await locationsForLot(tx, lot.id);
  const totalAvailable = sum(quants.map((q) => q.qty));
  if (totalAvailable.lt(qty)) throw new DomainError('INSUFFICIENT_STOCK', `Lot ${lot.lotNo}: eldeki ${toDb(totalAvailable)}, istenen ${toDb(qty)}`, { lotId: lot.id });

  let remaining = qty;
  let last: typeof workOrderConsumptions.$inferSelect | null = null;
  for (const q of quants.sort((a, b) => b.qty.minus(a.qty).toNumber())) {
    if (remaining.lte(0)) break;
    const take = Decimal.min(remaining, q.qty);
    last = await doConsume(tx, wo, material, { lotId: lot.id, locationId: q.locationId, qty: take }, ctx, input.scannedBarcode ?? null, input.asOf);
    remaining = remaining.minus(take);
  }

  return { consumption: last!, material, fefoWarning: false };
}

/** Okutulan barkod/lot no/QR koddan malzeme çözer ve tüketir (product barkodu → o ürünün sıradaki FEFO lotu). */
export async function scanConsume(
  tx: DbOrTx,
  input: { workOrderId: string; code: string; qty?: Decimal; forceOverride?: boolean },
  ctx: ActorCtx,
): Promise<ConsumeResult> {
  const wo = await loadOpen(tx, input.workOrderId);
  const scan = await resolveScan(tx, input.code);

  let lotId: string;
  if (scan.kind === 'lot') {
    lotId = scan.lot.id;
  } else if (scan.kind === 'product') {
    const { material } = await findMaterial(tx, wo.id, scan.product.id);
    const remaining = round4(D(material.plannedQty).minus(D(material.consumedQty)));
    const root = await resolveWarehouseRoot(tx, wo.warehouseId, scan.product.type);
    const [pick] = await pickFefo(tx, { productId: scan.product.id, qty: remaining.gt(0) ? remaining : D('0.0001'), rootLocationId: root.id, allowStatuses: ['released'], allowPartial: true });
    if (!pick?.lotId) throw new DomainError('NO_STOCK', `${scan.product.name}: serbest stok yok`, { productId: scan.product.id });
    lotId = pick.lotId;
  } else {
    throw new DomainError('SCAN_NOT_FOUND', `Barkod/lot bulunamadı: ${input.code}`, { code: input.code });
  }

  const [lot] = await tx.select().from(stockLots).where(eq(stockLots.id, lotId)).limit(1);
  if (!lot) throw new NotFoundError('Lot', lotId);
  const { material } = await findMaterial(tx, wo.id, lot.productId);
  const suggestedQty = input.qty ?? Decimal.max(D('0'), round4(D(material.plannedQty).minus(D(material.consumedQty))));
  const qty = suggestedQty.gt(0) ? suggestedQty : D(material.plannedQty);

  return consumeLot(tx, { workOrderId: wo.id, lotId, qty, forceOverride: input.forceOverride, scannedBarcode: input.code }, ctx);
}

/** Ortak tüketim yazımı: postStockMove + work_order_consumptions + malzeme/iş emri toplamları. */
async function doConsume(
  tx: DbOrTx,
  wo: typeof workOrders.$inferSelect,
  material: typeof workOrderMaterials.$inferSelect,
  pick: { lotId: string; locationId: string; qty: Decimal },
  ctx: ActorCtx,
  scannedBarcode: string | null,
  asOf?: Date,
): Promise<typeof workOrderConsumptions.$inferSelect> {
  const [line] = await tx.select().from(productionLines).where(eq(productionLines.id, wo.lineId)).limit(1);
  if (!line) throw new NotFoundError('Üretim hattı', wo.lineId);
  const movedAt = asOf ?? new Date();

  const res = await postStockMove(tx, {
    kind: 'consumption', productId: material.productId, lotId: pick.lotId, fromLocationId: pick.locationId, toLocationId: line.locationId,
    qty: pick.qty, uomId: material.uomId, refType: 'work_order', refId: wo.id, refLineId: material.id, refNo: wo.docNo, origin: wo.origin, note: null, movedAt,
  }, ctx);

  const [row] = await tx
    .insert(workOrderConsumptions)
    .values({
      workOrderId: wo.id, materialId: material.id, productId: material.productId, lotId: pick.lotId, fromLocationId: pick.locationId,
      qty: toDb(pick.qty), uomId: material.uomId, unitCost: toDb(res.unitCost), value: toDb(res.value), stockMoveId: res.moveId,
      scannedBarcode: scannedBarcode ?? null, scannedBy: ctx.userId ?? null, consumedAt: movedAt,
    })
    .returning();

  // SQL düzeyinde artırım: aynı işlem içinde birden çok kez çağrıldığında (birden çok lot/malzeme)
  // bellekteki eski `material`/`wo` anlık görüntüsüne göre yazmak önceki artışları ezer — DB'nin
  // güncel değeri üzerinden atomik artırım kullanılır (bkz. receipts.ts'teki receivedQty deseni).
  // totalCost da materialCost ile birlikte artırılır: I14(a) "total_cost = material_cost + overhead_cost"
  // iş emri henüz bitmemişken de (overhead_cost=0) geçerli olmalı — yalnızca bitirmede eklenmez.
  await tx.update(workOrderMaterials).set({ consumedQty: sql`${workOrderMaterials.consumedQty} + ${toDb(pick.qty)}::numeric` }).where(eq(workOrderMaterials.id, material.id));
  await tx.update(workOrders).set({
    materialCost: sql`${workOrders.materialCost} + ${toDb(res.value)}::numeric`,
    totalCost: sql`${workOrders.totalCost} + ${toDb(res.value)}::numeric`,
    updatedBy: ctx.userId ?? null,
  }).where(eq(workOrders.id, wo.id));

  await tx.insert(workOrderEvents).values({ workOrderId: wo.id, kind: 'scan', userId: ctx.userId ?? null, at: movedAt, payload: { productId: material.productId, lotId: pick.lotId, qty: toDb(pick.qty), barcode: scannedBarcode } });

  return row!;
}

/** "Reçeteye göre tamamla" — her malzemenin kalan planlanan miktarını FEFO ile otomatik tüketir. */
export async function autoConsumeRemaining(tx: DbOrTx, workOrderId: string, ctx: ActorCtx, opts: { asOf?: Date } = {}): Promise<ConsumeResult[]> {
  const wo = await loadOpen(tx, workOrderId, true);
  const materials = await tx.select({ material: workOrderMaterials, product: products }).from(workOrderMaterials).innerJoin(products, eq(products.id, workOrderMaterials.productId)).where(and(eq(workOrderMaterials.workOrderId, workOrderId), eq(workOrderMaterials.isByproduct, false)));

  const results: ConsumeResult[] = [];
  for (const { material, product } of materials) {
    const remaining = round4(D(material.plannedQty).minus(D(material.consumedQty)));
    if (remaining.lte(0)) continue;
    const root = await resolveWarehouseRoot(tx, wo.warehouseId, product.type);
    const picks = await pickFefo(tx, { productId: product.id, qty: remaining, rootLocationId: root.id, allowStatuses: ['released'], allowPartial: true });
    for (const pick of picks) {
      if (!pick.lotId || pick.qty.lte(0)) continue;
      const row = await doConsume(tx, wo, material, { lotId: pick.lotId, locationId: pick.locationId, qty: pick.qty }, ctx, null, opts.asOf);
      results.push({ consumption: row, material, fefoWarning: false });
    }
  }
  return results;
}
