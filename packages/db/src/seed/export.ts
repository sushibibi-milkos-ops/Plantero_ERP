import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { salesChannels, salesOrders, partners, products, warehouses, deliveries, deliveryLines, invoices, exportShipments, exchangeRates, hsCodes } from '../schema/index.js';
import {
  D, toDbRate, SYSTEM_ACTOR, writeAudit,
  createSalesDoc, confirmOrder,
  reserveFefo, confirmPick, shipDelivery,
  createFromOrder, updateLogistics, generateProforma, linkDelivery, buildPackingList, advanceToCustoms, markShipped, linkInvoice, closeShipment,
} from '@plantero/core';
import { log, type SeedSummary } from './_helpers.js';

/**
 * İhracat sevkiyat zinciri — docs/modules/ihracat.md, docs/INVARIANTS.md I36 kapatma dolgusu (Tur 3
 * P1 bulgusu). `packages/core/src/export/{shipments,documents,etgb}.ts` yazıldıktan sonra buradaki
 * geriye dönük dolgu, satın-alma modülünün I24 seed-backfill örüntüsünü izler: `sales` adımının
 * ürettiği TEK ihracat siparişi (SO-2026-000023, kanal=IHRACAT, EUR) zaten fatura+tahsilat+kur farkı
 * fişiyle tamamlanmış ama hiçbir `export_shipments` kaydına bağlı değildi — bu adım onu geriye dönük
 * kapanmış bir sevkiyata bağlar, ayrıca docs/modules/ihracat.md'nin istediği 3 sevkiyatlık senaryoyu
 * (1 kapanmış ETGB+kur farkı fişli, 1 gümrükte/standart, 1 taslak) tamamlamak için KENDİ iki yeni
 * ihracat siparişini (aynı mevcut ihracat müşterisi C-000007 üzerinden, `sales.ts`'e DOKUNMADAN, tek
 * satış siparişi/fatura/sevkiyat yazma noktaları — `sales/orders.ts`, `sales/invoicing.ts`,
 * `stock/deliveries.ts` — üzerinden) üretir. Bu dosya, `sales`/`accounting-docs`/`bank` adımlarından
 * SONRA, `purchasing-backfill`'den ÖNCE çalışır (bkz. `seed/index.ts`) — ihracat siparişinin fatura/
 * tahsilat/kur farkı zincirinin tamamı o ana kadar zaten var olmalı.
 */

async function auditCreate(tx: DbOrTx, tableName: string, recordId: string | undefined, summary: string): Promise<void> {
  await writeAudit(tx, { action: 'create', tableName, recordId: recordId ?? null, summary }, SYSTEM_ACTOR);
}

async function channelByCode(tx: DbOrTx, code: string) {
  const [row] = await tx.select().from(salesChannels).where(eq(salesChannels.code, code)).limit(1);
  if (!row) throw new Error(`seed:export — kanal bulunamadı: ${code}`);
  return row;
}
async function partnerByCode(tx: DbOrTx, code: string) {
  const [row] = await tx.select().from(partners).where(eq(partners.code, code)).limit(1);
  if (!row) throw new Error(`seed:export — cari bulunamadı: ${code}`);
  return row;
}
async function productBySku(tx: DbOrTx, sku: string) {
  const [row] = await tx.select().from(products).where(eq(products.sku, sku)).limit(1);
  if (!row) throw new Error(`seed:export — ürün bulunamadı (SKU): ${sku}`);
  return row;
}
async function warehouseByCode(tx: DbOrTx, code: string) {
  const [row] = await tx.select().from(warehouses).where(eq(warehouses.code, code)).limit(1);
  if (!row) throw new Error(`seed:export — depo bulunamadı: ${code}`);
  return row;
}

/* ==================================================================== */
/* 0) GTİP kodları — docs/modules/ihracat.md "GTİP" referans listesi     */
/* ==================================================================== */

const HS_CODES: Array<{ code: string; description: string; unit: string }> = [
  { code: '2202.99', description: 'Bitkisel içecekler (badem/yulaf/kaju sütü vb.)', unit: 'LT' },
  { code: '2106.10', description: 'Protein konsantreleri ve dokulandırılmış proteinli maddeler', unit: 'KG' },
  { code: '2008.19', description: 'Diğer kabuklu meyveler, karışımlar dahil (ezme/spread)', unit: 'KG' },
  { code: '0901.21', description: 'Kavrulmuş kahve (kafeinsiz olmayan)', unit: 'KG' },
];

async function seedHsCodes(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  let count = 0;
  for (const h of HS_CODES) {
    await tx.insert(hsCodes).values(h).onConflictDoNothing({ target: hsCodes.code });
    count += 1;
  }
  summary.add('hs_codes', count);
}

/**
 * Ürün → GTİP eşlemesi (Tur 2 P1 ihracat-gtip-05 kök neden düzeltmesi): kanonik seed hiçbir satılabilir
 * ürüne `products.hs_code` atamıyordu (39/39 boş) — `/ihracat/gtip`'in var oluş sebebi olan sütun tek
 * değer ("Eşlenmedi") taşıyordu ve aşağı akışta gümrükte olan bir sevkiyatın (EXP-2026-000002, GB
 * numaralı) çeki listesinde GTİP hücresi '—' kalıyordu. Bu modülün SEVK ETTİĞİ ürünler (bu dosyadaki
 * `seedCustomsShipment`/`seedDraftShipment`/`seedPendingExportOrder` satırlarının SKU'ları + geriye
 * dönük kapatılan SO-2026-000023'ün SKU'su) yukarıdaki `HS_CODES` referans listesindeki iki koda
 * eşlenir (badem içeceği → 2202.99, kavrulmuş kahve → 0901.21) — `distinct ≥ 2` ve gerçek bir GTİP
 * kodu çeki listesinde görünür olur. `products.hs_code` şema kolonu zaten var (masterdata.ts); bu
 * yalnızca bir UPDATE'tir, şema değişikliği değildir.
 */
const HS_CODE_PRODUCT_MAP: Array<{ sku: string; hsCode: string }> = [
  { sku: '190010001', hsCode: '2202.99' }, // Badem İçeceği 1L UHT (tekli) — seedDraftShipment
  { sku: '190010099', hsCode: '2202.99' }, // Badem İçeceği 1L UHT (palet) — seedCustomsShipment
  { sku: '190010003', hsCode: '2202.99' }, // Badem İçeceği 1L UHT (3'lü) — seedPendingExportOrder
  { sku: '160020001', hsCode: '0901.21' }, // Plantero Costa Rica Kahve — SO-2026-000023 (backfillClosedShipment)
];

async function seedProductHsCodes(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  let count = 0;
  for (const { sku, hsCode } of HS_CODE_PRODUCT_MAP) {
    const res = await tx.update(products).set({ hsCode }).where(eq(products.sku, sku)).returning({ id: products.id });
    if (res.length) count += 1;
  }
  summary.add('products.hs_code (eşlenen ürün)', count);
}

/* ==================================================================== */
/* 0b) TCMB kur geçmişi (son 90 gün) — docs/modules/ihracat.md "/ihracat/kurlar" */
/* ==================================================================== */

/**
 * FNV-1a benzeri deterministik 0..1 hash — `packages/integrations/src/rates/tcmb.ts`'nin sandbox
 * `seededRandom`'ıyla AYNI amaç (para birimi+tarih başına tekrarlanabilir sapma) ama `packages/db`
 * `@plantero/integrations`'a bağımlı OLMADIĞINDAN (paket sınırı — bu dosyanın yazma yetkisi yalnızca
 * `packages/db/src/seed/export.ts`, `package.json`'a yeni bağımlılık ekleyemem) burada bağımsız olarak
 * yeniden uygulanır. Gerçek TCMB entegrasyonuyla birebir aynı sayıları ÜRETMEZ — yalnızca /ihracat/kurlar
 * grafiğinin 90 günlük, gerçekçi görünen bir seri göstermesi için kullanılır.
 */
function hash01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

const RATE_HISTORY_DAYS = 90;
// KASITLI OLARAK GBP YOK: `packages/core/src/sales/pricing.test.ts::getExchangeRate` testi ("TRY her
// zaman 1 döner; döviz için en yakın geçmiş kur seçilir") GBP'nin paylaşılan geliştirme veritabanında
// HİÇ kayıtlı olmadığını (dolayısıyla test kendi izole GBP satırını ekleyip kullanabildiğini) açıkça
// varsayıyor ve belgeliyor ("GBP: gerçek seed hiçbir yerde kullanmıyor"). Bu modülün seed'i başka bir
// modülün (sales) testini bozamayacağından (rule: yalnızca kendi modülüne yaz + kendi modülün dışına
// yan etki üretme) burada GBP kasıtlı olarak dışarıda bırakılır — `/ihracat/kurlar` GBP KPI'sı gerçek
// veri gelene kadar dürüstçe "—" gösterir, "Bugünü çek" (packages/integrations tcmb sandbox) her üç
// para birimini de anında doldurur.
const RATE_BASE: Record<string, { buying: number; selling: number }> = {
  USD: { buying: 34.1, selling: 34.25 },
  EUR: { buying: 37.2, selling: 37.4 },
};

/**
 * Son 90 günün USD/EUR alış-satışını doldurur — hafif bir düşüş trendi (geçmişe gidildikçe TL
 * daha güçlü) + ±%1,5 günlük sapma. `onConflictDoNothing`: `finance-payments` seed adımı bu adımdan
 * ÖNCE çalışıp bazı günler için gerçek/kritik kurları (ör. I13 kur farkı senaryosu için özel EUR
 * satırı) zaten yazmış olabilir — bu geçmiş dolgusu onları asla ezmez, yalnızca boşlukları doldurur.
 */
async function seedExchangeRateHistory(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  const today = new Date();
  let inserted = 0;
  for (let i = 0; i < RATE_HISTORY_DAYS; i += 1) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    for (const [currency, base] of Object.entries(RATE_BASE)) {
      const noise = hash01(`${currency}-${iso}`);
      const trend = 1 - i * 0.0007; // geçmişe gidildikçe TL bir miktar daha değerli
      const variance = 1 + (noise - 0.5) * 0.03; // ±%1,5 günlük sapma
      const buying = D(base.buying).mul(trend).mul(variance);
      const spreadRatio = D(base.selling).div(base.buying);
      const selling = buying.mul(spreadRatio);
      const res = await tx
        .insert(exchangeRates)
        .values({ currency, rateDate: iso, buying: toDbRate(buying), selling: toDbRate(selling), source: 'TCMB-SEED' })
        .onConflictDoNothing({ target: [exchangeRates.currency, exchangeRates.rateDate] })
        .returning({ id: exchangeRates.id });
      if (res.length) inserted += 1;
    }
  }
  summary.add('exchange_rates (90 gün geçmiş dolgu)', inserted);
}

/* ==================================================================== */
/* 1) SO-2026-000023 → geriye dönük KAPANMIŞ sevkiyat (ETGB, Almanya)    */
/* ==================================================================== */

async function backfillClosedShipment(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.docNo, 'SO-2026-000023')).limit(1);
  if (!order) {
    log('export', 'UYARI: SO-2026-000023 bulunamadı — kapanmış sevkiyat dolgusu atlanıyor (sales seed sırası değişmiş olabilir)');
    return;
  }
  if (order.exportShipmentId) {
    log('export', `${order.docNo} zaten bir sevkiyata bağlı — atlanıyor (idempotent)`);
    return;
  }
  const [delivery] = await tx.select().from(deliveries).where(eq(deliveries.salesOrderId, order.id)).limit(1);
  const [invoice] = await tx.select().from(invoices).where(eq(invoices.salesOrderId, order.id)).limit(1);
  if (!delivery || !invoice) {
    log('export', `UYARI: ${order.docNo} için irsaliye/fatura bulunamadı — kapanmış sevkiyat dolgusu atlanıyor`);
    return;
  }

  const shipment = await createFromOrder(tx, {
    salesOrderId: order.id, incoterm: 'FOB', incotermPlace: 'İzmir', destinationCountry: 'DE',
    portOfLoading: 'İzmir Alsancak Limanı', portOfDischarge: 'Hamburg', transportMode: 'road', carrier: 'DHL Freight',
    note: 'Geriye dönük oluşturuldu: sipariş fatura+tahsilat+kur farkı fişiyle tamamlanmıştı ama sevkiyat zinciri hiç kurulmamıştı (docs/INVARIANTS.md I36)',
  }, SYSTEM_ACTOR);
  await generateProforma(tx, shipment.id, SYSTEM_ACTOR);
  await linkDelivery(tx, shipment.id, delivery.id, SYSTEM_ACTOR);
  await buildPackingList(tx, shipment.id, SYSTEM_ACTOR);
  const advanced = await advanceToCustoms(tx, shipment.id, { etgbNo: 'ETGB2026DE00123', customsDate: order.orderDate }, SYSTEM_ACTOR);
  await markShipped(tx, shipment.id, SYSTEM_ACTOR);
  await linkInvoice(tx, shipment.id, invoice.id, SYSTEM_ACTOR);
  const closed = await closeShipment(tx, shipment.id, SYSTEM_ACTOR);

  await auditCreate(tx, 'export_shipments', closed.id, `${closed.docNo} geriye dönük kapanmış sevkiyat olarak kuruldu (${order.docNo} → ${delivery.docNo} → ${invoice.docNo}), rejim: ${advanced.regime}`);
  summary.add('export_shipments (kapanmış — geriye dönük)', 1);
}

/* ==================================================================== */
/* 2) Yeni ihracat siparişi + sevkiyat (gümrükte, standart rejim)        */
/* ==================================================================== */

async function seedCustomsShipment(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  const channel = await channelByCode(tx, 'IHRACAT');
  const customer = await partnerByCode(tx, 'C-000007');
  const warehouse = await warehouseByCode(tx, 'TIRE');
  // Palet ambalajlı toptan SKU (480 palet elde) — 40 palet × 420 EUR = 16.800 EUR: ETGB sınırını (15.000 EUR)
  // bilerek aşar, docs/modules/ihracat.md'nin "standart rejim, gümrükte" senaryosunu üretir.
  const product = await productBySku(tx, '190010099');

  const { order } = await createSalesDoc(tx, {
    docType: 'order', partnerId: customer.id, channelId: channel.id, warehouseId: warehouse.id,
    orderDate: new Date(Date.now() - 5 * 86_400_000), currency: 'EUR', incoterm: 'CIF', customerRef: 'SEED-EXPORT-CUSTOMS',
    origin: 'manual', note: 'Palet bazlı toptan ihracat siparişi (seed demo verisi)',
    lines: [{ productId: product.id, qty: D(40), unitPrice: D('420.00') }],
  }, SYSTEM_ACTOR);
  await auditCreate(tx, 'sales_orders', order.id, `${order.docNo} ihracat siparişi oluşturuldu (${customer.name}, palet bazlı toptan — seed demo verisi)`);
  const { delivery } = await confirmOrder(tx, order.id, SYSTEM_ACTOR);
  await auditCreate(tx, 'deliveries', delivery.id, `İrsaliye taslağı ${delivery.docNo} sipariş ${order.docNo} onayından oluştu`);
  await reserveFefo(tx, delivery.id, SYSTEM_ACTOR);
  const lines = await tx.select().from(deliveryLines).where(eq(deliveryLines.deliveryId, delivery.id));
  for (const line of lines) await confirmPick(tx, { deliveryId: delivery.id, lineId: line.id, scannedLotId: line.lotId }, SYSTEM_ACTOR);
  await shipDelivery(tx, delivery.id, SYSTEM_ACTOR);

  const shipment = await createFromOrder(tx, {
    salesOrderId: order.id, incoterm: 'CIF', incotermPlace: 'Rotterdam', destinationCountry: 'NL',
    portOfLoading: 'İzmir Alsancak Limanı', portOfDischarge: 'Rotterdam', transportMode: 'sea', carrier: 'Maersk',
  }, SYSTEM_ACTOR);
  await generateProforma(tx, shipment.id, SYSTEM_ACTOR);
  await linkDelivery(tx, shipment.id, delivery.id, SYSTEM_ACTOR);
  const packed = await buildPackingList(tx, shipment.id, SYSTEM_ACTOR);
  await updateLogistics(tx, shipment.id, { trackingNo: 'MAEU-SEED-0042', etd: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10) }, SYSTEM_ACTOR);
  const customs = await advanceToCustoms(tx, shipment.id, { customsDeclarationNo: 'GB2026000045', customsDate: new Date().toISOString().slice(0, 10) }, SYSTEM_ACTOR);

  await auditCreate(tx, 'export_shipments', customs.id, `${customs.docNo} gümrükte (rejim: ${packed.shipment.regime}, ${customs.customsDeclarationNo})`);
  summary.add('export_shipments (gümrükte)', 1);
}

/* ==================================================================== */
/* 3) Yeni ihracat siparişi + sevkiyat (taslak)                          */
/* ==================================================================== */

async function seedDraftShipment(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  const channel = await channelByCode(tx, 'IHRACAT');
  const customer = await partnerByCode(tx, 'C-000007');
  const warehouse = await warehouseByCode(tx, 'TIRE');
  const product = await productBySku(tx, '190010001');

  const { order } = await createSalesDoc(tx, {
    docType: 'order', partnerId: customer.id, channelId: channel.id, warehouseId: warehouse.id,
    orderDate: new Date(), currency: 'EUR', incoterm: 'EXW', customerRef: 'SEED-EXPORT-DRAFT',
    origin: 'manual', note: 'Numune sonrası ilk sipariş — henüz proforma gönderilmedi (seed demo verisi)',
    lines: [{ productId: product.id, qty: D(20), unitPrice: D('3.60') }],
  }, SYSTEM_ACTOR);
  await auditCreate(tx, 'sales_orders', order.id, `${order.docNo} ihracat siparişi oluşturuldu (${customer.name} — seed demo verisi)`);
  const { delivery } = await confirmOrder(tx, order.id, SYSTEM_ACTOR);
  await auditCreate(tx, 'deliveries', delivery.id, `İrsaliye taslağı ${delivery.docNo} sipariş ${order.docNo} onayından oluştu`);

  const shipment = await createFromOrder(tx, {
    salesOrderId: order.id, incoterm: 'EXW', destinationCountry: 'DE', transportMode: 'road',
    note: 'İlk küçük parti — lojistik henüz netleşmedi',
  }, SYSTEM_ACTOR);

  await auditCreate(tx, 'export_shipments', shipment.id, `${shipment.docNo} taslak olarak açıldı (${order.docNo})`);
  summary.add('export_shipments (taslak)', 1);
}

/* ==================================================================== */
/* 4) Yeni ihracat siparişi — HENÜZ sevkiyata bağlanmamış (Tur 1 P0)     */
/* ==================================================================== */

/**
 * `/ihracat/sevkiyatlar/yeni` formunun (ShipmentCreateForm) render olabilmesi için
 * `listEligibleExportOrders` en az 1 satır dönmeli. Yukarıdaki 3 senaryonun (kapanmış/gümrükte/
 * taslak) ÜÇÜ DE kendi sevkiyatını `createFromOrder` ile anında kurduğundan
 * `sales_orders.export_shipment_id` her zaman dolu kalıyor, form daima boş duruma düşüyordu
 * (Tur 1 P0, ihracat-yeni-01 — ölçüm: `SELECT count(*) FROM sales_orders WHERE doc_type='order'
 * AND is_export AND export_shipment_id IS NULL` → 0).
 *
 * ÖNEMLİ KISIT — `docs/INVARIANTS.md` I36 (`36_export_shipment_gap.sql`): `draft`/`cancelled`
 * DIŞINDAKİ her `is_export=true` sipariş bir sevkiyata bağlı OLMALI; bu yüzden sevkiyatsız
 * bırakılan sipariş `confirmOrder` ile onaylanamaz (onaylanmış ama sevkiyatsız bir ihracat
 * siparişi I36'yı ihlal eder — ilk denemede tam olarak bu yüzden `pnpm test` kırmızı çıktı).
 * Sipariş bilinçli olarak `draft` bırakılır — I36'nın MUAF tuttuğu tek durum ve gerçek akışın
 * ("satış ekibi ihracat siparişini önce oluşturur, ihracat ekibi sevkiyatı bundan SONRA kurar")
 * en erken/doğal adımıyla birebir örtüşür.
 */
async function seedPendingExportOrder(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  const channel = await channelByCode(tx, 'IHRACAT');
  const customer = await partnerByCode(tx, 'C-000007');
  const warehouse = await warehouseByCode(tx, 'TIRE');
  const product = await productBySku(tx, '190010003'); // Badem İçeceği 1L UHT (3'lü) — stock seed'te mevcut stoklu

  const { order } = await createSalesDoc(tx, {
    docType: 'order', partnerId: customer.id, channelId: channel.id, warehouseId: warehouse.id,
    orderDate: new Date(Date.now() - 1 * 86_400_000), currency: 'EUR', incoterm: 'FOB', customerRef: 'SEED-EXPORT-PENDING',
    origin: 'manual', note: 'Taslak — henüz onaylanmadı, sevkiyat açılmadı (seed demo verisi) — /ihracat/sevkiyatlar/yeni formunu besler',
    lines: [{ productId: product.id, qty: D(20), unitPrice: D('10.80') }],
  }, SYSTEM_ACTOR);
  await auditCreate(tx, 'sales_orders', order.id, `${order.docNo} ihracat siparişi oluşturuldu (${customer.name} — seed demo verisi, taslak, sevkiyat henüz açılmadı)`);
  summary.add('sales_orders (ihracat, sevkiyata bağlanmamış)', 1);
}

/* ==================================================================== */
/* main                                                                  */
/* ==================================================================== */

export async function seedExport(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  const [existing] = await tx.select({ id: exportShipments.id }).from(exportShipments).limit(1);
  if (existing) {
    log('export', 'zaten dolu, atlanıyor (idempotent)');
    return;
  }

  log('export', 'GTİP kodları...');
  await seedHsCodes(tx, summary);

  log('export', 'ürün → GTİP eşlemesi (sevk edilen ürünler)...');
  await seedProductHsCodes(tx, summary);

  log('export', 'TCMB kur geçmişi (son 90 gün, USD/EUR/GBP)...');
  await seedExchangeRateHistory(tx, summary);

  log('export', 'SO-2026-000023 → kapanmış sevkiyat (ETGB, Almanya) geriye dönük kuruluyor...');
  await backfillClosedShipment(tx, summary);

  log('export', 'yeni ihracat siparişi → gümrükte sevkiyat (standart rejim, Hollanda)...');
  await seedCustomsShipment(tx, summary);

  log('export', 'yeni ihracat siparişi → taslak sevkiyat...');
  await seedDraftShipment(tx, summary);

  log('export', 'yeni ihracat siparişi → sevkiyat henüz açılmadı (taslak, sevkiyata bağlanmamış — I36 muafiyeti)...');
  await seedPendingExportOrder(tx, summary);
}
