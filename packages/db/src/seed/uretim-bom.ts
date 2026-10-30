import { and, eq, ne, sql } from 'drizzle-orm';
import Decimal from 'decimal.js';
import type { DbOrTx } from '../client.js';
import { products, productCategories, uoms, partners, supplierProducts, productionLines, boms } from '../schema/index.js';
import { SYSTEM_ACTOR, writeAudit, createBomVersion, activateBom, rollupBomCost } from '@plantero/core';
import { parseUretimBom } from '../import/uretim-bom.js';
import { buildBomPlan, type PlanBom, type PlanItem, type UretimBomPlan } from '../import/uretim-bom-plan.js';
import { log, readImportFile, type SeedSummary } from './_helpers.js';

/**
 * Üretim Ana Excel'inden (data/import/Plantero_Uretim_Ana_Excel.xlsx) çok seviyeli ürün ağacı aktarımı.
 *
 *  1. Excel ayrıştırılır (import/uretim-bom.ts), mevcut ana veriyle eşlenip plana çevrilir (import/uretim-bom-plan.ts)
 *  2. Excel'de karşılığı olmayan kalemler yeni SKU olarak açılır: hammadde T=3, ambalaj T=4, yarı mamul T=2
 *     (ürün adı Excel'deki gibi; tedarikçi partner yoksa tedarikçi olarak açılır; fiyat TL → standardCost)
 *  3. Her mamul / yarı mamul için core BOM servisleriyle (createBomVersion + activateBom) aktif reçete,
 *     `boms.defaultLineId` ZORUNLU (docs/PRODUCTION-LINES.md hat ataması)
 *
 * Masterdata adımından SONRA, accounting/stock/production adımlarından ÖNCE çalışır. Idempotent: bir ürünün
 * zaten `[uretim-bom]` işaretli aktif reçetesi varsa dokunulmaz. Eski (uydurma) seed reçeteleri varsa yeni
 * reçete aktifleşirken arşivlenir.
 */

const MARK = '[uretim-bom]';

async function ensureCategoryPath(tx: DbOrTx, cache: Map<string, string>, c1: string, c2: string, c3: string): Promise<string> {
  async function ensure(name: string, level: 1 | 2 | 3, parentPath: string | null): Promise<string> {
    const path = parentPath ? `${parentPath}/${name}` : name;
    const cached = cache.get(path);
    if (cached) return cached;
    const parentId = parentPath ? (cache.get(parentPath) ?? null) : null;
    await tx.insert(productCategories).values({ name, level, path, parentId }).onConflictDoNothing({ target: productCategories.path });
    const [row] = await tx.select({ id: productCategories.id }).from(productCategories).where(eq(productCategories.path, path)).limit(1);
    if (!row) throw new Error(`Kategori oluşturulamadı: ${path}`);
    cache.set(path, row.id);
    return row.id;
  }
  await ensure(c1, 1, null);
  await ensure(c2, 2, c1);
  return ensure(c3, 3, `${c1}/${c2}`);
}

async function createItems(tx: DbOrTx, items: PlanItem[], uomIds: Map<string, string>): Promise<number> {
  const cache = new Map<string, string>();
  let created = 0;
  for (const it of items) {
    const [existing] = await tx.select({ id: products.id }).from(products).where(eq(products.sku, it.sku)).limit(1);
    if (existing) continue; // ürün adı/barkod kuralı: mevcutsa dokunma
    const uomId = uomIds.get(it.uom);
    if (!uomId) throw new Error(`Birim bulunamadı: ${it.uom}`);
    const categoryId = await ensureCategoryPath(tx, cache, it.category1, it.category2, it.category3);
    const isYm = it.type === 'semi_finished';
    const [row] = await tx
      .insert(products)
      .values({
        sku: it.sku,
        shortCode: it.shortCode,
        name: it.name,
        type: it.type,
        status: 'active',
        categoryId,
        category1: it.category1,
        category2: it.category2,
        category3: it.category3,
        uomId,
        isLotTracked: true,
        isPurchasable: !isYm,
        isSellable: false,
        isManufactured: isYm,
        shelfLifeDays: it.shelfLifeDays,
        vatRate: isYm ? '1' : '20',
        purchaseVatRate: '20',
        standardCost: it.standardCostTL !== null ? new Decimal(it.standardCostTL).toFixed(4) : '0',
        note: it.note,
      })
      .returning({ id: products.id });
    await writeAudit(tx, { action: 'create', tableName: 'products', recordId: row!.id, summary: `Üretim Excel importu: ${it.sku} ${it.name} oluşturuldu` }, SYSTEM_ACTOR);
    created++;
  }
  return created;
}

/** Yeni kalemlerin Excel tedarikçileri: partner yoksa tedarikçi olarak aç, supplier_products (tercihli) satırını yaz. */
async function createSuppliers(tx: DbOrTx, items: PlanItem[]): Promise<{ partners: number; links: number }> {
  const existing = await tx.select({ id: partners.id, code: partners.code, name: partners.name }).from(partners);
  const fold = (s: string): string => s.toLocaleLowerCase('tr-TR').replace(/[^a-z0-9ğüşıöç]+/g, ' ').trim();
  const byName = new Map(existing.map((p) => [fold(p.name), p.id]));
  let maxNo = existing.filter((p) => /^S-\d+$/.test(p.code)).reduce((m, p) => Math.max(m, Number(p.code.slice(2))), 0);

  let newPartners = 0;
  let links = 0;
  for (const it of items) {
    if (!it.supplier) continue;
    const key = fold(it.supplier);
    let partnerId = byName.get(key) ?? [...byName.entries()].find(([k]) => k.includes(key) || key.includes(k))?.[1];
    if (!partnerId) {
      maxNo++;
      const code = `S-${String(maxNo).padStart(6, '0')}`;
      const [row] = await tx
        .insert(partners)
        .values({
          code, name: it.supplier, kind: 'supplier', country: 'TR', currency: 'TRY', paymentTermKind: 'days', paymentTermDays: 30,
          supplierLeadTimeDays: 14, isPurchaseWhitelisted: false,
        })
        .returning({ id: partners.id });
      partnerId = row!.id;
      byName.set(key, partnerId);
      newPartners++;
      await writeAudit(tx, { action: 'create', tableName: 'partners', recordId: partnerId, summary: `Üretim Excel importu: tedarikçi ${code} ${it.supplier} oluşturuldu` }, SYSTEM_ACTOR);
    }
    if (it.standardCostTL === null) continue;
    const [prod] = await tx.select({ id: products.id }).from(products).where(eq(products.sku, it.sku)).limit(1);
    if (!prod) continue;
    await tx
      .insert(supplierProducts)
      .values({ partnerId, productId: prod.id, price: new Decimal(it.standardCostTL).toFixed(4), currency: 'TRY', leadTimeDays: 14, isPreferred: true })
      .onConflictDoNothing({ target: [supplierProducts.partnerId, supplierProducts.productId] });
    links++;
  }
  return { partners: newPartners, links };
}

/** Mevcut SKU'lar için Excel fiyatı (yalnızca standardCost 0 ise). */
async function applyPriceUpdates(tx: DbOrTx, updates: UretimBomPlan['priceUpdates']): Promise<number> {
  let n = 0;
  for (const u of updates) {
    const res = await tx
      .update(products)
      .set({ standardCost: new Decimal(u.priceTL).toFixed(4) })
      .where(and(eq(products.sku, u.sku), eq(products.standardCost, '0.0000')))
      .returning({ id: products.id });
    n += res.length;
  }
  return n;
}

const BOM_ORDER: Array<(b: PlanBom) => boolean> = [
  (b) => b.kind === 'yarimamul',
  (b) => b.kind === 'mamul' && b.origin === 'excel',
  (b) => b.origin === 'placeholder',
  (b) => b.origin === 'derived',
];

async function createBoms(tx: DbOrTx, plan: UretimBomPlan, uomIds: Map<string, string>): Promise<{ created: number; lines: number; skipped: number; superseded: number }> {
  const lineRows = await tx.select({ id: productionLines.id, code: productionLines.code }).from(productionLines);
  const lineIdByCode = new Map(lineRows.map((l) => [l.code, l.id]));
  const prods = await tx.select({ id: products.id, sku: products.sku, uomId: products.uomId }).from(products);
  const bySku = new Map(prods.map((p) => [p.sku, p]));

  const ordered = BOM_ORDER.flatMap((pred) => plan.boms.filter(pred));
  let created = 0;
  let lines = 0;
  let skipped = 0;
  let superseded = 0;

  for (const b of ordered) {
    const product = bySku.get(b.productSku);
    if (!product) throw new Error(`seed:uretim-bom — ürün bulunamadı: ${b.productSku}`);
    const lineId = lineIdByCode.get(b.lineCode);
    if (!lineId) throw new Error(`seed:uretim-bom — hat bulunamadı: ${b.lineCode}`);

    const existingBoms = await tx.select({ id: boms.id, status: boms.status, note: boms.note }).from(boms).where(and(eq(boms.productId, product.id), ne(boms.status, 'archived')));
    if (existingBoms.some((e) => (e.note ?? '').startsWith(MARK) && e.status === 'active')) {
      skipped++;
      continue; // idempotent
    }
    superseded += existingBoms.length;

    const bomLines = b.lines.map((l) => {
      const comp = bySku.get(l.sku);
      if (!comp) throw new Error(`seed:uretim-bom — bileşen bulunamadı: ${l.sku} (${b.productSku})`);
      const uomId = uomIds.get(l.uom);
      if (!uomId) throw new Error(`Birim bulunamadı: ${l.uom}`);
      return { productId: comp.id, qty: l.qty, uomId, note: l.note ?? null };
    });

    const bom = await createBomVersion(tx, {
      productId: product.id,
      name: b.name,
      outputQty: b.outputQty,
      outputUomId: product.uomId,
      expectedYieldPct: b.expectedYieldPct,
      cycleMinutes: b.cycleMinutes,
      defaultLineId: lineId,
      overheadPerBatch: b.overheadPerBatch,
      overheadPerUnit: b.overheadPerUnit,
      note: `${b.note} Kaynak: ${b.source}.`,
      lines: bomLines,
    });
    await activateBom(tx, bom.id);
    await writeAudit(tx, { action: 'create', tableName: 'boms', recordId: bom.id, summary: `Üretim Excel importu: ${bom.code} aktif reçete (${b.kind}, ${b.lineCode}, ${b.origin})` }, SYSTEM_ACTOR);

    // Standart maliyet = reçete roll-up (bileşen stokları henüz yok → tedarikçi fiyatı / standart maliyet);
    // üst seviye reçetelerin (çoklu paket, set, mamul → yarı mamul) maliyet zincirini besler.
    const roll = await rollupBomCost(tx, bom.id);
    if (!new Decimal(roll.unitCost).isZero()) {
      await tx.update(products).set({ standardCost: roll.unitCost }).where(and(eq(products.id, product.id), eq(products.standardCost, '0.0000')));
    }
    created++;
    lines += bomLines.length;
  }
  return { created, lines, skipped, superseded };
}

/** Plan (saf) + DB yazımı. Test ve raporlama için plan ayrıca döndürülür. */
export async function loadUretimBomPlan(tx: DbOrTx): Promise<UretimBomPlan> {
  const buffer = await readImportFile('Plantero_Uretim_Ana_Excel.xlsx');
  const parsed = await parseUretimBom(buffer);
  // yalnızca 9 haneli konuşan kodlu gerçek ana veri (test/fikstür kayıtları kapsam dışı)
  const rows = await tx
    .select({ sku: products.sku, name: products.name, type: products.type, packQty: products.packQty, isManufactured: products.isManufactured, standardCost: products.standardCost })
    .from(products)
    .where(sql`${products.sku} ~ '^[0-9]{9}$'`);
  return buildBomPlan(parsed, rows);
}

export async function seedUretimBom(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  log('uretim-bom', 'Plantero_Uretim_Ana_Excel.xlsx okunuyor, reçete planı çıkarılıyor...');
  const plan = await loadUretimBomPlan(tx);
  for (const n of plan.notes) log('uretim-bom', `  not: ${n}`);

  const uomRows = await tx.select({ id: uoms.id, code: uoms.code }).from(uoms);
  const uomIds = new Map(uomRows.map((u) => [u.code, u.id]));

  const itemCount = await createItems(tx, plan.newItems, uomIds);
  const sup = await createSuppliers(tx, plan.newItems);
  const priced = await applyPriceUpdates(tx, plan.priceUpdates);
  log('uretim-bom', `${itemCount} yeni SKU (hammadde/ambalaj/yarı mamul), ${sup.partners} yeni tedarikçi, ${sup.links} tedarikçi fiyatı, ${priced} mevcut SKU standart maliyeti`);

  const r = await createBoms(tx, plan, uomIds);
  log('uretim-bom', `${r.created} aktif reçete (${r.lines} satır), ${r.skipped} zaten vardı, ${r.superseded} eski reçete arşivlendi`);

  const byOrigin = (o: string) => plan.boms.filter((b) => b.origin === o).length;
  log('uretim-bom', `kaynak: ${byOrigin('excel')} Excel, ${byOrigin('derived')} türetilen (çoklu paket/set), ${byOrigin('placeholder')} yer tutucu`);
  for (const p of plan.placeholderProducts) log('uretim-bom', `  yer tutucu reçete (Excel'de yok): ${p.sku} ${p.name}`);

  summary.add('products (Üretim Excel: yeni SKU)', itemCount);
  summary.add('partners (Üretim Excel: tedarikçi)', sup.partners);
  summary.add('boms (Üretim Excel)', r.created);
  summary.add('bom_lines (Üretim Excel)', r.lines);
}
