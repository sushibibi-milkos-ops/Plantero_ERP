import 'server-only';
import type Decimal from 'decimal.js';
import { alias } from 'drizzle-orm/pg-core';
import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { db, schema, type ParsedProduct } from '@plantero/db';
import { rollupBomCost, D, toDb } from '@plantero/core';

const {
  products, productCategories, productBarcodes, uoms,
  partners, partnerAddresses, partnerContacts, supplierProducts,
  boms, bomLines, warehouses, locations,
  salesChannels, priceLists, priceListItems, customerPrices,
  stockQuants, stockLots, stockMoves,
  auditLog,
} = schema;

/* ==================================================================== */
/* Ürünler                                                              */
/* ==================================================================== */

export type ProductListRow = {
  id: string;
  sku: string;
  shortCode: string | null;
  name: string;
  type: string;
  status: string;
  category1: string | null;
  category2: string | null;
  category3: string | null;
  packaging: string | null;
  barcode: string | null;
  uomCode: string;
  onHandQty: string;
  averageCost: string;
  listPrice: string;
  isLotTracked: boolean;
};

/**
 * Ürün tablosundaki `list_price` kolonu neredeyse hiç kullanılmıyor (100 üründen 1'i dolu) — asıl satış
 * fiyatı `price_list_items`'ta, fiyat listesi bazında tutuluyor. Ekranlarda "Satış Fiyatı"/"Liste fiyatı"
 * için perakende (varsayılan) fiyat listesi kullanılır (Tur 3 P1 bulgusu — SQL kanıtı: 100|1 vs 104 satır).
 */
async function getDefaultPriceListId(): Promise<string | null> {
  const [row] = await db.select({ id: priceLists.id }).from(priceLists).where(eq(priceLists.code, 'PERAKENDE')).limit(1);
  return row?.id ?? null;
}

/** Aynı üründe birden çok miktar kademesi (minQty) olabilir — ekranda taban (en düşük minQty) fiyat gösterilir. */
async function getDefaultPriceByProduct(priceListId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ productId: priceListItems.productId, price: priceListItems.price, minQty: priceListItems.minQty })
    .from(priceListItems)
    .where(eq(priceListItems.priceListId, priceListId));
  const out = new Map<string, { price: string; minQty: Decimal }>();
  for (const r of rows) {
    const mq = D(r.minQty);
    const existing = out.get(r.productId);
    if (!existing || mq.lt(existing.minQty)) out.set(r.productId, { price: r.price, minQty: mq });
  }
  return new Map([...out].map(([productId, v]) => [productId, v.price]));
}

/** Ürün listesi: tüm depolar toplam eldeki stok + birim maliyet + satış fiyatı ile. */
export async function listProducts(): Promise<ProductListRow[]> {
  const onHand = await db
    .select({ productId: stockQuants.productId, qty: sql<string>`coalesce(sum(${stockQuants.qty}), 0)` })
    .from(stockQuants)
    .groupBy(stockQuants.productId);
  const onHandByProduct = new Map(onHand.map((r) => [r.productId, r.qty]));

  const defaultPriceListId = await getDefaultPriceListId();
  const listPriceByProduct = defaultPriceListId ? await getDefaultPriceByProduct(defaultPriceListId) : new Map<string, string>();

  const rows = await db
    .select({ p: products, uomCode: uoms.code })
    .from(products)
    .innerJoin(uoms, eq(uoms.id, products.uomId))
    .orderBy(asc(products.sku));

  return rows.map((r) => ({
    id: r.p.id,
    sku: r.p.sku,
    shortCode: r.p.shortCode,
    name: r.p.name,
    type: r.p.type,
    status: r.p.status,
    category1: r.p.category1,
    category2: r.p.category2,
    category3: r.p.category3,
    packaging: r.p.packaging,
    barcode: r.p.barcode,
    uomCode: r.uomCode,
    onHandQty: onHandByProduct.get(r.p.id) ?? '0',
    averageCost: r.p.averageCost,
    listPrice: listPriceByProduct.get(r.p.id) ?? r.p.listPrice,
    isLotTracked: r.p.isLotTracked,
  }));
}

export async function getProductById(id: string) {
  // NOT: `p.listPrice` burada bilerek fiyat listesiyle EZİLMEZ — bu satır aynı zamanda
  // ProductEditSheet'in form varsayılan değeri (`components/product-edit-sheet.tsx:71`); türetilmiş bir
  // değer yazılırsa kullanıcı ilgisiz bir alanı kaydettiğinde perakende fiyatı sessizce `products.list_price`
  // kolonuna yazılırdı. Ekranda gösterilecek "gerçek" liste fiyatı `getProductDefaultListPrice`/
  // `priceItems`'tan ayrı bir prop olarak taşınır (bkz. urunler/[id]/page.tsx, product-general-tab.tsx).
  const [row] = await db
    .select({ p: products, uomCode: uoms.code, uomName: uoms.name })
    .from(products)
    .innerJoin(uoms, eq(uoms.id, products.uomId))
    .where(eq(products.id, id))
    .limit(1);
  return row ?? null;
}

export async function listProductBarcodes(productId: string) {
  return db.select().from(productBarcodes).where(eq(productBarcodes.productId, productId)).orderBy(asc(productBarcodes.kind));
}

export type StockBreakdownRow = {
  quantId: string;
  warehouseCode: string;
  warehouseName: string;
  locationCode: string;
  locationName: string;
  lotId: string | null;
  lotNo: string | null;
  lotStatus: string | null;
  expiryDate: string | null;
  qty: string;
  reservedQty: string;
  unitCost: string;
  value: string;
};

/** Ürünün depo/lokasyon/lot kırılımlı eldeki stoğu (yalnızca qty>0). */
export async function getProductStockBreakdown(productId: string): Promise<StockBreakdownRow[]> {
  const rows = await db
    .select({
      quantId: stockQuants.id,
      qty: stockQuants.qty,
      reservedQty: stockQuants.reservedQty,
      expiryDate: stockQuants.expiryDate,
      locationCode: locations.code,
      locationName: locations.name,
      warehouseCode: warehouses.code,
      warehouseName: warehouses.name,
      lotId: stockLots.id,
      lotNo: stockLots.lotNo,
      lotStatus: stockLots.status,
      unitCost: stockLots.unitCost,
    })
    .from(stockQuants)
    .innerJoin(locations, eq(locations.id, stockQuants.locationId))
    .leftJoin(warehouses, eq(warehouses.id, locations.warehouseId))
    .leftJoin(stockLots, eq(stockLots.id, stockQuants.lotId))
    .where(and(eq(stockQuants.productId, productId), gt(stockQuants.qty, '0')))
    .orderBy(asc(warehouses.code), asc(locations.code));

  return rows.map((r) => ({
    quantId: r.quantId,
    warehouseCode: r.warehouseCode ?? '—',
    warehouseName: r.warehouseName ?? '—',
    locationCode: r.locationCode,
    locationName: r.locationName,
    lotId: r.lotId,
    lotNo: r.lotNo,
    lotStatus: r.lotStatus,
    expiryDate: r.expiryDate,
    qty: r.qty,
    reservedQty: r.reservedQty,
    unitCost: r.unitCost ?? '0',
    value: toDb(D(r.qty).mul(D(r.unitCost ?? '0'))),
  }));
}

const fromLoc = alias(locations, 'from_loc');
const toLoc = alias(locations, 'to_loc');

/** Son 100 stok hareketi (Hareketler sekmesi). */
export async function listProductMoves(productId: string, limit = 100) {
  const rows = await db
    .select({
      m: stockMoves,
      fromCode: fromLoc.code,
      toCode: toLoc.code,
      lotNo: stockLots.lotNo,
    })
    .from(stockMoves)
    .leftJoin(fromLoc, eq(fromLoc.id, stockMoves.fromLocationId))
    .leftJoin(toLoc, eq(toLoc.id, stockMoves.toLocationId))
    .leftJoin(stockLots, eq(stockLots.id, stockMoves.lotId))
    .where(eq(stockMoves.productId, productId))
    .orderBy(desc(stockMoves.movedAt))
    .limit(limit);
  return rows;
}

export async function listProductBoms(productId: string) {
  return db.select().from(boms).where(eq(boms.productId, productId)).orderBy(desc(boms.version));
}

export async function listProductPriceItems(productId: string) {
  return db
    .select({ item: priceListItems, listCode: priceLists.code, listName: priceLists.name, currency: priceLists.currency })
    .from(priceListItems)
    .innerJoin(priceLists, eq(priceLists.id, priceListItems.priceListId))
    .where(eq(priceListItems.productId, productId))
    .orderBy(asc(priceLists.code));
}

export async function listProductCustomerPrices(productId: string) {
  return db
    .select({ price: customerPrices, partnerCode: partners.code, partnerName: partners.name })
    .from(customerPrices)
    .innerJoin(partners, eq(partners.id, customerPrices.partnerId))
    .where(eq(customerPrices.productId, productId));
}

export async function listProductSuppliers(productId: string) {
  return db
    .select({ sp: supplierProducts, partnerCode: partners.code, partnerName: partners.name, leadTimeDays: partners.supplierLeadTimeDays })
    .from(supplierProducts)
    .innerJoin(partners, eq(partners.id, supplierProducts.partnerId))
    .where(eq(supplierProducts.productId, productId))
    .orderBy(desc(supplierProducts.isPreferred));
}

export async function listAuditFor(tableName: string, recordId: string, limit = 50) {
  return db.select().from(auditLog).where(and(eq(auditLog.tableName, tableName), eq(auditLog.recordId, recordId))).orderBy(desc(auditLog.at)).limit(limit);
}

export type ImportHistoryRow = { id: string; at: string; userEmail: string | null; summary: string | null; after: unknown };

/** Ana Veri Excel içe aktarım sihirbazının geçmişi — `applyImportAction`'ın düştüğü audit satırları. */
export async function listImportHistory(limit = 10): Promise<ImportHistoryRow[]> {
  const rows = await db
    .select({ id: auditLog.id, at: auditLog.at, userEmail: auditLog.userEmail, summary: auditLog.summary, after: auditLog.after })
    .from(auditLog)
    .where(and(eq(auditLog.tableName, 'products'), eq(auditLog.action, 'import')))
    .orderBy(desc(auditLog.at))
    .limit(limit);
  return rows.map((r) => ({ ...r, at: String(r.at) }));
}

/* ==================================================================== */
/* Kategoriler / SKU segmentleri / UOM'lar                              */
/* ==================================================================== */

export async function listCategories() {
  return db.select().from(productCategories).orderBy(asc(productCategories.path));
}

export async function listSkuSegments() {
  return db.select().from(schema.skuSegments).orderBy(asc(schema.skuSegments.segment), asc(schema.skuSegments.context), asc(schema.skuSegments.code));
}

export async function listUoms() {
  return db.select().from(uoms).orderBy(asc(uoms.category), asc(uoms.code));
}

/* ==================================================================== */
/* Excel import sihirbazı — önizleme diff'i                             */
/* ==================================================================== */

export type ImportFieldDiff = { key: string; label: string; before: string; after: string; locked?: boolean };
export type ImportRowDiff = { sku: string; name: string; type: string; fields: ImportFieldDiff[] };
export type ImportConflictRow = { sku: string; name: string; field: 'name' | 'barcode'; label: string; existing: string | null; incoming: string | null };
export type ImportPreviewSummary = {
  createdRows: ImportRowDiff[];
  changedRows: ImportRowDiff[];
  unchangedCount: number;
  conflicts: ImportConflictRow[];
};

const IMPORT_FIELD_LABELS: Record<string, string> = {
  shortCode: 'Kısa kod',
  type: 'Tip',
  status: 'Durum',
  category1: 'Kategori 1',
  category2: 'Kategori 2',
  category3: 'Kategori 3',
  packQty: 'Ambalaj içi adet',
  caseBarcode: 'Koli barkodu',
};

/**
 * Ayrıştırılmış Ana Veri satırlarını mevcut ürünlerle karşılaştırıp önizleme sihirbazı için
 * alan bazlı diff (eski → yeni) üretir. Salt okunur — `importAnaVeri`'nin "değişti mi" mantığıyla
 * aynı alan kümesini karşılaştırır (bkz. `packages/db/src/import/anaveri.ts`).
 * `name`/`barcode` asla üzerine yazılmaz — farklıysa `conflicts`'e (kilitli, korunacak) düşer.
 */
export async function buildImportPreview(parsed: { products: ParsedProduct[] }): Promise<ImportPreviewSummary> {
  const skus = parsed.products.map((p) => p.sku);
  const existingRows = skus.length ? await db.select().from(products).where(inArray(products.sku, skus)) : [];
  const existingBySku = new Map(existingRows.map((r) => [r.sku, r]));

  const createdRows: ImportRowDiff[] = [];
  const changedRows: ImportRowDiff[] = [];
  const conflicts: ImportConflictRow[] = [];
  let unchangedCount = 0;

  for (const p of parsed.products) {
    const existing = existingBySku.get(p.sku);
    if (!existing) {
      createdRows.push({
        sku: p.sku,
        name: p.name,
        type: p.type,
        fields: [
          { key: 'type', label: 'Tip', before: '—', after: p.type },
          { key: 'category', label: 'Kategori', before: '—', after: [p.category1, p.category2, p.category3].filter(Boolean).join(' / ') || '—' },
          { key: 'packaging', label: 'Ambalaj', before: '—', after: p.packagingLabel ?? '—' },
          { key: 'barcode', label: 'Barkod', before: '—', after: p.barcode ?? '—', locked: true },
        ],
      });
      continue;
    }

    if (existing.name !== p.name) conflicts.push({ sku: p.sku, name: existing.name, field: 'name', label: 'Ürün adı', existing: existing.name, incoming: p.name });
    if ((existing.barcode ?? null) !== p.barcode) conflicts.push({ sku: p.sku, name: existing.name, field: 'barcode', label: 'Barkod', existing: existing.barcode, incoming: p.barcode });

    const candidates: Array<{ key: string; before: string | null; after: string | null }> = [
      { key: 'shortCode', before: existing.shortCode, after: p.shortCode },
      { key: 'type', before: existing.type, after: p.type },
      { key: 'status', before: existing.status, after: p.status },
      { key: 'category1', before: existing.category1, after: p.category1 || null },
      { key: 'category2', before: existing.category2, after: p.category2 || null },
      { key: 'category3', before: existing.category3, after: p.category3 || null },
      { key: 'packQty', before: String(existing.packQty), after: String(p.packQty) },
      { key: 'caseBarcode', before: existing.caseBarcode, after: p.caseBarcode },
    ];
    const diffFields = candidates.filter((c) => (c.before ?? null) !== (c.after ?? null));
    if (diffFields.length > 0) {
      changedRows.push({
        sku: p.sku,
        name: existing.name,
        type: existing.type,
        fields: diffFields.map((f) => ({ key: f.key, label: IMPORT_FIELD_LABELS[f.key] ?? f.key, before: f.before ?? '—', after: f.after ?? '—' })),
      });
    } else {
      unchangedCount++;
    }
  }

  return { createdRows, changedRows, unchangedCount, conflicts };
}

/* ==================================================================== */
/* Cariler                                                              */
/* ==================================================================== */

export type PartnerListRow = {
  id: string;
  code: string;
  name: string;
  kind: string;
  channelName: string | null;
  paymentTermKind: string;
  paymentTermDays: number;
  balance: string;
  supplierQualityScore: string | null;
  isActive: boolean;
};

export async function listPartners(): Promise<PartnerListRow[]> {
  const rows = await db
    .select({ p: partners, channelName: salesChannels.name })
    .from(partners)
    .leftJoin(salesChannels, eq(salesChannels.id, partners.defaultChannelId))
    .orderBy(asc(partners.name));
  return rows.map((r) => ({
    id: r.p.id,
    code: r.p.code,
    name: r.p.name,
    kind: r.p.kind,
    channelName: r.channelName,
    paymentTermKind: r.p.paymentTermKind,
    paymentTermDays: r.p.paymentTermDays,
    balance: r.p.balance,
    supplierQualityScore: r.p.supplierQualityScore,
    isActive: r.p.isActive,
  }));
}

export async function getPartnerById(id: string) {
  const [row] = await db.select().from(partners).where(eq(partners.id, id)).limit(1);
  return row ?? null;
}

export async function listPartnerAddresses(partnerId: string) {
  return db.select().from(partnerAddresses).where(eq(partnerAddresses.partnerId, partnerId)).orderBy(desc(partnerAddresses.isDefault));
}

export async function listPartnerContacts(partnerId: string) {
  return db.select().from(partnerContacts).where(eq(partnerContacts.partnerId, partnerId)).orderBy(desc(partnerContacts.isPrimary));
}

export async function listPartnerCustomerPrices(partnerId: string) {
  return db
    .select({ price: customerPrices, sku: products.sku, name: products.name })
    .from(customerPrices)
    .innerJoin(products, eq(products.id, customerPrices.productId))
    .where(eq(customerPrices.partnerId, partnerId));
}

export async function listPartnerSupplierProducts(partnerId: string) {
  return db
    .select({ sp: supplierProducts, sku: products.sku, name: products.name })
    .from(supplierProducts)
    .innerJoin(products, eq(products.id, supplierProducts.productId))
    .where(eq(supplierProducts.partnerId, partnerId))
    .orderBy(desc(supplierProducts.isPreferred));
}

export type PartnerDocRow = { docNo: string; date: string; status: string; amount: string; currency: string };

/** Sipariş / fatura / tahsilat listeleri — o modüller henüz seed edilmemişse boş döner (hata fırlatmaz). */
export async function listPartnerOrders(partnerId: string): Promise<PartnerDocRow[]> {
  try {
    const rows = await db
      .select({ docNo: schema.salesOrders.docNo, date: schema.salesOrders.orderDate, status: schema.salesOrders.status, amount: schema.salesOrders.grandTotal, currency: schema.salesOrders.currency })
      .from(schema.salesOrders)
      .where(eq(schema.salesOrders.partnerId, partnerId))
      .orderBy(desc(schema.salesOrders.orderDate))
      .limit(20);
    return rows.map((r) => ({ docNo: r.docNo, date: r.date, status: r.status, amount: r.amount, currency: r.currency }));
  } catch {
    return [];
  }
}

export async function listPartnerInvoices(partnerId: string): Promise<PartnerDocRow[]> {
  try {
    const rows = await db
      .select({ docNo: schema.invoices.docNo, date: schema.invoices.invoiceDate, status: schema.invoices.status, amount: schema.invoices.grandTotal, currency: schema.invoices.currency })
      .from(schema.invoices)
      .where(eq(schema.invoices.partnerId, partnerId))
      .orderBy(desc(schema.invoices.invoiceDate))
      .limit(20);
    return rows.map((r) => ({ docNo: r.docNo, date: r.date, status: r.status, amount: r.amount, currency: r.currency }));
  } catch {
    return [];
  }
}

export async function listPartnerPayments(partnerId: string): Promise<PartnerDocRow[]> {
  try {
    const rows = await db
      .select({ docNo: schema.payments.docNo, date: schema.payments.paymentDate, status: schema.payments.status, amount: schema.payments.amount, currency: schema.payments.currency })
      .from(schema.payments)
      .where(eq(schema.payments.partnerId, partnerId))
      .orderBy(desc(schema.payments.paymentDate))
      .limit(20);
    return rows.map((r) => ({ docNo: r.docNo, date: r.date, status: r.status, amount: r.amount, currency: r.currency }));
  } catch {
    return [];
  }
}

export async function listChannels() {
  return db.select().from(salesChannels).orderBy(asc(salesChannels.sortOrder));
}

export async function listPriceLists() {
  return db.select().from(priceLists).orderBy(asc(priceLists.code));
}

/* ==================================================================== */
/* Reçeteler (BOM)                                                      */
/* ==================================================================== */

export type BomListRow = {
  id: string;
  code: string;
  version: number;
  status: string;
  productId: string;
  sku: string;
  name: string;
  productName: string;
  outputQty: string;
  outputUomCode: string;
  expectedYieldPct: string;
  cycleMinutes: number | null;
  lineCount: number;
  unitCost: string;
};

/**
 * Liste ekranı için toplu (N+1'siz) tahmini birim maliyet: `rollupBomCost`'un aynı formülü,
 * ama tüm bileşen maliyetleri tek seferde toplu sorgulanır. Detay sayfası kesin değer için
 * `getBomCostRollup` (core `rollupBomCost`, lot bazlı tam hesap) kullanır.
 */
async function batchEstimateBomUnitCosts(bomIds: string[]): Promise<Map<string, string>> {
  if (bomIds.length === 0) return new Map();
  const headers = await db.select().from(boms).where(inArray(boms.id, bomIds));
  const lines = await db.select().from(bomLines).where(inArray(bomLines.bomId, bomIds));

  const productIds = Array.from(new Set(lines.map((l) => l.productId)));
  const costRows = productIds.length
    ? await db.select({ id: products.id, averageCost: products.averageCost, standardCost: products.standardCost }).from(products).where(inArray(products.id, productIds))
    : [];
  const onHand = productIds.length
    ? await db
        .select({ productId: stockQuants.productId, qty: stockQuants.qty, unitCost: stockLots.unitCost })
        .from(stockQuants)
        .innerJoin(stockLots, eq(stockLots.id, stockQuants.lotId))
        .where(and(inArray(stockQuants.productId, productIds), gt(stockQuants.qty, '0')))
    : [];
  const preferred = productIds.length
    ? await db.select({ productId: supplierProducts.productId, price: supplierProducts.price }).from(supplierProducts).where(and(inArray(supplierProducts.productId, productIds), eq(supplierProducts.isPreferred, true)))
    : [];

  const lotAgg = new Map<string, { qty: number; value: number }>();
  for (const r of onHand) {
    const cur = lotAgg.get(r.productId) ?? { qty: 0, value: 0 };
    const qty = Number(r.qty);
    cur.qty += qty;
    cur.value += qty * Number(r.unitCost);
    lotAgg.set(r.productId, cur);
  }
  const preferredByProduct = new Map(preferred.map((p) => [p.productId, Number(p.price)]));
  const costByProduct = new Map(costRows.map((c) => [c.id, c]));

  const unitCostFor = (productId: string): number => {
    const lot = lotAgg.get(productId);
    if (lot && lot.qty > 0) return lot.value / lot.qty;
    const c = costByProduct.get(productId);
    if (c && Number(c.averageCost) > 0) return Number(c.averageCost);
    const pref = preferredByProduct.get(productId);
    if (pref !== undefined) return pref;
    if (c && Number(c.standardCost) > 0) return Number(c.standardCost);
    return 0;
  };

  const linesByBom = new Map<string, typeof lines>();
  for (const l of lines) {
    const list = linesByBom.get(l.bomId) ?? [];
    list.push(l);
    linesByBom.set(l.bomId, list);
  }

  const out = new Map<string, string>();
  for (const h of headers) {
    const bomLinesForThis = linesByBom.get(h.id) ?? [];
    let materialCost = 0;
    for (const l of bomLinesForThis) {
      const uc = unitCostFor(l.productId);
      const consumed = Number(l.qty) * (1 + Number(l.scrapPct) / 100);
      materialCost += l.isByproduct ? -Number(l.qty) * uc : consumed * uc;
    }
    const outputQty = Number(h.outputQty);
    const yieldRatio = Number(h.expectedYieldPct) / 100 || 1;
    const effectiveOutput = outputQty * yieldRatio;
    const unitCost = effectiveOutput > 0 ? (materialCost + Number(h.overheadPerBatch)) / effectiveOutput + Number(h.overheadPerUnit) : 0;
    out.set(h.id, unitCost.toFixed(4));
  }
  return out;
}

export async function listBoms(): Promise<BomListRow[]> {
  const rows = await db
    .select({ b: boms, sku: products.sku, productName: products.name, outputUomCode: uoms.code })
    .from(boms)
    .innerJoin(products, eq(products.id, boms.productId))
    .leftJoin(uoms, eq(uoms.id, boms.outputUomId))
    .orderBy(asc(products.sku), desc(boms.version));

  const unitCosts = await batchEstimateBomUnitCosts(rows.map((r) => r.b.id));

  const lineCountRows = rows.length
    ? await db
        .select({ bomId: bomLines.bomId, n: sql<string>`count(*)` })
        .from(bomLines)
        .where(inArray(bomLines.bomId, rows.map((r) => r.b.id)))
        .groupBy(bomLines.bomId)
    : [];
  const lineCountByBom = new Map(lineCountRows.map((r) => [r.bomId, Number(r.n)]));

  return rows.map((r) => ({
    id: r.b.id,
    code: r.b.code,
    version: r.b.version,
    status: r.b.status,
    productId: r.b.productId,
    sku: r.sku,
    name: r.b.name ?? r.productName,
    productName: r.productName,
    outputQty: r.b.outputQty,
    outputUomCode: r.outputUomCode ?? '',
    expectedYieldPct: r.b.expectedYieldPct,
    cycleMinutes: r.b.cycleMinutes,
    lineCount: lineCountByBom.get(r.b.id) ?? 0,
    unitCost: unitCosts.get(r.b.id) ?? '0',
  }));
}

export async function getBomById(id: string) {
  const [row] = await db
    .select({ b: boms, sku: products.sku, productName: products.name, outputUomCode: uoms.code })
    .from(boms)
    .innerJoin(products, eq(products.id, boms.productId))
    .leftJoin(uoms, eq(uoms.id, boms.outputUomId))
    .where(eq(boms.id, id))
    .limit(1);
  return row ?? null;
}

export async function listBomLines(bomId: string) {
  return db
    .select({ line: bomLines, sku: products.sku, name: products.name, uomCode: uoms.code })
    .from(bomLines)
    .innerJoin(products, eq(products.id, bomLines.productId))
    .innerJoin(uoms, eq(uoms.id, bomLines.uomId))
    .where(eq(bomLines.bomId, bomId))
    .orderBy(asc(bomLines.sequence));
}

export async function listBomVersions(productId: string) {
  return db.select().from(boms).where(eq(boms.productId, productId)).orderBy(desc(boms.version));
}

export async function getBomCostRollup(bomId: string) {
  return rollupBomCost(db, bomId);
}

/**
 * Reçete satırlarında seçilebilecek hammadde/yarı mamul/ambalaj ürünleri — tahmini birim maliyet dahil
 * (averageCost → tercih edilen tedarikçi fiyatı → standardCost). Formda anlık toplam önizlemesi içindir;
 * kaydederken sunucu `rollupBomCost` ile gerçek (lot ortalamalı) maliyeti yeniden hesaplar.
 */
export async function listBomComponentCandidates() {
  const rows = await db
    .select({ id: products.id, sku: products.sku, name: products.name, type: products.type, uomId: products.uomId, uomCode: uoms.code, averageCost: products.averageCost, standardCost: products.standardCost })
    .from(products)
    .innerJoin(uoms, eq(uoms.id, products.uomId))
    .where(and(eq(products.status, 'active'), inArray(products.type, ['raw_material', 'semi_finished', 'packaging'])))
    .orderBy(asc(products.sku));

  const preferredPrices = await db
    .select({ productId: supplierProducts.productId, price: supplierProducts.price })
    .from(supplierProducts)
    .where(eq(supplierProducts.isPreferred, true));
  const priceByProduct = new Map(preferredPrices.map((p) => [p.productId, p.price]));

  return rows.map((r) => {
    const estimatedUnitCost = Number(r.averageCost) > 0 ? r.averageCost : (priceByProduct.get(r.id) ?? (Number(r.standardCost) > 0 ? r.standardCost : '0'));
    return { ...r, estimatedUnitCost };
  });
}

export async function listManufacturedProducts() {
  const rows = await db
    .select({ id: products.id, sku: products.sku, name: products.name, uomId: products.uomId, uomCode: uoms.code })
    .from(products)
    .innerJoin(uoms, eq(uoms.id, products.uomId))
    .where(and(eq(products.status, 'active'), eq(products.isManufactured, true)))
    .orderBy(asc(products.sku));
  return rows;
}

export async function listProductionLines() {
  return db.select().from(schema.productionLines).where(eq(schema.productionLines.isActive, true)).orderBy(asc(schema.productionLines.code));
}

/* ==================================================================== */
/* Depolar / lokasyonlar                                                */
/* ==================================================================== */

export async function listWarehouses() {
  return db.select().from(warehouses).orderBy(asc(warehouses.code));
}

export async function listLocationsFlat(warehouseId?: string) {
  return warehouseId
    ? db.select().from(locations).where(eq(locations.warehouseId, warehouseId)).orderBy(asc(locations.code))
    : db.select().from(locations).orderBy(asc(locations.code));
}
