import { eq, and } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import {
  products, productCategories, uoms,
  warehouses, locations, productionLines,
  salesChannels, priceLists, priceListItems,
  partners, supplierProducts,
  boms, bomLines,
  type locationUsageEnum, type channelKindEnum, type productTypeEnum,
} from '../schema/index.js';
import { parseAnaVeri, importAnaVeri } from '../import/anaveri.js';
import { log, readImportFile, type SeedSummary } from './_helpers.js';

type LocationUsage = (typeof locationUsageEnum.enumValues)[number];
type ChannelKind = (typeof channelKindEnum.enumValues)[number];
type ProductType = (typeof productTypeEnum.enumValues)[number];

/* ==================================================================== */
/* 1) Ana Veri Excel importu                                            */
/* ==================================================================== */

async function seedAnaVeriImport(db: DbOrTx, summary: SeedSummary): Promise<void> {
  log('masterdata', 'Plantero_AnaVeri_KonusanKod.xlsx okunuyor...');
  const buffer = await readImportFile('Plantero_AnaVeri_KonusanKod.xlsx');
  const parsed = await parseAnaVeri(buffer);
  if (parsed.warnings.length) {
    log('masterdata', `Ana Veri importu ${parsed.warnings.length} uyarı:`);
    for (const w of parsed.warnings) log('masterdata', `  - ${w}`);
  }
  const result = await importAnaVeri(db, parsed);
  log('masterdata', `Ana Veri: ${result.created} yeni, ${result.updated} güncellendi, ${result.unchanged} değişmedi, ${result.conflicts.length} çakışma`);
  if (result.conflicts.length) {
    for (const c of result.conflicts) log('masterdata', `  ÇAKIŞMA ${c.sku}.${c.field}: mevcut="${c.existing}" excel="${c.incoming}" (üzerine yazılmadı)`);
  }
  summary.add('products (Ana Veri)', result.created + result.updated + result.unchanged);
}

/* ==================================================================== */
/* 2) Eksik hammadde / ambalaj SKU'ları (reçeteler için gerekli, Excel'de yok) */
/* ==================================================================== */

type NewProductDef = {
  sku: string; shortCode: string; name: string; type: ProductType;
  category1: string; category2: string; category3: string; uomCode: 'ADET' | 'KG';
};

const NEW_RAW_MATERIALS: NewProductDef[] = [
  { sku: '301030000', shortCode: 'HAM-KYM-01', name: 'Badem', type: 'raw_material', category1: 'Hammaddeler', category2: 'Kuruyemiş Hammaddeleri', category3: 'Badem', uomCode: 'KG' },
  { sku: '301040000', shortCode: 'HAM-KYM-02', name: 'Fındık', type: 'raw_material', category1: 'Hammaddeler', category2: 'Kuruyemiş Hammaddeleri', category3: 'Fındık', uomCode: 'KG' },
  { sku: '301050000', shortCode: 'HAM-KYM-03', name: 'Kaju', type: 'raw_material', category1: 'Hammaddeler', category2: 'Kuruyemiş Hammaddeleri', category3: 'Kaju', uomCode: 'KG' },
  { sku: '301060000', shortCode: 'HAM-KYM-04', name: 'Yulaf', type: 'raw_material', category1: 'Hammaddeler', category2: 'Kuruyemiş Hammaddeleri', category3: 'Yulaf', uomCode: 'KG' },
  { sku: '302030000', shortCode: 'HAM-TAT-03', name: 'Hurma Şurubu', type: 'raw_material', category1: 'Hammaddeler', category2: 'Protein Mix Hammaddeleri', category3: 'Tatlandırıcılar', uomCode: 'KG' },
  { sku: '307020000', shortCode: 'HAM-DGR-02', name: 'Deniz Tuzu', type: 'raw_material', category1: 'Hammaddeler', category2: 'Protein Mix Hammaddeleri', category3: 'Diğer', uomCode: 'KG' },
  { sku: '308010000', shortCode: 'HAM-KHV-01', name: 'Kahve Çekirdeği (Yeşil)', type: 'raw_material', category1: 'Hammaddeler', category2: 'Kahve ve Egzotik Hammaddeler', category3: 'Kahve Çekirdeği', uomCode: 'KG' },
  { sku: '308020000', shortCode: 'HAM-EGZ-01', name: 'Matcha Tozu (Toptan)', type: 'raw_material', category1: 'Hammaddeler', category2: 'Kahve ve Egzotik Hammaddeler', category3: 'Matcha', uomCode: 'KG' },
  { sku: '308030000', shortCode: 'HAM-EGZ-02', name: 'Vanilya Tozu (Toptan)', type: 'raw_material', category1: 'Hammaddeler', category2: 'Kahve ve Egzotik Hammaddeler', category3: 'Vanilya', uomCode: 'KG' },
  { sku: '308040000', shortCode: 'HAM-EGZ-03', name: 'Hurma (Kuru, Çekirdeksiz)', type: 'raw_material', category1: 'Hammaddeler', category2: 'Kahve ve Egzotik Hammaddeler', category3: 'Hurma', uomCode: 'KG' },
];

const NEW_PACKAGING: NewProductDef[] = [
  { sku: '401010000', shortCode: 'AMB-KVN-01', name: 'Kavanoz 500ml', type: 'packaging', category1: 'Ambalaj Malzemeleri', category2: 'Cam / Plastik Ambalaj', category3: 'Kavanoz', uomCode: 'ADET' },
  { sku: '401020000', shortCode: 'AMB-KVN-02', name: 'Kapak', type: 'packaging', category1: 'Ambalaj Malzemeleri', category2: 'Cam / Plastik Ambalaj', category3: 'Kapak', uomCode: 'ADET' },
  { sku: '401030000', shortCode: 'AMB-ETK-01', name: 'Etiket', type: 'packaging', category1: 'Ambalaj Malzemeleri', category2: 'Baskı / Etiket', category3: 'Etiket', uomCode: 'ADET' },
  { sku: '401040000', shortCode: 'AMB-KOL-01', name: "Koli 6'lı", type: 'packaging', category1: 'Ambalaj Malzemeleri', category2: 'Karton Ambalaj', category3: 'Koli', uomCode: 'ADET' },
  { sku: '402010000', shortCode: 'AMB-DYP-01', name: 'Doypack 1kg', type: 'packaging', category1: 'Ambalaj Malzemeleri', category2: 'Esnek Ambalaj', category3: 'Doypack', uomCode: 'ADET' },
  { sku: '402020000', shortCode: 'AMB-SAS-01', name: 'Saşe 10g', type: 'packaging', category1: 'Ambalaj Malzemeleri', category2: 'Esnek Ambalaj', category3: 'Saşe', uomCode: 'ADET' },
  { sku: '402030000', shortCode: 'AMB-KRF-01', name: 'Kraft Kahve Torbası 250g', type: 'packaging', category1: 'Ambalaj Malzemeleri', category2: 'Esnek Ambalaj', category3: 'Kraft Torba', uomCode: 'ADET' },
];

async function ensureCategoryPath(db: DbOrTx, cache: Map<string, string>, cat1: string, cat2: string, cat3: string): Promise<string> {
  async function ensure(name: string, level: 1 | 2 | 3, parentPath: string | null): Promise<string> {
    const path = parentPath ? `${parentPath}/${name}` : name;
    const cached = cache.get(path);
    if (cached) return cached;
    const parentId = parentPath ? (cache.get(parentPath) ?? null) : null;
    await db.insert(productCategories).values({ name, level, path, parentId }).onConflictDoNothing({ target: productCategories.path });
    const [row] = await db.select({ id: productCategories.id }).from(productCategories).where(eq(productCategories.path, path)).limit(1);
    if (!row) throw new Error(`Kategori oluşturulamadı: ${path}`);
    cache.set(path, row.id);
    return row.id;
  }
  await ensure(cat1, 1, null);
  await ensure(cat2, 2, cat1);
  const l3 = await ensure(cat3, 3, `${cat1}/${cat2}`);
  return l3;
}

async function seedNewIngredients(db: DbOrTx, summary: SeedSummary): Promise<void> {
  log('masterdata', 'reçeteler için eksik hammadde/ambalaj SKU\'ları...');
  const uomRows = await db.select().from(uoms);
  const uomIdByCode = new Map(uomRows.map((u) => [u.code, u.id]));
  const categoryCache = new Map<string, string>();

  let count = 0;
  for (const def of [...NEW_RAW_MATERIALS, ...NEW_PACKAGING]) {
    const uomId = uomIdByCode.get(def.uomCode);
    if (!uomId) throw new Error(`UOM bulunamadı: ${def.uomCode}`);
    const categoryId = await ensureCategoryPath(db, categoryCache, def.category1, def.category2, def.category3);
    const [existing] = await db.select({ id: products.id }).from(products).where(eq(products.sku, def.sku)).limit(1);
    if (existing) continue; // ürün adı/barkod kuralı: mevcutsa dokunma
    await db.insert(products).values({
      sku: def.sku,
      shortCode: def.shortCode,
      name: def.name,
      type: def.type,
      status: 'active',
      categoryId,
      category1: def.category1,
      category2: def.category2,
      category3: def.category3,
      uomId,
      isLotTracked: true,
      isPurchasable: true,
      isSellable: false,
      isManufactured: false,
      shelfLifeDays: def.type === 'raw_material' ? 540 : 1825,
      vatRate: '20',
      purchaseVatRate: '20',
      note: 'Seed: reçete için eklenen yeni kayıt (Excel dışı — ürün adı serbesttir)',
    });
    count++;
  }
  summary.add('products (yeni hammadde/ambalaj)', count);
}

/* ==================================================================== */
/* 3) Depolar + lokasyon ağacı                                          */
/* ==================================================================== */

type LocDef = { code: string; name: string; usage: LocationUsage; warehouseCode: string | null; parentCode: string | null; isPickable: boolean };

const LOCATIONS: LocDef[] = [
  { code: 'TIRE/GIRIS', name: 'Giriş / Transit', usage: 'transit', warehouseCode: 'TIRE', parentCode: null, isPickable: true },
  { code: 'TIRE/KARANTINA', name: 'Karantina', usage: 'quarantine', warehouseCode: 'TIRE', parentCode: null, isPickable: true },
  { code: 'TIRE/RED', name: 'Red', usage: 'rejected', warehouseCode: 'TIRE', parentCode: null, isPickable: true },
  { code: 'TIRE/HAM', name: 'Hammadde Deposu', usage: 'internal', warehouseCode: 'TIRE', parentCode: null, isPickable: false },
  { code: 'TIRE/HAM/R01', name: 'Hammadde Raf 01', usage: 'internal', warehouseCode: 'TIRE', parentCode: 'TIRE/HAM', isPickable: false },
  { code: 'TIRE/HAM/R01/A', name: 'Raf 01 - A Gözü', usage: 'internal', warehouseCode: 'TIRE', parentCode: 'TIRE/HAM/R01', isPickable: true },
  { code: 'TIRE/HAM/R01/B', name: 'Raf 01 - B Gözü', usage: 'internal', warehouseCode: 'TIRE', parentCode: 'TIRE/HAM/R01', isPickable: true },
  { code: 'TIRE/HAM/R01/C', name: 'Raf 01 - C Gözü', usage: 'internal', warehouseCode: 'TIRE', parentCode: 'TIRE/HAM/R01', isPickable: true },
  { code: 'TIRE/HAM/R02', name: 'Hammadde Raf 02', usage: 'internal', warehouseCode: 'TIRE', parentCode: 'TIRE/HAM', isPickable: false },
  { code: 'TIRE/HAM/R02/A', name: 'Raf 02 - A Gözü', usage: 'internal', warehouseCode: 'TIRE', parentCode: 'TIRE/HAM/R02', isPickable: true },
  { code: 'TIRE/HAM/R02/B', name: 'Raf 02 - B Gözü', usage: 'internal', warehouseCode: 'TIRE', parentCode: 'TIRE/HAM/R02', isPickable: true },
  { code: 'TIRE/HAM/R02/C', name: 'Raf 02 - C Gözü', usage: 'internal', warehouseCode: 'TIRE', parentCode: 'TIRE/HAM/R02', isPickable: true },
  { code: 'TIRE/HAM/R03', name: 'Hammadde Raf 03', usage: 'internal', warehouseCode: 'TIRE', parentCode: 'TIRE/HAM', isPickable: false },
  { code: 'TIRE/HAM/R03/A', name: 'Raf 03 - A Gözü', usage: 'internal', warehouseCode: 'TIRE', parentCode: 'TIRE/HAM/R03', isPickable: true },
  { code: 'TIRE/HAM/R03/B', name: 'Raf 03 - B Gözü', usage: 'internal', warehouseCode: 'TIRE', parentCode: 'TIRE/HAM/R03', isPickable: true },
  { code: 'TIRE/HAM/R03/C', name: 'Raf 03 - C Gözü', usage: 'internal', warehouseCode: 'TIRE', parentCode: 'TIRE/HAM/R03', isPickable: true },
  { code: 'TIRE/AMB', name: 'Ambalaj Deposu', usage: 'internal', warehouseCode: 'TIRE', parentCode: null, isPickable: true },
  { code: 'TIRE/MAMUL', name: 'Mamul Deposu', usage: 'internal', warehouseCode: 'TIRE', parentCode: null, isPickable: false },
  { code: 'TIRE/MAMUL/R01', name: 'Mamul Raf 01', usage: 'internal', warehouseCode: 'TIRE', parentCode: 'TIRE/MAMUL', isPickable: true },
  { code: 'TIRE/MAMUL/R02', name: 'Mamul Raf 02', usage: 'internal', warehouseCode: 'TIRE', parentCode: 'TIRE/MAMUL', isPickable: true },
  { code: 'TIRE/MAMUL/R03', name: 'Mamul Raf 03', usage: 'internal', warehouseCode: 'TIRE', parentCode: 'TIRE/MAMUL', isPickable: true },
  { code: 'TIRE/MAMUL/R04', name: 'Mamul Raf 04', usage: 'internal', warehouseCode: 'TIRE', parentCode: 'TIRE/MAMUL', isPickable: true },
  { code: 'TIRE/URETIM', name: 'Üretim', usage: 'production', warehouseCode: 'TIRE', parentCode: null, isPickable: false },
  { code: 'TIRE/URETIM/HAT1', name: 'Hat 1 — Bazlar, Barista & Kremalar', usage: 'production', warehouseCode: 'TIRE', parentCode: 'TIRE/URETIM', isPickable: false },
  { code: 'TIRE/URETIM/HAT2', name: 'Hat 2 — Toz Karıştırma & Dolum', usage: 'production', warehouseCode: 'TIRE', parentCode: 'TIRE/URETIM', isPickable: false },
  { code: 'TIRE/URETIM/HAT3', name: 'Hat 3 — Saşe / Stick Toz Dolum', usage: 'production', warehouseCode: 'TIRE', parentCode: 'TIRE/URETIM', isPickable: false },
  { code: 'TIRE/SEVK', name: 'Sevkiyat / Transit', usage: 'transit', warehouseCode: 'TIRE', parentCode: null, isPickable: true },
  { code: 'TIRE/HURDA', name: 'Hurda', usage: 'scrap', warehouseCode: 'TIRE', parentCode: null, isPickable: true },
  { code: 'TIRE/SAYIM', name: 'Sayım Farkı', usage: 'inventory_loss', warehouseCode: 'TIRE', parentCode: null, isPickable: true },
  { code: 'SUPPLIERS', name: 'Tedarikçiler (Sanal)', usage: 'supplier', warehouseCode: null, parentCode: null, isPickable: false },
  { code: 'CUSTOMERS', name: 'Müşteriler (Sanal)', usage: 'customer', warehouseCode: null, parentCode: null, isPickable: false },
  { code: 'BUCA/MAMUL', name: 'Mamul Deposu', usage: 'internal', warehouseCode: 'BUCA', parentCode: null, isPickable: false },
  { code: 'BUCA/MAMUL/R01', name: 'Mamul Raf 01', usage: 'internal', warehouseCode: 'BUCA', parentCode: 'BUCA/MAMUL', isPickable: true },
  { code: 'BUCA/MAMUL/R02', name: 'Mamul Raf 02', usage: 'internal', warehouseCode: 'BUCA', parentCode: 'BUCA/MAMUL', isPickable: true },
  { code: 'BUCA/KARANTINA', name: 'Karantina', usage: 'quarantine', warehouseCode: 'BUCA', parentCode: null, isPickable: true },
];

async function seedWarehousesAndLocations(db: DbOrTx, summary: SeedSummary): Promise<Map<string, string>> {
  log('masterdata', 'depolar ve lokasyon ağacı...');
  const WAREHOUSES: Array<{ code: string; name: string; address: string; isProduction: boolean }> = [
    { code: 'TIRE', name: 'Tire Fabrika', address: 'Duatepe Mah. Küçük Sanayi Sitesi Sk. G-B Blok No: 14/19 Tire / İzmir', isProduction: true },
    { code: 'BUCA', name: 'Buca Depo', address: 'Buca / İzmir', isProduction: false },
  ];
  const warehouseIdByCode = new Map<string, string>();
  for (const w of WAREHOUSES) {
    await db.insert(warehouses).values(w).onConflictDoUpdate({ target: warehouses.code, set: { name: w.name, address: w.address, isProduction: w.isProduction } });
    const [row] = await db.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.code, w.code)).limit(1);
    if (row) warehouseIdByCode.set(w.code, row.id);
  }
  summary.add('warehouses', warehouseIdByCode.size);

  const locationIdByCode = new Map<string, string>();
  for (const l of LOCATIONS) {
    const warehouseId = l.warehouseCode ? (warehouseIdByCode.get(l.warehouseCode) ?? null) : null;
    const parentId = l.parentCode ? (locationIdByCode.get(l.parentCode) ?? null) : null;
    await db
      .insert(locations)
      .values({ code: l.code, name: l.name, path: l.code, usage: l.usage, warehouseId, parentId, isPickable: l.isPickable })
      .onConflictDoUpdate({ target: locations.code, set: { name: l.name, usage: l.usage, warehouseId, parentId, isPickable: l.isPickable } });
    const [row] = await db.select({ id: locations.id }).from(locations).where(eq(locations.code, l.code)).limit(1);
    if (row) locationIdByCode.set(l.code, row.id);
  }
  summary.add('locations', locationIdByCode.size);

  log('masterdata', 'üretim hatları...');
  const LINES: Array<{ code: string; name: string; locationCode: string; capacityPerHour: string; shiftMinutes: number }> = [
    { code: 'HAT1', name: 'Bazlar, Barista & Kremalar', locationCode: 'TIRE/URETIM/HAT1', capacityPerHour: '80', shiftMinutes: 480 },
    { code: 'HAT2', name: 'Toz Karıştırma & Dolum', locationCode: 'TIRE/URETIM/HAT2', capacityPerHour: '150', shiftMinutes: 480 },
    { code: 'HAT3', name: 'Saşe / Stick Toz Dolum', locationCode: 'TIRE/URETIM/HAT3', capacityPerHour: '600', shiftMinutes: 480 },
  ];
  const tireId = warehouseIdByCode.get('TIRE');
  if (!tireId) throw new Error('TIRE deposu oluşturulamadı');
  let lineCount = 0;
  for (const l of LINES) {
    const locationId = locationIdByCode.get(l.locationCode);
    if (!locationId) throw new Error(`Hat lokasyonu bulunamadı: ${l.locationCode}`);
    await db
      .insert(productionLines)
      .values({ code: l.code, name: l.name, warehouseId: tireId, locationId, capacityPerHour: l.capacityPerHour, shiftMinutes: l.shiftMinutes })
      .onConflictDoUpdate({ target: productionLines.code, set: { name: l.name, warehouseId: tireId, locationId, capacityPerHour: l.capacityPerHour, shiftMinutes: l.shiftMinutes } });
    lineCount++;
  }
  summary.add('production_lines', lineCount);

  return locationIdByCode;
}

/* ==================================================================== */
/* 4) Satış kanalları + fiyat listeleri                                 */
/* ==================================================================== */

type ChannelDef = { code: string; name: string; kind: ChannelKind; commissionPct: string; shippingDeductionPerOrder: string; otherDeductionPct: string; settlementDays: number; currency: string };

const CHANNELS: ChannelDef[] = [
  { code: 'TRENDYOL', name: 'Trendyol', kind: 'marketplace', commissionPct: '21', shippingDeductionPerOrder: '45', otherDeductionPct: '0', settlementDays: 21, currency: 'TRY' },
  { code: 'HEPSIBURADA', name: 'Hepsiburada', kind: 'marketplace', commissionPct: '18', shippingDeductionPerOrder: '45', otherDeductionPct: '0', settlementDays: 21, currency: 'TRY' },
  { code: 'SITE', name: 'Kendi Sitemiz (plantero.co)', kind: 'own_site', commissionPct: '0', shippingDeductionPerOrder: '0', otherDeductionPct: '0', settlementDays: 0, currency: 'TRY' },
  { code: 'TOPTAN', name: 'Toptan / Fason', kind: 'wholesale', commissionPct: '0', shippingDeductionPerOrder: '0', otherDeductionPct: '0', settlementDays: 0, currency: 'TRY' },
  { code: 'MIGROS', name: 'Migros', kind: 'retail_chain', commissionPct: '0', shippingDeductionPerOrder: '0', otherDeductionPct: '0', settlementDays: 60, currency: 'TRY' },
  { code: 'IHRACAT', name: 'İhracat', kind: 'export', commissionPct: '0', shippingDeductionPerOrder: '0', otherDeductionPct: '0', settlementDays: 30, currency: 'EUR' },
  { code: 'HAMMADDE', name: 'Doğrudan Hammadde Satışı', kind: 'raw_material', commissionPct: '0', shippingDeductionPerOrder: '0', otherDeductionPct: '0', settlementDays: 0, currency: 'TRY' },
];

async function seedChannelsAndPriceLists(db: DbOrTx, summary: SeedSummary): Promise<{ channelIdByCode: Map<string, string> }> {
  log('masterdata', 'satış kanalları...');
  const channelIdByCode = new Map<string, string>();
  for (const c of CHANNELS) {
    await db
      .insert(salesChannels)
      .values({ code: c.code, name: c.name, kind: c.kind, commissionPct: c.commissionPct, shippingDeductionPerOrder: c.shippingDeductionPerOrder, otherDeductionPct: c.otherDeductionPct, settlementDays: c.settlementDays, currency: c.currency })
      .onConflictDoUpdate({ target: salesChannels.code, set: { name: c.name, kind: c.kind, commissionPct: c.commissionPct, shippingDeductionPerOrder: c.shippingDeductionPerOrder, settlementDays: c.settlementDays, currency: c.currency } });
    const [row] = await db.select({ id: salesChannels.id }).from(salesChannels).where(eq(salesChannels.code, c.code)).limit(1);
    if (row) channelIdByCode.set(c.code, row.id);
  }
  summary.add('sales_channels', channelIdByCode.size);

  log('masterdata', 'fiyat listeleri...');
  const PRICE_LISTS: Array<{ code: string; name: string; currency: string; includesVat: boolean }> = [
    { code: 'PERAKENDE', name: 'Perakende / Pazaryeri Fiyat Listesi', currency: 'TRY', includesVat: true },
    { code: 'TOPTAN', name: 'Toptan Fiyat Listesi', currency: 'TRY', includesVat: true },
    { code: 'IHRACAT', name: 'İhracat Fiyat Listesi (EUR)', currency: 'EUR', includesVat: false },
  ];
  const priceListIdByCode = new Map<string, string>();
  for (const p of PRICE_LISTS) {
    await db
      .insert(priceLists)
      .values({ code: p.code, name: p.name, currency: p.currency, includesVat: p.includesVat })
      .onConflictDoUpdate({ target: priceLists.code, set: { name: p.name, currency: p.currency, includesVat: p.includesVat } });
    const [row] = await db.select({ id: priceLists.id }).from(priceLists).where(eq(priceLists.code, p.code)).limit(1);
    if (row) priceListIdByCode.set(p.code, row.id);
  }
  summary.add('price_lists', priceListIdByCode.size);

  const setDefault = async (channelCode: string, priceListCode: string) => {
    const channelId = channelIdByCode.get(channelCode);
    const priceListId = priceListIdByCode.get(priceListCode);
    if (channelId && priceListId) await db.update(salesChannels).set({ defaultPriceListId: priceListId }).where(eq(salesChannels.id, channelId));
  };
  await setDefault('TRENDYOL', 'PERAKENDE');
  await setDefault('HEPSIBURADA', 'PERAKENDE');
  await setDefault('SITE', 'PERAKENDE');
  await setDefault('MIGROS', 'PERAKENDE');
  await setDefault('TOPTAN', 'TOPTAN');
  await setDefault('IHRACAT', 'IHRACAT');

  /* Aile bazlı fiyatlar — Excel yalnızca aile düzeyinde temsili fiyat verir (KDV dahil pazaryeri / toptan).
     Bazlar ailesinde ambalaj adedi (packQty) fiyatı doğrudan çarpar (2'li/3'lü/6'lı); diğer ailelerde
     her SKU zaten kendi satış birimidir (ör. 10 saşelik kutu tek fiyat), packQty fiyatı etkilemez. */
  type FamilyPrice = { category2: string; perakende: number; toptan: number; ihracatEur: number; scalesByPackQty: boolean };
  const FAMILY_PRICES: FamilyPrice[] = [
    { category2: 'Bitkisel Süt Konsantreleri (Bazlar)', perakende: 450, toptan: 230, ihracatEur: 12, scalesByPackQty: true },
    { category2: 'Barista Serisi', perakende: 420, toptan: 210, ihracatEur: 11, scalesByPackQty: false },
    { category2: 'Protein Tozları', perakende: 650, toptan: 380, ihracatEur: 17, scalesByPackQty: false },
    { category2: 'Sürülebilir Ürünler', perakende: 280, toptan: 160, ihracatEur: 8, scalesByPackQty: false },
    { category2: 'Toz Kremalar', perakende: 190, toptan: 110, ihracatEur: 5, scalesByPackQty: false },
    { category2: 'Kahveler', perakende: 350, toptan: 220, ihracatEur: 9, scalesByPackQty: false },
    { category2: 'Egzotik Ürünler', perakende: 300, toptan: 170, ihracatEur: 8, scalesByPackQty: false },
  ];
  const SET_PRICES: Record<string, number> = {
    '180010101': 1200, '180010201': 1200, '180010301': 1500, '180020101': 1800, '180020201': 3200,
  };

  const finished = await db.select().from(products).where(eq(products.type, 'finished'));
  let itemCount = 0;
  for (const p of finished) {
    if (p.status !== 'active') continue;
    if (p.sku.startsWith('170')) continue; // promosyon: ana fiyat listesinde değil
    const fam = FAMILY_PRICES.find((f) => f.category2 === p.category2);
    const setPrice = SET_PRICES[p.sku];
    if (!fam && setPrice === undefined) continue;

    const scale = fam?.scalesByPackQty ? p.packQty : 1;
    const perakende = setPrice ?? (fam ? fam.perakende * scale : undefined);
    const toptan = setPrice === undefined && fam ? fam.toptan * scale : undefined;
    const ihracatEur = setPrice === undefined && fam ? fam.ihracatEur * scale : undefined;

    // price_list_items'ta (priceListId, productId) üzerinde unique constraint yok (yalnızca index) —
    // onConflictDoUpdate kullanılamaz (Postgres hata verir ve transaction'ı iptal eder); önce oku, sonra yaz.
    const upsertItem = async (priceListCode: string, price: number | undefined) => {
      if (price === undefined) return;
      const priceListId = priceListIdByCode.get(priceListCode);
      if (!priceListId) return;
      const [existing] = await db
        .select({ id: priceListItems.id })
        .from(priceListItems)
        .where(and(eq(priceListItems.priceListId, priceListId), eq(priceListItems.productId, p.id)))
        .limit(1);
      if (existing) await db.update(priceListItems).set({ price: price.toFixed(4) }).where(eq(priceListItems.id, existing.id));
      else await db.insert(priceListItems).values({ priceListId, productId: p.id, minQty: '0', price: price.toFixed(4) });
      itemCount++;
    };
    await upsertItem('PERAKENDE', perakende);
    await upsertItem('TOPTAN', toptan);
    await upsertItem('IHRACAT', ihracatEur);
  }
  summary.add('price_list_items', itemCount);

  return { channelIdByCode };
}

/* ==================================================================== */
/* 5) Cariler (tedarikçi + müşteri + banka)                             */
/* ==================================================================== */

type SupplierDef = { code: string; name: string; skus: string[]; leadTimeDays: number; priceByKgOrAdet: Record<string, number> };

const SUPPLIERS: SupplierDef[] = [
  {
    code: 'S-000001', name: 'Proteinsan Gıda Hammaddeleri Ltd. Şti.',
    skus: ['301010000', '301020000', '303010000', '303020000', '306010000', '306020000', '306030000', '306040000', '306050000', '306060000', '305010000'],
    leadTimeDays: 18,
    priceByKgOrAdet: { '301010000': 380, '301020000': 45, '303010000': 180, '303020000': 220, '306010000': 160, '306020000': 220, '306030000': 300, '306040000': 850, '306050000': 1200, '306060000': 380, '305010000': 1500 },
  },
  {
    code: 'S-000002', name: 'Tatlısu Tatlandırıcı ve Katkı Maddeleri A.Ş.',
    skus: ['302010000', '302020000', '302030000'],
    leadTimeDays: 15,
    priceByKgOrAdet: { '302010000': 120, '302020000': 900, '302030000': 90 },
  },
  {
    code: 'S-000003', name: 'Aromatik Kimya Aroma ve Katkı Ltd. Şti.',
    skus: ['304010000', '304020000', '304030000', '304040000', '304050000', '307010000', '307020000', '308020000', '308030000', '308040000'],
    leadTimeDays: 20,
    priceByKgOrAdet: { '304010000': 650, '304020000': 400, '304030000': 210, '304040000': 380, '304050000': 420, '307010000': 260, '307020000': 15, '308020000': 650, '308030000': 900, '308040000': 120 },
  },
  {
    code: 'S-000004', name: 'Ege Ambalaj Sanayi ve Ticaret A.Ş.',
    skus: ['401010000', '401020000', '401030000', '401040000', '402010000', '402020000', '402030000'],
    leadTimeDays: 12,
    priceByKgOrAdet: { '401010000': 8.5, '401020000': 1.2, '401030000': 0.6, '401040000': 4.5, '402010000': 3.2, '402020000': 0.35, '402030000': 2.8 },
  },
  {
    code: 'S-000005', name: 'Anadolu Kuruyemiş ve Tarım Ürünleri Ltd. Şti.',
    skus: ['301030000', '301040000', '301050000', '301060000'],
    leadTimeDays: 10,
    priceByKgOrAdet: { '301030000': 180, '301040000': 220, '301050000': 260, '301060000': 45 },
  },
  {
    code: 'S-000006', name: 'Kahve Dünyası Yeşil Kahve ve Egzotik Ürünler Ltd. Şti.',
    skus: ['308010000'],
    leadTimeDays: 25,
    priceByKgOrAdet: { '308010000': 220 },
  },
];

type CustomerDef = { code: string; name: string; channelCode: string; termKind: 'cash' | 'days' | 'marketplace_cycle'; termDays: number; country?: string; currency?: string; priceListCode?: string };

const CUSTOMERS: CustomerDef[] = [
  { code: 'C-000001', name: 'Trendyol Pazaryeri', channelCode: 'TRENDYOL', termKind: 'marketplace_cycle', termDays: 21, priceListCode: 'PERAKENDE' },
  { code: 'C-000002', name: 'Hepsiburada Pazaryeri', channelCode: 'HEPSIBURADA', termKind: 'marketplace_cycle', termDays: 21, priceListCode: 'PERAKENDE' },
  { code: 'C-000003', name: 'Migros Ticaret A.Ş.', channelCode: 'MIGROS', termKind: 'days', termDays: 60, priceListCode: 'PERAKENDE' },
  { code: 'C-000004', name: 'Yeşil Sofra Gıda Dağıtım Ltd. Şti.', channelCode: 'TOPTAN', termKind: 'cash', termDays: 0, priceListCode: 'TOPTAN' },
  { code: 'C-000005', name: 'Doğal Yaşam Market Zinciri Ltd. Şti.', channelCode: 'TOPTAN', termKind: 'cash', termDays: 0, priceListCode: 'TOPTAN' },
  { code: 'C-000006', name: 'Fit Life Beslenme Ürünleri Ltd. Şti.', channelCode: 'TOPTAN', termKind: 'cash', termDays: 0, priceListCode: 'TOPTAN' },
  { code: 'C-000007', name: 'BioGrün Handels GmbH', channelCode: 'IHRACAT', termKind: 'days', termDays: 30, country: 'DE', currency: 'EUR', priceListCode: 'IHRACAT' },
  { code: 'C-000008', name: 'Vegan Gıda Üretim San. Tic. Ltd. Şti.', channelCode: 'HAMMADDE', termKind: 'cash', termDays: 0 },
];

async function seedPartners(db: DbOrTx, summary: SeedSummary, channelIdByCode: Map<string, string>): Promise<void> {
  log('masterdata', 'tedarikçiler...');
  const skuToProductId = new Map((await db.select({ id: products.id, sku: products.sku }).from(products)).map((p) => [p.sku, p.id]));
  const priceListIdByCode = new Map((await db.select({ id: priceLists.id, code: priceLists.code }).from(priceLists)).map((p) => [p.code, p.id]));

  let supplierProductCount = 0;
  for (const s of SUPPLIERS) {
    await db
      .insert(partners)
      .values({ code: s.code, name: s.name, kind: 'supplier', country: 'TR', currency: 'TRY', paymentTermKind: 'days', paymentTermDays: 30, supplierLeadTimeDays: s.leadTimeDays, isPurchaseWhitelisted: true })
      .onConflictDoUpdate({ target: partners.code, set: { name: s.name, supplierLeadTimeDays: s.leadTimeDays } });
    const [row] = await db.select({ id: partners.id }).from(partners).where(eq(partners.code, s.code)).limit(1);
    if (!row) continue;
    for (const sku of s.skus) {
      const productId = skuToProductId.get(sku);
      const price = s.priceByKgOrAdet[sku];
      if (!productId || price === undefined) continue;
      await db
        .insert(supplierProducts)
        .values({ partnerId: row.id, productId, price: price.toFixed(4), currency: 'TRY', leadTimeDays: s.leadTimeDays, isPreferred: true })
        .onConflictDoUpdate({ target: [supplierProducts.partnerId, supplierProducts.productId], set: { price: price.toFixed(4), leadTimeDays: s.leadTimeDays } });
      supplierProductCount++;
    }
  }
  summary.add('partners (tedarikçi)', SUPPLIERS.length);
  summary.add('supplier_products', supplierProductCount);

  log('masterdata', 'müşteriler...');
  for (const c of CUSTOMERS) {
    const channelId = channelIdByCode.get(c.channelCode) ?? null;
    const priceListId = c.priceListCode ? (priceListIdByCode.get(c.priceListCode) ?? null) : null;
    await db
      .insert(partners)
      .values({
        code: c.code,
        name: c.name,
        kind: 'customer',
        country: c.country ?? 'TR',
        currency: c.currency ?? 'TRY',
        paymentTermKind: c.termKind,
        paymentTermDays: c.termDays,
        defaultChannelId: channelId,
        priceListId,
      })
      .onConflictDoUpdate({ target: partners.code, set: { name: c.name, paymentTermKind: c.termKind, paymentTermDays: c.termDays, defaultChannelId: channelId, priceListId } });
  }
  summary.add('partners (müşteri)', CUSTOMERS.length);

  log('masterdata', 'banka carileri...');
  const BANKS = [
    { code: 'BNK-000001', name: 'Vakıfbank Tire Şubesi' },
    { code: 'BNK-000002', name: 'QNB Ödemiş Şubesi' },
  ];
  for (const b of BANKS) {
    await db.insert(partners).values({ code: b.code, name: b.name, kind: 'bank', country: 'TR', currency: 'TRY' }).onConflictDoUpdate({ target: partners.code, set: { name: b.name } });
  }
  summary.add('partners (banka)', BANKS.length);
}

/* ==================================================================== */
/* 6) Reçeteler (BOM)                                                   */
/* ==================================================================== */

type RecipeLine = { sku: string; qtyPerUnit: number; scales?: boolean };
const R = (sku: string, qtyPerUnit: number, scales = true): RecipeLine => ({ sku, qtyPerUnit, scales });

const JAR_PACK = (rawSku: string, rawQty: number, sweetenerQty: number, saltQty: number): RecipeLine[] => [
  R(rawSku, rawQty), R('302030000', sweetenerQty), R('307020000', saltQty),
  R('401010000', 1), R('401020000', 1), R('401030000', 1),
];

const RECIPE_BY_BASE7: Record<string, RecipeLine[]> = {
  // Bazlar (Bitkisel Süt Konsantreleri) — jar 500ml
  '1100100': JAR_PACK('301030000', 0.15, 0.03, 0.002), // Badem Bazı
  '1100200': JAR_PACK('301040000', 0.15, 0.03, 0.002), // Fındık Bazı
  '1100300': JAR_PACK('301050000', 0.15, 0.03, 0.002), // Kaju Bazı
  '1100301': JAR_PACK('301050000', 0.18, 0.02, 0.002), // Kaju Bazı ABD
  '1100400': JAR_PACK('301060000', 0.15, 0.03, 0.002), // Yulaf Bazı
  // Barista Base — daha koyu kıvam
  '1200100': JAR_PACK('301030000', 0.20, 0.02, 0.002),
  '1200200': JAR_PACK('301040000', 0.20, 0.02, 0.002),
  '1200300': JAR_PACK('301050000', 0.20, 0.02, 0.002),
  '1200400': JAR_PACK('301060000', 0.20, 0.02, 0.002),
  // Protein Tozları — doypack 1kg (tozun net ağırlığı ~500g)
  '1300100': [R('301010000', 0.30), R('301020000', 0.10), R('302010000', 0.01), R('303010000', 0.005), R('303020000', 0.003), R('306010000', 0.02), R('305010000', 0.002), R('307010000', 0.02), R('402010000', 1), R('401030000', 1)],
  '1300101': [R('301010000', 0.30), R('301020000', 0.10), R('302010000', 0.01), R('303010000', 0.005), R('303020000', 0.003), R('306010000', 0.02), R('305010000', 0.002), R('307010000', 0.02), R('304030000', 0.03), R('304040000', 0.005), R('304020000', 0.003), R('402010000', 1), R('401030000', 1)],
  '1300102': [R('301010000', 0.30), R('301020000', 0.10), R('302010000', 0.01), R('303010000', 0.005), R('303020000', 0.003), R('306010000', 0.02), R('305010000', 0.002), R('307010000', 0.02), R('304050000', 0.005), R('304020000', 0.003), R('402010000', 1), R('401030000', 1)],
  // Sürülebilir Ürünler — ball mill ezme, jar
  '1400301': JAR_PACK('301050000', 0.35, 0.08, 0.002).concat([R('304030000', 0.05)]), // Kakaolu Kaju Ezmesi
  '1400400': JAR_PACK('301060000', 0.40, 0.05, 0.002), // %100 Oat Spredable
  '1400401': JAR_PACK('301060000', 0.35, 0.06, 0.002).concat([R('304030000', 0.05)]), // Oat Chocolate Spredable
  // Toz Kremalar — 10gr x 10 saşe kutu
  '1500400': [R('301060000', 0.006), R('307010000', 0.002), R('304020000', 0.0005), R('402020000', 1), R('401030000', 1, false)],
  // Kahveler — kraft torba 250g
  '1600100': [R('308010000', 0.25), R('402030000', 1), R('401030000', 1)],
  '1600200': [R('308010000', 0.25), R('402030000', 1), R('401030000', 1)],
  '1600300': [R('308010000', 0.25), R('402030000', 1), R('401030000', 1)],
  '1600400': [R('308010000', 0.25), R('402030000', 1), R('401030000', 1)],
  '1600500': [R('308010000', 0.25), R('402030000', 1), R('401030000', 1)],
  // Egzotik Ürünler
  '1600600': [R('308020000', 0.08), R('402010000', 1), R('401030000', 1)], // Matcha
  '1600700': [R('308030000', 0.10), R('402010000', 1), R('401030000', 1)], // Vanilya Tozu
  '1600800': JAR_PACK('308040000', 0.30, 0.05, 0.001), // Hurma Ezmesi (kavanoz)
};

const SET_RECIPES: Record<string, string[]> = {
  '180010101': ['110010001', '110020001', '110030001'],
  '180010201': ['110010001', '110020001', '110040001'],
  '180010301': ['110010001', '110020001', '110040001', '110030001'],
  '180020101': ['130010001', '130010201', '130010101'],
  '180020201': ['110010001', '110020001', '110030001', '130010001', '130010201', '130010101'],
};

const HAT1_FAMILIES = new Set(['Bitkisel Süt Konsantreleri (Bazlar)', 'Barista Serisi', 'Sürülebilir Ürünler', 'Toz Kremalar']);
const HAT2_FAMILIES = new Set(['Protein Tozları', 'Kahveler', 'Paketler & Setler']);

function pickLineCode(p: { category2: string | null; packaging: string | null; name: string }): 'HAT1' | 'HAT2' | 'HAT3' {
  const pack = (p.packaging ?? '').toLocaleLowerCase('tr-TR');
  if (pack.includes('saşe') || pack.includes('sase') || pack.includes('stick')) return 'HAT3';
  if (p.category2 && HAT1_FAMILIES.has(p.category2)) return 'HAT1';
  if (p.category2 && HAT2_FAMILIES.has(p.category2)) return 'HAT2';
  if (p.name.toLocaleUpperCase('tr-TR').includes('EZMESİ')) return 'HAT1';
  return 'HAT2';
}

const CYCLE_MINUTES: Record<'HAT1' | 'HAT2' | 'HAT3', number> = { HAT1: 45, HAT2: 30, HAT3: 20 };

async function seedBoms(db: DbOrTx, summary: SeedSummary): Promise<void> {
  log('masterdata', 'reçeteler (BOM)...');
  const allProducts = await db.select().from(products);
  const bySku = new Map(allProducts.map((p) => [p.sku, p]));
  const lineRows = await db.select().from(productionLines);
  const lineIdByCode = new Map(lineRows.map((l) => [l.code, l.id]));

  let bomCount = 0;
  let bomLineCount = 0;

  const finished = allProducts.filter((p) => p.type === 'finished' && p.status === 'active' && !p.sku.startsWith('170') && p.isManufactured);

  for (const p of finished) {
    const [existing] = await db.select({ id: boms.id }).from(boms).where(eq(boms.code, `BOM-${p.sku}-v1`)).limit(1);
    if (existing) continue; // idempotent: zaten var, tekrar oluşturma

    const isSet = p.sku.startsWith('180');
    const lineCode = isSet ? 'HAT2' : pickLineCode({ category2: p.category2, packaging: p.packaging, name: p.name });
    const defaultLineId = lineIdByCode.get(lineCode) ?? null;

    type Draft = { productId: string; qty: string; uomId: string; sequence: number };
    const draftLines: Draft[] = [];

    if (isSet) {
      const componentSkus = SET_RECIPES[p.sku];
      if (!componentSkus) {
        log('masterdata', `  UYARI: ${p.sku} için set bileşeni tanımlı değil — BOM atlandı`);
        continue;
      }
      let seq = 10;
      for (const compSku of componentSkus) {
        const comp = bySku.get(compSku);
        if (!comp) {
          log('masterdata', `  UYARI: ${p.sku} set bileşeni bulunamadı: ${compSku}`);
          continue;
        }
        draftLines.push({ productId: comp.id, qty: '1.0000', uomId: comp.uomId, sequence: seq });
        seq += 10;
      }
      const etiket = bySku.get('401030000');
      if (etiket) draftLines.push({ productId: etiket.id, qty: '1.0000', uomId: etiket.uomId, sequence: seq });
    } else {
      const base7 = p.sku.slice(0, 7);
      const recipe = RECIPE_BY_BASE7[base7];
      if (!recipe) {
        log('masterdata', `  UYARI: ${p.sku} (base ${base7}) için reçete tanımlı değil — BOM atlandı`);
        continue;
      }
      let seq = 10;
      for (const line of recipe) {
        const ing = bySku.get(line.sku);
        if (!ing) {
          log('masterdata', `  UYARI: ${p.sku} reçetesinde hammadde bulunamadı: ${line.sku}`);
          continue;
        }
        const qty = line.scales === false ? line.qtyPerUnit : line.qtyPerUnit * p.packQty;
        draftLines.push({ productId: ing.id, qty: qty.toFixed(4), uomId: ing.uomId, sequence: seq });
        seq += 10;
      }
      // Bazlar ailesinde 6+ adetlik paketler için dış koli
      if (p.category2 === 'Bitkisel Süt Konsantreleri (Bazlar)' && p.packQty >= 6) {
        const koli = bySku.get('401040000');
        if (koli) draftLines.push({ productId: koli.id, qty: '1.0000', uomId: koli.uomId, sequence: seq });
      }
    }

    if (draftLines.length === 0) continue;

    const [bom] = await db
      .insert(boms)
      .values({
        code: `BOM-${p.sku}-v1`,
        productId: p.id,
        version: 1,
        name: `${p.name} — Standart Reçete`,
        status: 'active',
        outputQty: '1.0000',
        outputUomId: p.uomId,
        expectedYieldPct: '97',
        cycleMinutes: isSet ? 15 : CYCLE_MINUTES[lineCode],
        defaultLineId,
        overheadPerBatch: '50.0000',
        overheadPerUnit: '0.5000',
        note: 'Seed: gerçek reçete verisi yok — makul varsayılan reçete (bkz. docs/ASSUMPTIONS.md A4)',
      })
      .returning({ id: boms.id });
    if (!bom) continue;
    bomCount++;

    await db.insert(bomLines).values(draftLines.map((d) => ({ bomId: bom.id, productId: d.productId, qty: d.qty, uomId: d.uomId, sequence: d.sequence })));
    bomLineCount += draftLines.length;
  }

  summary.add('boms', bomCount);
  summary.add('bom_lines', bomLineCount);
}

/* ==================================================================== */
/* Orkestrasyon                                                         */
/* ==================================================================== */

export async function seedMasterdata(db: DbOrTx, summary: SeedSummary): Promise<void> {
  await seedAnaVeriImport(db, summary);
  await seedNewIngredients(db, summary);
  await seedWarehousesAndLocations(db, summary);
  const { channelIdByCode } = await seedChannelsAndPriceLists(db, summary);
  await seedPartners(db, summary, channelIdByCode);
  await seedBoms(db, summary);
}
