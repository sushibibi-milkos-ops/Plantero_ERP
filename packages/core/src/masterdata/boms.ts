import { and, desc, eq, gt, inArray, ne } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import type { DbOrTx } from '@plantero/db';
import { boms, bomLines, products, stockLots, stockQuants, supplierProducts } from '@plantero/db';
import { D, ZERO, sum, toDb } from '../money.js';
import { NotFoundError, ValidationError } from '../auth/errors.js';

/**
 * Reçete (BOM) — versiyonlu. Aynı ürünün yalnızca bir aktif versiyonu olabilir;
 * `activateBom` diğerlerini otomatik arşivler. Maliyet toplaması (`rollupBomCost`)
 * canlıdır: lot ortalaması → averageCost → tercih edilen tedarikçi fiyatı → standardCost.
 */

export type BomLineInput = {
  productId: string;
  qty: string;
  uomId: string;
  scrapPct?: string;
  isByproduct?: boolean;
  sequence?: number;
  note?: string | null;
};

export type CreateBomVersionInput = {
  productId: string;
  name?: string | null;
  outputQty?: string;
  outputUomId?: string | null;
  expectedYieldPct?: string;
  cycleMinutes?: number | null;
  defaultLineId?: string | null;
  overheadPerBatch?: string;
  overheadPerUnit?: string;
  note?: string | null;
  lines: BomLineInput[];
};

/** Ürünün mevcut en yüksek versiyon numarasının bir fazlasıyla yeni bir taslak BOM oluşturur. */
export async function createBomVersion(tx: DbOrTx, input: CreateBomVersionInput): Promise<typeof boms.$inferSelect> {
  if (input.lines.length === 0) throw new ValidationError('Reçetede en az bir satır olmalı');

  const [product] = await tx.select({ sku: products.sku, uomId: products.uomId }).from(products).where(eq(products.id, input.productId)).limit(1);
  if (!product) throw new NotFoundError('Ürün', input.productId);

  const existing = await tx.select({ version: boms.version }).from(boms).where(eq(boms.productId, input.productId)).orderBy(desc(boms.version)).limit(1);
  const version = (existing[0]?.version ?? 0) + 1;

  const [bom] = await tx
    .insert(boms)
    .values({
      code: `BOM-${product.sku}-v${version}`,
      productId: input.productId,
      version,
      name: input.name ?? null,
      status: 'draft',
      outputQty: input.outputQty ?? '1',
      outputUomId: input.outputUomId ?? product.uomId,
      expectedYieldPct: input.expectedYieldPct ?? '100',
      cycleMinutes: input.cycleMinutes ?? null,
      defaultLineId: input.defaultLineId ?? null,
      overheadPerBatch: input.overheadPerBatch ?? '0',
      overheadPerUnit: input.overheadPerUnit ?? '0',
      note: input.note ?? null,
    })
    .returning();

  await tx.insert(bomLines).values(
    input.lines.map((l, i) => ({
      bomId: bom!.id,
      productId: l.productId,
      qty: l.qty,
      uomId: l.uomId,
      scrapPct: l.scrapPct ?? '0',
      isByproduct: l.isByproduct ?? false,
      sequence: l.sequence ?? (i + 1) * 10,
      note: l.note ?? null,
    })),
  );

  return bom!;
}

/** Var olan bir BOM'un satırlarını/başlığını değiştirir (yalnızca `draft` durumundayken). */
export async function updateBomDraft(
  tx: DbOrTx,
  bomId: string,
  input: Partial<Omit<CreateBomVersionInput, 'productId'>>,
): Promise<typeof boms.$inferSelect> {
  const [bom] = await tx.select().from(boms).where(eq(boms.id, bomId)).limit(1);
  if (!bom) throw new NotFoundError('Reçete', bomId);
  if (bom.status !== 'draft') throw new ValidationError('Yalnızca taslak reçeteler düzenlenebilir; yeni versiyon açın.');

  const set: Partial<typeof boms.$inferInsert> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.outputQty !== undefined) set.outputQty = input.outputQty;
  if (input.outputUomId !== undefined) set.outputUomId = input.outputUomId;
  if (input.expectedYieldPct !== undefined) set.expectedYieldPct = input.expectedYieldPct;
  if (input.cycleMinutes !== undefined) set.cycleMinutes = input.cycleMinutes;
  if (input.defaultLineId !== undefined) set.defaultLineId = input.defaultLineId;
  if (input.overheadPerBatch !== undefined) set.overheadPerBatch = input.overheadPerBatch;
  if (input.overheadPerUnit !== undefined) set.overheadPerUnit = input.overheadPerUnit;
  if (input.note !== undefined) set.note = input.note;
  if (Object.keys(set).length) await tx.update(boms).set(set).where(eq(boms.id, bomId));

  if (input.lines) {
    if (input.lines.length === 0) throw new ValidationError('Reçetede en az bir satır olmalı');
    await tx.delete(bomLines).where(eq(bomLines.bomId, bomId));
    await tx.insert(bomLines).values(
      input.lines.map((l, i) => ({
        bomId,
        productId: l.productId,
        qty: l.qty,
        uomId: l.uomId,
        scrapPct: l.scrapPct ?? '0',
        isByproduct: l.isByproduct ?? false,
        sequence: l.sequence ?? (i + 1) * 10,
        note: l.note ?? null,
      })),
    );
  }

  const [row] = await tx.select().from(boms).where(eq(boms.id, bomId)).limit(1);
  return row!;
}

/** Bu BOM'u aktifleştirir; aynı ürünün diğer aktif versiyonlarını arşivler. */
export async function activateBom(tx: DbOrTx, bomId: string): Promise<typeof boms.$inferSelect> {
  const [bom] = await tx.select().from(boms).where(eq(boms.id, bomId)).limit(1);
  if (!bom) throw new NotFoundError('Reçete', bomId);
  await tx.update(boms).set({ status: 'archived' }).where(and(eq(boms.productId, bom.productId), eq(boms.status, 'active'), ne(boms.id, bomId)));
  const [row] = await tx.update(boms).set({ status: 'active' }).where(eq(boms.id, bomId)).returning();
  return row!;
}

export async function archiveBom(tx: DbOrTx, bomId: string): Promise<typeof boms.$inferSelect> {
  const [row] = await tx.update(boms).set({ status: 'archived' }).where(eq(boms.id, bomId)).returning();
  if (!row) throw new NotFoundError('Reçete', bomId);
  return row;
}

/** `qty` birim mamul üretmek için gereken satır miktarlarını (fire dahil) hesaplar. */
export async function explodeBom(
  tx: DbOrTx,
  bomId: string,
  qty: Decimal,
): Promise<Array<{ line: typeof bomLines.$inferSelect; requiredQty: Decimal }>> {
  const [bom] = await tx.select().from(boms).where(eq(boms.id, bomId)).limit(1);
  if (!bom) throw new NotFoundError('Reçete', bomId);
  const lines = await tx.select().from(bomLines).where(eq(bomLines.bomId, bomId)).orderBy(bomLines.sequence);
  const scale = qty.div(D(bom.outputQty));
  return lines.map((line) => {
    const base = D(line.qty).mul(scale);
    const withScrap = line.isByproduct ? base : base.mul(D(1).plus(D(line.scrapPct).div(100)));
    return { line, requiredQty: withScrap };
  });
}

/** Bileşen birim maliyeti: eldeki stok lot ortalaması → averageCost → tercih edilen tedarikçi fiyatı → standardCost → 0. */
export async function resolveComponentUnitCost(tx: DbOrTx, productId: string): Promise<{ unitCost: Decimal; source: 'lot_avg' | 'average_cost' | 'supplier_price' | 'standard_cost' | 'none' }> {
  const onHand = await tx
    .select({ qty: stockQuants.qty, unitCost: stockLots.unitCost })
    .from(stockQuants)
    .innerJoin(stockLots, eq(stockLots.id, stockQuants.lotId))
    .where(and(eq(stockQuants.productId, productId), gt(stockQuants.qty, '0')));
  if (onHand.length) {
    const totalQty = sum(onHand.map((r) => r.qty));
    if (!totalQty.isZero()) {
      const totalValue = onHand.reduce((acc, r) => acc.plus(D(r.qty).mul(D(r.unitCost))), ZERO);
      return { unitCost: totalValue.div(totalQty), source: 'lot_avg' };
    }
  }

  const [p] = await tx.select({ averageCost: products.averageCost, standardCost: products.standardCost }).from(products).where(eq(products.id, productId)).limit(1);
  if (p && !D(p.averageCost).isZero()) return { unitCost: D(p.averageCost), source: 'average_cost' };

  const [sp] = await tx
    .select({ price: supplierProducts.price })
    .from(supplierProducts)
    .where(and(eq(supplierProducts.productId, productId), eq(supplierProducts.isPreferred, true)))
    .limit(1);
  if (sp) return { unitCost: D(sp.price), source: 'supplier_price' };

  if (p && !D(p.standardCost).isZero()) return { unitCost: D(p.standardCost), source: 'standard_cost' };
  return { unitCost: ZERO, source: 'none' };
}

type ComponentCost = { unitCost: Decimal; source: 'lot_avg' | 'average_cost' | 'supplier_price' | 'standard_cost' | 'none' };

/**
 * `resolveComponentUnitCost`'un toplu (N+1'siz) hâli: bir reçetenin tüm satırları için tek seferde
 * en fazla 3 sorguda maliyet çözer (satır sayısı × 3 sorgu yerine). `rollupBomCost` bunu kullanır;
 * tek ürün için hâlâ `resolveComponentUnitCost` çağrılabilir (ör. tekil tahminler).
 */
async function resolveComponentUnitCosts(tx: DbOrTx, productIds: string[]): Promise<Map<string, ComponentCost>> {
  const ids = Array.from(new Set(productIds));
  const result = new Map<string, ComponentCost>();
  if (ids.length === 0) return result;

  const onHandRows = await tx
    .select({ productId: stockQuants.productId, qty: stockQuants.qty, unitCost: stockLots.unitCost })
    .from(stockQuants)
    .innerJoin(stockLots, eq(stockLots.id, stockQuants.lotId))
    .where(and(inArray(stockQuants.productId, ids), gt(stockQuants.qty, '0')));
  const onHandByProduct = new Map<string, { qty: Decimal; value: Decimal }>();
  for (const r of onHandRows) {
    const cur = onHandByProduct.get(r.productId) ?? { qty: ZERO, value: ZERO };
    cur.qty = cur.qty.plus(D(r.qty));
    cur.value = cur.value.plus(D(r.qty).mul(D(r.unitCost)));
    onHandByProduct.set(r.productId, cur);
  }
  for (const [productId, oh] of onHandByProduct) {
    if (!oh.qty.isZero()) result.set(productId, { unitCost: oh.value.div(oh.qty), source: 'lot_avg' });
  }

  const remaining = ids.filter((id) => !result.has(id));
  const productRows = remaining.length
    ? await tx.select({ id: products.id, averageCost: products.averageCost, standardCost: products.standardCost }).from(products).where(inArray(products.id, remaining))
    : [];
  const productById = new Map(productRows.map((p) => [p.id, p]));
  for (const id of remaining) {
    const p = productById.get(id);
    if (p && !D(p.averageCost).isZero()) result.set(id, { unitCost: D(p.averageCost), source: 'average_cost' });
  }

  const needSupplier = remaining.filter((id) => !result.has(id));
  const supplierRows = needSupplier.length
    ? await tx
        .select({ productId: supplierProducts.productId, price: supplierProducts.price })
        .from(supplierProducts)
        .where(and(inArray(supplierProducts.productId, needSupplier), eq(supplierProducts.isPreferred, true)))
    : [];
  const supplierByProduct = new Map<string, string>();
  for (const r of supplierRows) if (!supplierByProduct.has(r.productId)) supplierByProduct.set(r.productId, r.price);
  for (const id of needSupplier) {
    const price = supplierByProduct.get(id);
    if (price !== undefined) result.set(id, { unitCost: D(price), source: 'supplier_price' });
  }

  for (const id of ids) {
    if (result.has(id)) continue;
    const p = productById.get(id);
    if (p && !D(p.standardCost).isZero()) result.set(id, { unitCost: D(p.standardCost), source: 'standard_cost' });
    else result.set(id, { unitCost: ZERO, source: 'none' });
  }
  return result;
}

export type BomCostLine = {
  lineId: string;
  productId: string;
  sku: string;
  name: string;
  qty: string;
  uomId: string;
  isByproduct: boolean;
  unitCost: string;
  costSource: string;
  lineCost: string;
};

export type BomCostRollup = {
  bomId: string;
  lines: BomCostLine[];
  materialCost: string;
  overheadCost: string;
  effectiveOutputQty: string;
  unitCost: string;
};

/** Reçetenin tam maliyet toplaması: satır maliyetleri + genel gider → verim düzeltmeli birim maliyet. */
export async function rollupBomCost(tx: DbOrTx, bomId: string): Promise<BomCostRollup> {
  const [bom] = await tx.select().from(boms).where(eq(boms.id, bomId)).limit(1);
  if (!bom) throw new NotFoundError('Reçete', bomId);
  const rows = await tx
    .select({ line: bomLines, sku: products.sku, name: products.name })
    .from(bomLines)
    .innerJoin(products, eq(products.id, bomLines.productId))
    .where(eq(bomLines.bomId, bomId))
    .orderBy(bomLines.sequence);

  const costs = await resolveComponentUnitCosts(tx, rows.map((r) => r.line.productId));

  let materialCost = ZERO;
  const lines: BomCostLine[] = [];
  for (const r of rows) {
    const { unitCost, source } = costs.get(r.line.productId) ?? { unitCost: ZERO, source: 'none' as const };
    const consumedQty = D(r.line.qty).mul(D(1).plus(D(r.line.scrapPct).div(100)));
    const lineCost = consumedQty.mul(unitCost);
    materialCost = r.line.isByproduct ? materialCost.minus(D(r.line.qty).mul(unitCost)) : materialCost.plus(lineCost);
    lines.push({
      lineId: r.line.id,
      productId: r.line.productId,
      sku: r.sku,
      name: r.name,
      qty: r.line.qty,
      uomId: r.line.uomId,
      isByproduct: r.line.isByproduct,
      unitCost: toDb(unitCost),
      costSource: source,
      lineCost: toDb(r.line.isByproduct ? D(r.line.qty).mul(unitCost).neg() : lineCost),
    });
  }

  const outputQty = D(bom.outputQty);
  const yieldRatio = D(bom.expectedYieldPct).div(100);
  const effectiveOutputQty = outputQty.mul(yieldRatio.isZero() ? D(1) : yieldRatio);
  const overheadCost = D(bom.overheadPerBatch);
  const perUnitOverhead = D(bom.overheadPerUnit);
  const unitCost = effectiveOutputQty.isZero() ? ZERO : materialCost.plus(overheadCost).div(effectiveOutputQty).plus(perUnitOverhead);

  return {
    bomId,
    lines,
    materialCost: toDb(materialCost),
    overheadCost: toDb(overheadCost.plus(perUnitOverhead.mul(effectiveOutputQty))),
    effectiveOutputQty: toDb(effectiveOutputQty),
    unitCost: toDb(unitCost),
  };
}
