import { pgTable, text, uuid, boolean, integer, date, index, uniqueIndex, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { id, auditColumns, money, qty, note, meta } from './_common.js';
import { users } from './core.js';

/* ------------------------------------------------------------------ */
/* Ürün ana verisi — Konuşan kod SKU: T·AA·BB·CC·PP (9 hane)           */
/* ------------------------------------------------------------------ */

/** T (1. hane) */
export const productTypeEnum = pgEnum('product_type', ['finished', 'semi_finished', 'raw_material', 'packaging', 'merchandise', 'equipment', 'fixed_asset', 'service']);
export const productStatusEnum = pgEnum('product_status', ['active', 'cancelled', 'draft']);
export const costMethodEnum = pgEnum('cost_method', ['lot', 'average', 'standard']);

export const uoms = pgTable('uoms', {
  id: id(),
  code: text('code').notNull(), // ADET, KG, G, L, ML, KOLI, PALET, SASE
  name: text('name').notNull(),
  category: text('category').notNull().default('unit'), // unit, weight, volume
  /** Referans birime çarpan (KG için G = 0.001) */
  ratioToBase: qty('ratio_to_base').notNull().default('1'),
  baseCode: text('base_code'),
}, (t) => [uniqueIndex('uoms_code_uq').on(t.code)]);

/** Kategori ağacı: Kategori 1 → 2 → 3 (Excel) + kod segmenti eşlemesi */
export const productCategories = pgTable('product_categories', {
  id: id(),
  parentId: uuid('parent_id'),
  level: integer('level').notNull().default(1),
  name: text('name').notNull(),
  /** Konuşan kod segmenti: level1 → T, level2 → AA, level3 → BB */
  codeSegment: text('code_segment'),
  path: text('path').notNull(), // "Mamul Ürünler/Bitkisel Süt Konsantreleri (Bazlar)/Badem"
  sortOrder: integer('sort_order').notNull().default(0),
  ...auditColumns,
}, (t) => [uniqueIndex('product_categories_path_uq').on(t.path), index('product_categories_parent_idx').on(t.parentId)]);

/** Konuşan kod segment sözlükleri (Kod Yapısı sayfası) */
export const skuSegments = pgTable('sku_segments', {
  id: id(),
  segment: text('segment').notNull(), // T, AA, BB, CC, PP
  /** Segmentin geçerli olduğu üst bağlam (ör. AA için T="1"; BB için AA="60" kahve) — null = genel */
  context: text('context'),
  code: text('code').notNull(),
  label: text('label').notNull(),
  isReserved: boolean('is_reserved').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [uniqueIndex('sku_segments_uq').on(t.segment, t.context, t.code)]);

export const products = pgTable('products', {
  id: id(),
  /** 9 haneli konuşan kod — değişmez */
  sku: text('sku').notNull(),
  /** PLT-BAZ-BDM-1 gibi kısa kod */
  shortCode: text('short_code'),
  /** Ürün adı — Excel'den geldiği gibi, ASLA değiştirilmez */
  name: text('name').notNull(),
  type: productTypeEnum('type').notNull(),
  status: productStatusEnum('status').notNull().default('active'),
  categoryId: uuid('category_id').references(() => productCategories.id),
  category1: text('category1'),
  category2: text('category2'),
  category3: text('category3'),
  variant: text('variant'),
  packaging: text('packaging'), // "Tekli", "2'li", "6'lı", "10gr x 10 saşe"
  /** Ambalaj içi adet (2'li → 2) */
  packQty: integer('pack_qty').notNull().default(1),
  uomId: uuid('uom_id').notNull().references(() => uoms.id),
  /** Ana barkod (EAN-13) — değişmez; ek barkodlar product_barcodes'ta */
  barcode: text('barcode'),
  caseBarcode: text('case_barcode'),
  oldSku: text('old_sku'),
  /** Excel "Lokasyon" kolonu (eski depo kodu) — bilgi amaçlı */
  legacyLocationCode: text('legacy_location_code'),
  isLotTracked: boolean('is_lot_tracked').notNull().default(true),
  isPurchasable: boolean('is_purchasable').notNull().default(false),
  isSellable: boolean('is_sellable').notNull().default(false),
  isManufactured: boolean('is_manufactured').notNull().default(false),
  costMethod: costMethodEnum('cost_method').notNull().default('lot'),
  /** Lotsuz ürünler için hareketli ağırlıklı ortalama maliyet */
  averageCost: money('average_cost').notNull().default('0'),
  standardCost: money('standard_cost').notNull().default('0'),
  /** Varsayılan raf ömrü (gün) — mamul lot SKT hesabı */
  shelfLifeDays: integer('shelf_life_days'),
  /** FEFO uyarı / raftan kaldırma: SKT'den kaç gün önce (boşsa raf ömründen türetilir) */
  alertDaysBeforeExpiry: integer('alert_days_before_expiry'),
  removalDaysBeforeExpiry: integer('removal_days_before_expiry'),
  /** Kalite: girişte kontrol zorunlu mu, karantina günü */
  requiresIncomingQc: boolean('requires_incoming_qc').notNull().default(false),
  quarantineDays: integer('quarantine_days').notNull().default(0),
  /** Satış */
  vatRate: qty('vat_rate').notNull().default('1'), // % — gıda %1, diğer %20
  purchaseVatRate: qty('purchase_vat_rate').notNull().default('20'),
  listPrice: money('list_price').notNull().default('0'),
  weightKg: qty('weight_kg'),
  /** İhracat */
  hsCode: text('hs_code'), // GTİP
  originCountry: text('origin_country').default('TR'),
  /** Muhasebe hesap eşlemesi (boşsa tipe göre varsayılan) */
  inventoryAccountCode: text('inventory_account_code'),
  cogsAccountCode: text('cogs_account_code'),
  revenueAccountCode: text('revenue_account_code'),
  /** Kritik stok motoru için varsayılanlar (depo bazlı kural yoksa) */
  minQty: qty('min_qty'),
  maxQty: qty('max_qty'),
  leadTimeDays: integer('lead_time_days'),
  imageUrl: text('image_url'),
  note: note(),
  meta: meta(),
  ...auditColumns,
}, (t) => [uniqueIndex('products_sku_uq').on(t.sku), index('products_barcode_idx').on(t.barcode), index('products_type_idx').on(t.type, t.status), index('products_name_idx').on(t.name)]);

/** Ek barkodlar (aynı barkod birden çok SKU'da olabilir — Excel notu; GS1 uyarısı gösterilir) */
export const productBarcodes = pgTable('product_barcodes', {
  id: id(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  barcode: text('barcode').notNull(),
  kind: text('kind').notNull().default('unit'), // unit, case, pallet, extra
  note: note(),
}, (t) => [index('product_barcodes_barcode_idx').on(t.barcode), uniqueIndex('product_barcodes_uq').on(t.productId, t.barcode, t.kind)]);

/* ------------------------------------------------------------------ */
/* Cariler (müşteri / tedarikçi / her ikisi)                          */
/* ------------------------------------------------------------------ */

export const partnerKindEnum = pgEnum('partner_kind', ['customer', 'supplier', 'both', 'bank', 'other']);
export const paymentTermKindEnum = pgEnum('payment_term_kind', ['cash', 'days', 'marketplace_cycle']);

export const partners = pgTable('partners', {
  id: id(),
  code: text('code').notNull(), // C-000001 / S-000001
  name: text('name').notNull(),
  kind: partnerKindEnum('kind').notNull(),
  taxNumber: text('tax_number'), // VKN/TCKN
  taxOffice: text('tax_office'),
  isEInvoiceRegistered: boolean('is_einvoice_registered').notNull().default(false),
  email: text('email'),
  phone: text('phone'),
  whatsapp: text('whatsapp'),
  website: text('website'),
  country: text('country').notNull().default('TR'),
  currency: text('currency').notNull().default('TRY'),
  /** Vade */
  paymentTermKind: paymentTermKindEnum('payment_term_kind').notNull().default('cash'),
  paymentTermDays: integer('payment_term_days').notNull().default(0),
  creditLimit: money('credit_limit'),
  /** Satış kanalı (müşteri) — sales_channels.id */
  defaultChannelId: uuid('default_channel_id'),
  priceListId: uuid('price_list_id'),
  /** Tedarikçi */
  supplierLeadTimeDays: integer('supplier_lead_time_days'),
  supplierQualityScore: qty('supplier_quality_score'), // 0-100, kalite modülü günceller
  isPurchaseWhitelisted: boolean('is_purchase_whitelisted').notNull().default(false),
  /** Muhasebe alt hesapları: 120.xx / 320.xx */
  receivableAccountCode: text('receivable_account_code'),
  payableAccountCode: text('payable_account_code'),
  /** Denormalize bakiye — veri kritik bunu faturalar − tahsilatlar ile doğrular (pozitif = bize borçlu) */
  balance: money('balance').notNull().default('0'),
  isActive: boolean('is_active').notNull().default(true),
  tags: jsonb('tags').$type<string[]>().default([]),
  note: note(),
  meta: meta(),
  ...auditColumns,
}, (t) => [uniqueIndex('partners_code_uq').on(t.code), index('partners_name_idx').on(t.name), index('partners_kind_idx').on(t.kind), index('partners_tax_idx').on(t.taxNumber)]);

export const partnerAddresses = pgTable('partner_addresses', {
  id: id(),
  partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull().default('billing'), // billing, shipping, both
  label: text('label'),
  line1: text('line1').notNull(),
  line2: text('line2'),
  district: text('district'),
  city: text('city'),
  postalCode: text('postal_code'),
  country: text('country').notNull().default('TR'),
  isDefault: boolean('is_default').notNull().default(false),
  ...auditColumns,
}, (t) => [index('partner_addresses_partner_idx').on(t.partnerId)]);

export const partnerContacts = pgTable('partner_contacts', {
  id: id(),
  partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  title: text('title'),
  email: text('email'),
  phone: text('phone'),
  whatsapp: text('whatsapp'),
  isPrimary: boolean('is_primary').notNull().default(false),
  ...auditColumns,
}, (t) => [index('partner_contacts_partner_idx').on(t.partnerId)]);

/** Tedarikçi–ürün ilişkisi: fiyat, lead time, min sipariş */
export const supplierProducts = pgTable('supplier_products', {
  id: id(),
  partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  supplierSku: text('supplier_sku'),
  price: money('price').notNull().default('0'),
  currency: text('currency').notNull().default('TRY'),
  leadTimeDays: integer('lead_time_days').notNull().default(7),
  minOrderQty: qty('min_order_qty').notNull().default('0'),
  isPreferred: boolean('is_preferred').notNull().default(false),
  validFrom: date('valid_from'),
  validTo: date('valid_to'),
  ...auditColumns,
}, (t) => [uniqueIndex('supplier_products_uq').on(t.partnerId, t.productId)]);

/* ------------------------------------------------------------------ */
/* Depo ve lokasyon ağacı — Tire (fabrika) + Buca                      */
/* ------------------------------------------------------------------ */

export const locationUsageEnum = pgEnum('location_usage', ['internal', 'quarantine', 'rejected', 'production', 'supplier', 'customer', 'inventory_loss', 'scrap', 'transit', 'view']);

export const warehouses = pgTable('warehouses', {
  id: id(),
  code: text('code').notNull(), // TIRE, BUCA
  name: text('name').notNull(),
  address: text('address'),
  isProduction: boolean('is_production').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  ...auditColumns,
}, (t) => [uniqueIndex('warehouses_code_uq').on(t.code)]);

export const locations = pgTable('locations', {
  id: id(),
  warehouseId: uuid('warehouse_id').references(() => warehouses.id),
  parentId: uuid('parent_id'),
  code: text('code').notNull(), // TIRE/HAM/R01/A, TIRE/KARANTINA, TIRE/URETIM/HAT1
  name: text('name').notNull(),
  /** Tam yol: "TIRE/HAM/R01/A" — ağaç sorguları için */
  path: text('path').notNull(),
  usage: locationUsageEnum('usage').notNull().default('internal'),
  /** Raf/koridor/sıra bilgileri */
  aisle: text('aisle'),
  rack: text('rack'),
  shelf: text('shelf'),
  barcode: text('barcode'),
  /** Sıcaklık bölgesi vb. */
  zone: text('zone'),
  isPickable: boolean('is_pickable').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  ...auditColumns,
}, (t) => [uniqueIndex('locations_code_uq').on(t.code), index('locations_warehouse_idx').on(t.warehouseId), index('locations_path_idx').on(t.path), index('locations_parent_idx').on(t.parentId)]);

/* ------------------------------------------------------------------ */
/* Reçete (BOM) — versiyonlu; Ar-Ge deneme reçetesi onaylanınca buraya devrolur */
/* ------------------------------------------------------------------ */

export const bomStatusEnum = pgEnum('bom_status', ['draft', 'active', 'archived']);

export const boms = pgTable('boms', {
  id: id(),
  code: text('code').notNull(), // BOM-110010001-v3
  productId: uuid('product_id').notNull().references(() => products.id),
  version: integer('version').notNull().default(1),
  name: text('name'),
  status: bomStatusEnum('status').notNull().default('draft'),
  /** Bu reçete kaç birim mamul üretir (ör. 100 kg parti) */
  outputQty: qty('output_qty').notNull().default('1'),
  outputUomId: uuid('output_uom_id').references(() => uoms.id),
  /** Beklenen verim % (100 = fire yok) */
  expectedYieldPct: qty('expected_yield_pct').notNull().default('100'),
  /** Standart parti süresi (dk) ve varsayılan hat */
  cycleMinutes: integer('cycle_minutes'),
  defaultLineId: uuid('default_line_id'),
  /** Genel gider payı: parti başına sabit + birim başına */
  overheadPerBatch: money('overhead_per_batch').notNull().default('0'),
  overheadPerUnit: money('overhead_per_unit').notNull().default('0'),
  /** Ar-Ge'den devrolduysa kaynak deneme reçetesi versiyonu */
  sourceTrialVersionId: uuid('source_trial_version_id'),
  validFrom: date('valid_from'),
  validTo: date('valid_to'),
  note: note(),
  ...auditColumns,
}, (t) => [uniqueIndex('boms_code_uq').on(t.code), uniqueIndex('boms_product_version_uq').on(t.productId, t.version), index('boms_product_status_idx').on(t.productId, t.status)]);

export const bomLines = pgTable('bom_lines', {
  id: id(),
  bomId: uuid('bom_id').notNull().references(() => boms.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  qty: qty('qty').notNull(),
  uomId: uuid('uom_id').notNull().references(() => uoms.id),
  /** Beklenen fire % (satır bazlı) */
  scrapPct: qty('scrap_pct').notNull().default('0'),
  /** Yan ürün mü (negatif tüketim = çıktı) */
  isByproduct: boolean('is_byproduct').notNull().default(false),
  sequence: integer('sequence').notNull().default(10),
  note: note(),
}, (t) => [index('bom_lines_bom_idx').on(t.bomId)]);

/* ------------------------------------------------------------------ */
/* Üretim hatları                                                      */
/* ------------------------------------------------------------------ */

export const productionLines = pgTable('production_lines', {
  id: id(),
  code: text('code').notNull(), // HAT1..HAT4
  name: text('name').notNull(),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  /** Hattın stok lokasyonu (WIP) */
  locationId: uuid('location_id').notNull().references(() => locations.id),
  /** Kapasite: saatte birim */
  capacityPerHour: qty('capacity_per_hour'),
  /** Vardiya dakikası (OEE planlanan süre) */
  shiftMinutes: integer('shift_minutes').notNull().default(480),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  ...auditColumns,
}, (t) => [uniqueIndex('production_lines_code_uq').on(t.code)]);

/* ------------------------------------------------------------------ */
/* Satış kanalları, fiyat listeleri, müşteri özel fiyat                 */
/* ------------------------------------------------------------------ */

export const channelKindEnum = pgEnum('channel_kind', ['marketplace', 'wholesale', 'retail_chain', 'export', 'direct', 'own_site', 'raw_material']);

export const salesChannels = pgTable('sales_channels', {
  id: id(),
  code: text('code').notNull(), // TRENDYOL, HEPSIBURADA, TOPTAN, MIGROS, IHRACAT, SITE, HAMMADDE
  name: text('name').notNull(),
  kind: channelKindEnum('kind').notNull(),
  /** Komisyon % ve kargo kesintisi (birim başına sabit) → net ciro hesabı */
  commissionPct: qty('commission_pct').notNull().default('0'),
  shippingDeductionPerOrder: money('shipping_deduction_per_order').notNull().default('0'),
  otherDeductionPct: qty('other_deduction_pct').notNull().default('0'),
  /** Tahsilat vadesi (gün): Migros 60, toptan 0, pazaryeri ~21 */
  settlementDays: integer('settlement_days').notNull().default(0),
  currency: text('currency').notNull().default('TRY'),
  defaultPriceListId: uuid('default_price_list_id'),
  /** Pazaryeri API senkron ayarları */
  syncEnabled: boolean('sync_enabled').notNull().default(false),
  syncConfig: jsonb('sync_config').$type<Record<string, unknown>>().default({}),
  color: text('color'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  ...auditColumns,
}, (t) => [uniqueIndex('sales_channels_code_uq').on(t.code)]);

export const priceLists = pgTable('price_lists', {
  id: id(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  currency: text('currency').notNull().default('TRY'),
  includesVat: boolean('includes_vat').notNull().default(false),
  channelId: uuid('channel_id').references(() => salesChannels.id),
  validFrom: date('valid_from'),
  validTo: date('valid_to'),
  isActive: boolean('is_active').notNull().default(true),
  ...auditColumns,
}, (t) => [uniqueIndex('price_lists_code_uq').on(t.code)]);

export const priceListItems = pgTable('price_list_items', {
  id: id(),
  priceListId: uuid('price_list_id').notNull().references(() => priceLists.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  minQty: qty('min_qty').notNull().default('0'),
  price: money('price').notNull(),
  validFrom: date('valid_from'),
  validTo: date('valid_to'),
  ...auditColumns,
}, (t) => [index('price_list_items_list_product_idx').on(t.priceListId, t.productId)]);

/** Müşteriye özel fiyat — fiyat listesini ezer */
export const customerPrices = pgTable('customer_prices', {
  id: id(),
  partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  minQty: qty('min_qty').notNull().default('0'),
  price: money('price').notNull(),
  currency: text('currency').notNull().default('TRY'),
  validFrom: date('valid_from'),
  validTo: date('valid_to'),
  approvedBy: uuid('approved_by').references(() => users.id),
  ...auditColumns,
}, (t) => [index('customer_prices_partner_product_idx').on(t.partnerId, t.productId)]);
