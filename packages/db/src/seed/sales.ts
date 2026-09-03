import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import {
  opportunityStages, opportunities, salesChannels, partners, products, warehouses, salesOrders,
  channelSettlements, customerPrices, deliveries, priceLists, exchangeRates,
} from '../schema/index.js';
import {
  D, SYSTEM_ACTOR, writeAudit,
  createSalesDoc, updateLines, sendQuotation, acceptQuotation, convertQuotationToOrder, confirmOrder,
  type SalesLineInput,
  createInvoiceFromDelivery,
  ingestChannelOrders, type ChannelOrderInput,
  createOpportunity, moveOpportunity, addActivity, convertToQuotation,
  reserveFefo, confirmPick, shipDelivery,
} from '@plantero/core';
import { log, type SeedSummary } from './_helpers.js';

/**
 * Satış & CRM modülü seed'i — docs/modules/satis.md §Seed.
 * Tüm belge akışları `@plantero/core` servisleri üzerinden üretilir (createSalesDoc/confirmOrder/
 * shipDelivery/createInvoiceFromDelivery/ingestChannelOrders/createOpportunity vb.) — elle insert yok.
 *
 * ÖNEMLİ tarih kısıtı: `accounting.ts` Ocak–Temmuz 2026 dönemlerini kapalı açar (bkz. `stock.ts` seed
 * notu); tüm değerli hareketler (fatura tarihleri dahil) 2026-08-01 .. bugün aralığındadır.
 *
 * ÖNEMLİ varsayım: "Doğrudan Hammadde Satışı" kanalı için satılabilir bir hammadde SKU'su Excel/ana
 * veri seed'inde yok (tüm hammaddeler `is_sellable=false`) — bu seed, Spirulina (306040000) SKU'sunu
 * `is_sellable=true` + `list_price=950` olarak işaretler (yalnızca veri, şema/masterdata dosyası
 * değiştirilmedi) ve Hammadde kanalı siparişinde kullanır. Raporda not düşülmüştür.
 *
 * ÖNEMLİ varsayım: "Kendi Sitemiz" (SITE) kanalı için ana veri seed'inde tek bir müşteri carisi yok
 * (bireysel son tüketiciler modellenmiyor); bu seed C-000009 "Site Perakende Müşterisi" carisini
 * (kind=customer, defaultChannelId=SITE, priceListId=PERAKENDE) oluşturur.
 */

const TODAY = new Date().toISOString().slice(0, 10);

async function auditCreate(tx: DbOrTx, tableName: string, recordId: string, summary: string): Promise<void> {
  await writeAudit(tx, { action: 'create', tableName, recordId, summary }, SYSTEM_ACTOR);
}

async function channelByCode(tx: DbOrTx, code: string) {
  const [row] = await tx.select().from(salesChannels).where(eq(salesChannels.code, code)).limit(1);
  if (!row) throw new Error(`seed:sales — kanal bulunamadı: ${code}`);
  return row;
}
async function customerByCode(tx: DbOrTx, code: string) {
  const [row] = await tx.select().from(partners).where(eq(partners.code, code)).limit(1);
  if (!row) throw new Error(`seed:sales — cari bulunamadı: ${code}`);
  return row;
}
async function productBySku(tx: DbOrTx, sku: string) {
  const [row] = await tx.select().from(products).where(eq(products.sku, sku)).limit(1);
  if (!row) throw new Error(`seed:sales — ürün bulunamadı (SKU): ${sku}`);
  return row;
}
async function warehouseByCode(tx: DbOrTx, code: string) {
  const [row] = await tx.select().from(warehouses).where(eq(warehouses.code, code)).limit(1);
  if (!row) throw new Error(`seed:sales — depo bulunamadı: ${code}`);
  return row;
}

/* ==================================================================== */
/* 0) Ön koşullar: SITE carisi + Hammadde satılabilir SKU                */
/* ==================================================================== */

async function ensureSitePartner(tx: DbOrTx): Promise<void> {
  const site = await channelByCode(tx, 'SITE');
  const perakende = await tx.select({ id: priceLists.id }).from(priceLists).where(eq(priceLists.code, 'PERAKENDE')).limit(1);
  await tx
    .insert(partners)
    .values({
      code: 'C-000009', name: 'Site Perakende Müşterisi', kind: 'customer', country: 'TR', currency: 'TRY',
      paymentTermKind: 'cash', paymentTermDays: 0, defaultChannelId: site.id, priceListId: perakende[0]?.id ?? null,
      note: 'Seed: plantero.co üzerinden gelen bireysel siparişlerin toplandığı temsili cari (gerçek Excel/Ana Veri kaynağında ayrı bir SITE carisi yok).',
    })
    .onConflictDoUpdate({ target: partners.code, set: { name: 'Site Perakende Müşterisi', defaultChannelId: site.id } });
}

async function ensureHammaddeSku(tx: DbOrTx): Promise<void> {
  await tx.update(products).set({ isSellable: true, listPrice: '950.0000' }).where(eq(products.sku, '306040000'));
}

/* ==================================================================== */
/* 1) Fırsat aşamaları                                                   */
/* ==================================================================== */

const STAGES: Array<{ code: string; name: string; probability: number; sortOrder: number; isWon?: boolean; isLost?: boolean }> = [
  { code: 'lead', name: 'Aday', probability: 10, sortOrder: 1 },
  { code: 'qualified', name: 'Nitelikli', probability: 30, sortOrder: 2 },
  { code: 'proposal', name: 'Teklif Aşaması', probability: 50, sortOrder: 3 },
  { code: 'negotiation', name: 'Müzakere', probability: 75, sortOrder: 4 },
  { code: 'won', name: 'Kazanıldı', probability: 100, sortOrder: 5, isWon: true },
  { code: 'lost', name: 'Kaybedildi', probability: 0, sortOrder: 6, isLost: true },
];

async function seedStages(tx: DbOrTx, summary: SeedSummary): Promise<Map<string, string>> {
  const idByCode = new Map<string, string>();
  for (const s of STAGES) {
    await tx.insert(opportunityStages).values(s).onConflictDoNothing({ target: opportunityStages.code });
    const [row] = await tx.select({ id: opportunityStages.id }).from(opportunityStages).where(eq(opportunityStages.code, s.code)).limit(1);
    if (row) idByCode.set(s.code, row.id);
  }
  summary.add('opportunity_stages', idByCode.size);
  return idByCode;
}

/* ==================================================================== */
/* 2) Fırsatlar (12) — 3 kazanılmış → teklif → sipariş                   */
/* ==================================================================== */

type OppDef = {
  title: string; stageCode: string; partnerCode?: string; channelCode?: string; amount: number;
  nextActivityDate?: string | null; source?: string;
};

const OPEN_OPPS: OppDef[] = [
  { title: 'Anadolu Zincir Market — pilot raf denemesi', stageCode: 'lead', channelCode: 'TOPTAN', amount: 45000, nextActivityDate: '2026-09-05', source: 'fuar' },
  { title: 'Ege İhracat Birliği — numune talebi', stageCode: 'lead', channelCode: 'IHRACAT', amount: 120000, nextActivityDate: '2026-08-28', source: 'referral' },
  { title: 'Fit Life — yeni SKU genişletme', stageCode: 'lead', partnerCode: 'C-000006', channelCode: 'TOPTAN', amount: 32000, nextActivityDate: '2026-09-10', source: 'inbound' },
  { title: 'CarrefourSA görüşmesi', stageCode: 'qualified', channelCode: 'TOPTAN', amount: 180000, nextActivityDate: '2026-08-30', source: 'outbound' },
  { title: 'Doğal Yaşam — ek depo/bölge anlaşması', stageCode: 'qualified', partnerCode: 'C-000005', channelCode: 'TOPTAN', amount: 65000, nextActivityDate: '2026-09-08', source: 'referral' },
  { title: 'Hollanda distribütör görüşmesi (BioFresh BV)', stageCode: 'proposal', channelCode: 'IHRACAT', amount: 210000, nextActivityDate: '2026-09-12', source: 'fuar' },
  { title: 'Migros — Barista serisi genişletme', stageCode: 'proposal', partnerCode: 'C-000003', channelCode: 'MIGROS', amount: 95000, nextActivityDate: '2026-08-25', source: 'outbound' },
  { title: 'Vegan Gıda — ek hammadde tedarik anlaşması', stageCode: 'negotiation', partnerCode: 'C-000008', channelCode: 'HAMMADDE', amount: 58000, nextActivityDate: '2026-09-04', source: 'inbound' },
  { title: 'Şok Marketler ön görüşme (kaybedildi)', stageCode: 'lost', channelCode: 'TOPTAN', amount: 40000, nextActivityDate: null, source: 'outbound' },
];

/** Kazanılan → teklife → siparişe dönüştürülecek 3 fırsat */
const WON_OPPS: Array<OppDef & { orderChannelCode: string; orderCustomerCode: string; orderDate: string; lines: Array<{ sku: string; qty: number }>; bucket: Bucket }> = [
  { title: 'Yeşil Sofra — yeni ürün grubu anlaşması', stageCode: 'lead', partnerCode: 'C-000004', channelCode: 'TOPTAN', amount: 28000, orderChannelCode: 'TOPTAN', orderCustomerCode: 'C-000004', orderDate: '2026-08-14', lines: [{ sku: '110040001', qty: 12 }, { sku: '160050001', qty: 6 }], bucket: 'invoiced' },
  { title: 'plantero.co kurumsal hediye paketi siparişi', stageCode: 'qualified', channelCode: 'SITE', amount: 15000, orderChannelCode: 'SITE', orderCustomerCode: 'C-000009', orderDate: '2026-08-19', lines: [{ sku: '150040001', qty: 10 }, { sku: '110040001', qty: 6 }], bucket: 'shipped' },
  { title: 'Migros — Ege bölgesi ek raf anlaşması', stageCode: 'qualified', partnerCode: 'C-000003', channelCode: 'MIGROS', amount: 42000, orderChannelCode: 'MIGROS', orderCustomerCode: 'C-000003', orderDate: '2026-08-27', lines: [{ sku: '110010001', qty: 15 }, { sku: '130010001', qty: 8 }], bucket: 'confirmed' },
];

async function seedOpportunities(tx: DbOrTx, summary: SeedSummary, stageIdByCode: Map<string, string>): Promise<void> {
  let count = 0;
  for (const o of OPEN_OPPS) {
    const partnerId = o.partnerCode ? (await customerByCode(tx, o.partnerCode)).id : null;
    const channelId = o.channelCode ? (await channelByCode(tx, o.channelCode)).id : null;
    const opp = await createOpportunity(tx, {
      title: o.title, partnerId, channelId, stageId: stageIdByCode.get(o.stageCode) ?? null, expectedAmount: D(o.amount),
      currency: 'TRY', nextActivityDate: o.nextActivityDate, source: o.source ?? null,
    }, SYSTEM_ACTOR);
    if (o.stageCode === 'lost') await addActivity(tx, { opportunityId: opp.id, kind: 'note', body: 'Fiyat rekabeti nedeniyle görüşme sonlandırıldı.' }, SYSTEM_ACTOR);
    count += 1;
  }

  for (const o of WON_OPPS) {
    const partnerId = o.partnerCode ? (await customerByCode(tx, o.partnerCode)).id : null;
    const channelId = o.channelCode ? (await channelByCode(tx, o.channelCode)).id : null;
    const opp = await createOpportunity(tx, {
      title: o.title, partnerId, channelId, stageId: stageIdByCode.get(o.stageCode), expectedAmount: D(o.amount), currency: 'TRY', source: 'referral',
    }, SYSTEM_ACTOR);
    await addActivity(tx, { opportunityId: opp.id, kind: 'call', body: 'İlk görüşme yapıldı, ihtiyaç netleştirildi.' }, SYSTEM_ACTOR);
    await addActivity(tx, { opportunityId: opp.id, kind: 'meeting', body: 'Yerinde toplantı — fiyat ve miktar mutabık kalındı.' }, SYSTEM_ACTOR);
    const won = await moveOpportunity(tx, { id: opp.id, stageId: stageIdByCode.get('won')! }, SYSTEM_ACTOR);

    const orderCustomer = await customerByCode(tx, o.orderCustomerCode);
    const orderChannel = await channelByCode(tx, o.orderChannelCode);
    if (won.partnerId !== orderCustomer.id) {
      // Bazı fırsatlarda (ör. SITE) fırsat açılışında cari yok; teklif dönüşümü için önce ata.
      await tx.update(opportunities).set({ partnerId: orderCustomer.id, channelId: orderChannel.id }).where(eq(opportunities.id, opp.id));
    }
    const converted = await convertToQuotation(tx, opp.id, SYSTEM_ACTOR);
    await auditCreate(tx, 'sales_orders', converted.quotationId!, `Teklif ${converted.quotationDocNo} fırsat ${opp.docNo} üzerinden oluşturuldu`);

    const lines: SalesLineInput[] = [];
    for (const l of o.lines) lines.push({ productId: (await productBySku(tx, l.sku)).id, qty: D(l.qty) });
    await updateLines(tx, converted.quotationId!, lines, SYSTEM_ACTOR);
    await sendQuotation(tx, converted.quotationId!, SYSTEM_ACTOR);
    await acceptQuotation(tx, converted.quotationId!, SYSTEM_ACTOR);
    const { order } = await convertQuotationToOrder(tx, converted.quotationId!, SYSTEM_ACTOR);
    await auditCreate(tx, 'sales_orders', order.id, `${order.docNo} teklif ${converted.quotationDocNo} üzerinden oluşturuldu`);
    await tx.update(salesOrders).set({ orderDate: o.orderDate, dueDate: o.orderDate }).where(eq(salesOrders.id, order.id));
    await fulfillOrder(tx, order.id, o.bucket);

    count += 1;
  }
  summary.add('opportunities', count);
}

/* ==================================================================== */
/* 3) Standalone teklif (4.'sü — fırsat kaynaklı değil)                  */
/* ==================================================================== */

async function seedStandaloneQuotation(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  const customer = await customerByCode(tx, 'C-000006');
  const channel = await channelByCode(tx, 'TOPTAN');
  const warehouse = await warehouseByCode(tx, 'TIRE');
  const lines: SalesLineInput[] = [
    { productId: (await productBySku(tx, '120010001')).id, qty: D(20) },
    { productId: (await productBySku(tx, '150040001')).id, qty: D(15) },
  ];
  const { order: quotation } = await createSalesDoc(tx, {
    docType: 'quotation', partnerId: customer.id, channelId: channel.id, warehouseId: warehouse.id,
    orderDate: '2026-08-24', validUntil: '2026-09-24', origin: 'manual', lines,
  }, SYSTEM_ACTOR);
  await auditCreate(tx, 'sales_orders', quotation.id, `Teklif ${quotation.docNo} oluşturuldu`);
  await sendQuotation(tx, quotation.id, SYSTEM_ACTOR);
  summary.add('quotations (bağımsız)', 1);
}

/* ==================================================================== */
/* 4) Manuel siparişler (24 — 30 - 3 fırsat kaynaklı - 3 sync)           */
/* ==================================================================== */

type Bucket = 'draft' | 'confirmed' | 'shipped' | 'invoiced';

type OrderSpec = {
  channelCode: string; customerCode: string; orderDate: string; bucket: Bucket;
  lines: Array<{ sku: string; qty: number }>;
};

const MANUAL_ORDERS: OrderSpec[] = [
  // TRENDYOL (manuel: 4 — 3 sipariş sync ile ayrıca eklenir)
  { channelCode: 'TRENDYOL', customerCode: 'C-000001', orderDate: '2026-09-01', bucket: 'draft', lines: [{ sku: '110010001', qty: 5 }] },
  { channelCode: 'TRENDYOL', customerCode: 'C-000001', orderDate: '2026-08-28', bucket: 'confirmed', lines: [{ sku: '110020001', qty: 6 }, { sku: '130010001', qty: 4 }] },
  { channelCode: 'TRENDYOL', customerCode: 'C-000001', orderDate: '2026-08-20', bucket: 'shipped', lines: [{ sku: '150040001', qty: 8 }] },
  { channelCode: 'TRENDYOL', customerCode: 'C-000001', orderDate: '2026-08-03', bucket: 'invoiced', lines: [{ sku: '110030001', qty: 10 }] },
  { channelCode: 'TRENDYOL', customerCode: 'C-000001', orderDate: '2026-08-25', bucket: 'invoiced', lines: [{ sku: '160020001', qty: 5 }] },
  { channelCode: 'TRENDYOL', customerCode: 'C-000001', orderDate: '2026-08-30', bucket: 'invoiced', lines: [{ sku: '110040001', qty: 12 }] },
  { channelCode: 'TRENDYOL', customerCode: 'C-000001', orderDate: '2026-09-01', bucket: 'invoiced', lines: [{ sku: '120010001', qty: 6 }, { sku: '160050001', qty: 4 }] },

  // HEPSIBURADA (manuel: 5 — 3 sipariş sync ile ayrıca eklenir)
  { channelCode: 'HEPSIBURADA', customerCode: 'C-000002', orderDate: '2026-08-31', bucket: 'draft', lines: [{ sku: '130010001', qty: 5 }] },
  { channelCode: 'HEPSIBURADA', customerCode: 'C-000002', orderDate: '2026-08-26', bucket: 'confirmed', lines: [{ sku: '150040001', qty: 6 }] },
  { channelCode: 'HEPSIBURADA', customerCode: 'C-000002', orderDate: '2026-08-18', bucket: 'shipped', lines: [{ sku: '160050001', qty: 7 }] },
  { channelCode: 'HEPSIBURADA', customerCode: 'C-000002', orderDate: '2026-08-06', bucket: 'invoiced', lines: [{ sku: '110010001', qty: 8 }] },
  { channelCode: 'HEPSIBURADA', customerCode: 'C-000002', orderDate: '2026-08-29', bucket: 'invoiced', lines: [{ sku: '120010001', qty: 5 }] },

  // SITE (2 manuel; 1'i fırsat kaynaklı yukarıda)
  { channelCode: 'SITE', customerCode: 'C-000009', orderDate: '2026-08-27', bucket: 'confirmed', lines: [{ sku: '110020001', qty: 4 }] },
  { channelCode: 'SITE', customerCode: 'C-000009', orderDate: '2026-08-10', bucket: 'invoiced', lines: [{ sku: '130010001', qty: 4 }] },

  // TOPTAN (4 manuel; 1'i fırsat kaynaklı yukarıda)
  { channelCode: 'TOPTAN', customerCode: 'C-000005', orderDate: '2026-09-01', bucket: 'draft', lines: [{ sku: '110030001', qty: 10 }] },
  { channelCode: 'TOPTAN', customerCode: 'C-000006', orderDate: '2026-08-22', bucket: 'shipped', lines: [{ sku: '160020001', qty: 8 }] },
  { channelCode: 'TOPTAN', customerCode: 'C-000004', orderDate: '2026-08-12', bucket: 'invoiced', lines: [{ sku: '110010001', qty: 15 }] },
  { channelCode: 'TOPTAN', customerCode: 'C-000005', orderDate: '2026-08-24', bucket: 'invoiced', lines: [{ sku: '120010001', qty: 9 }] },

  // MIGROS (1 manuel; 1'i fırsat kaynaklı yukarıda)
  { channelCode: 'MIGROS', customerCode: 'C-000003', orderDate: '2026-08-05', bucket: 'invoiced', lines: [{ sku: '150040001', qty: 20 }] },

  // IHRACAT (EUR)
  { channelCode: 'IHRACAT', customerCode: 'C-000007', orderDate: '2026-08-15', bucket: 'invoiced', lines: [{ sku: '160020001', qty: 30 }] },

  // HAMMADDE
  { channelCode: 'HAMMADDE', customerCode: 'C-000008', orderDate: '2026-08-29', bucket: 'shipped', lines: [{ sku: '306040000', qty: 15 }] },
];

/** Onaylanmış siparişi rezerve eder, toplar ve sevk eder (FEFO); gerekirse faturalar. */
async function fulfillOrder(tx: DbOrTx, orderId: string, bucket: Bucket): Promise<void> {
  if (bucket === 'draft') return;
  const { delivery } = await confirmOrder(tx, orderId, SYSTEM_ACTOR);
  await auditCreate(tx, 'deliveries', delivery.id, `İrsaliye taslağı ${delivery.docNo} sipariş onayından oluştu`);

  // 'confirmed' hedefinde de FEFO ile rezerve edilir (I6: lot takipli üründe her delivery_lines.lot_id
  // dolu olmalı) — sipariş durumu yine 'confirmed' kalır, yalnızca depo tarafında rezervasyon yapılmış olur
  // (gerçek SAP B1 akışında onay anında otomatik rezervasyon tipiktir).
  const reserved = await reserveFefo(tx, delivery.id, SYSTEM_ACTOR);
  if (bucket === 'confirmed') return;

  for (const line of reserved.lines) {
    await confirmPick(tx, { deliveryId: delivery.id, lineId: line.id, scannedLotId: line.lotId }, SYSTEM_ACTOR);
  }
  await shipDelivery(tx, delivery.id, SYSTEM_ACTOR);
  if (bucket === 'shipped') return;

  const [order] = await tx.select({ orderDate: salesOrders.orderDate }).from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
  const { invoice } = await createInvoiceFromDelivery(tx, delivery.id, SYSTEM_ACTOR, { invoiceDate: order?.orderDate });
  await auditCreate(tx, 'invoices', invoice.id, `Fatura ${invoice.docNo} kaydedildi (${invoice.grandTotal} ${invoice.currency})`);
}

async function seedManualOrders(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  // Müşteri özel fiyat: Yeşil Sofra (C-000004), BADEM BAZI için toptan fiyatın altında — resolvePrice
  // önceliğini (müşteri özel > liste) ekranda göstermek için.
  const yesilSofra = await customerByCode(tx, 'C-000004');
  const bademBazi = await productBySku(tx, '110010001');
  await tx
    .insert(customerPrices)
    .values({ partnerId: yesilSofra.id, productId: bademBazi.id, minQty: '0', price: '210.0000', currency: 'TRY' })
    .onConflictDoNothing();

  const warehouse = await warehouseByCode(tx, 'TIRE');
  let count = 0;
  for (const spec of MANUAL_ORDERS) {
    const channel = await channelByCode(tx, spec.channelCode);
    const customer = await customerByCode(tx, spec.customerCode);
    const lines: SalesLineInput[] = [];
    for (const l of spec.lines) lines.push({ productId: (await productBySku(tx, l.sku)).id, qty: D(l.qty) });

    const { order } = await createSalesDoc(tx, {
      docType: 'order', partnerId: customer.id, channelId: channel.id, warehouseId: warehouse.id,
      orderDate: spec.orderDate, origin: 'manual', lines,
    }, SYSTEM_ACTOR);
    await auditCreate(tx, 'sales_orders', order.id, `Sipariş ${order.docNo} oluşturuldu (${spec.channelCode})`);
    await fulfillOrder(tx, order.id, spec.bucket);
    count += 1;
  }
  summary.add('sales_orders (manuel)', count);
}

/* ==================================================================== */
/* 5) Pazaryeri senkron simülasyonu (channel_orders → 6 sipariş)         */
/* ==================================================================== */

type SyncOrderSpec = { channelCode: 'TRENDYOL' | 'HEPSIBURADA'; externalId: string; orderedAt: string; barcodeSku: string; qty: number; unitPrice: number; bucket: 'invoiced' | 'shipped' };

const SYNC_ORDERS: SyncOrderSpec[] = [
  { channelCode: 'TRENDYOL', externalId: 'TY-SEED-001', orderedAt: '2026-08-15T11:20:00.000Z', barcodeSku: '110040001', qty: 6, unitPrice: 450, bucket: 'invoiced' },
  { channelCode: 'TRENDYOL', externalId: 'TY-SEED-002', orderedAt: '2026-08-18T14:05:00.000Z', barcodeSku: '150040001', qty: 4, unitPrice: 190, bucket: 'invoiced' },
  { channelCode: 'TRENDYOL', externalId: 'TY-SEED-003', orderedAt: '2026-08-22T09:40:00.000Z', barcodeSku: '160050001', qty: 3, unitPrice: 350, bucket: 'invoiced' },
  { channelCode: 'HEPSIBURADA', externalId: 'HB-SEED-001', orderedAt: '2026-08-14T10:15:00.000Z', barcodeSku: '130010001', qty: 5, unitPrice: 650, bucket: 'invoiced' },
  { channelCode: 'HEPSIBURADA', externalId: 'HB-SEED-002', orderedAt: '2026-08-19T16:30:00.000Z', barcodeSku: '160020001', qty: 4, unitPrice: 350, bucket: 'invoiced' },
  { channelCode: 'HEPSIBURADA', externalId: 'HB-SEED-003', orderedAt: '2026-08-24T13:00:00.000Z', barcodeSku: '120010001', qty: 6, unitPrice: 420, bucket: 'invoiced' },
];

async function seedChannelSync(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  const byChannel = new Map<string, SyncOrderSpec[]>();
  for (const s of SYNC_ORDERS) {
    if (!byChannel.has(s.channelCode)) byChannel.set(s.channelCode, []);
    byChannel.get(s.channelCode)!.push(s);
  }

  let total = 0;
  for (const [channelCode, specs] of byChannel) {
    const channel = await channelByCode(tx, channelCode);
    const orders: ChannelOrderInput[] = [];
    for (const s of specs) {
      const product = await productBySku(tx, s.barcodeSku);
      const gross = s.qty * s.unitPrice;
      const commissionPct = Number(channel.commissionPct);
      const commission = Math.round(gross * (commissionPct / 100) * 100) / 100;
      const shipping = Number(channel.shippingDeductionPerOrder);
      orders.push({
        externalId: s.externalId, orderedAt: s.orderedAt, externalStatus: 'Delivered',
        customerName: 'Pazaryeri Müşterisi', grossAmount: gross.toFixed(4), commissionAmount: commission.toFixed(4),
        shippingAmount: shipping.toFixed(4), netAmount: (gross - commission - shipping).toFixed(4), currency: 'TRY',
        lines: [{ barcode: product.barcode!, sku: product.sku, productName: product.name, qty: String(s.qty), unitPrice: s.unitPrice.toFixed(4) }],
        raw: { sandbox: true, seed: true },
      });
    }
    const result = await ingestChannelOrders(tx, channel.id, orders, SYSTEM_ACTOR);
    for (const created of result.createdOrders) {
      await auditCreate(tx, 'sales_orders', created.salesOrderId, `${created.salesOrderDocNo} pazaryeri senkronundan oluşturuldu (${channelCode})`);
      await auditCreate(tx, 'deliveries', created.deliveryId, `İrsaliye taslağı ${created.deliveryDocNo} sipariş ${created.salesOrderDocNo} onayından oluştu`);
    }
    total += result.converted;

    // Sync sonrası: hepsi 'invoiced' hedefindeyse rezerve→topla→sevk→fatura ile tamamla
    const orderIds = result.createdOrders.map((c) => c.salesOrderId);
    for (const orderId of orderIds) {
      const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
      if (!order) continue;
      const [deliveryRow] = await tx.select({ id: deliveries.id }).from(deliveries).where(eq(deliveries.salesOrderId, order.id)).limit(1);
      const deliveryId = deliveryRow?.id;
      if (!deliveryId) continue;
      const reserved = await reserveFefo(tx, deliveryId, SYSTEM_ACTOR);
      for (const line of reserved.lines) await confirmPick(tx, { deliveryId, lineId: line.id, scannedLotId: line.lotId }, SYSTEM_ACTOR);
      await shipDelivery(tx, deliveryId, SYSTEM_ACTOR);
      const { invoice } = await createInvoiceFromDelivery(tx, deliveryId, SYSTEM_ACTOR, { invoiceDate: order.orderDate });
      await auditCreate(tx, 'invoices', invoice.id, `Fatura ${invoice.docNo} kaydedildi (${invoice.grandTotal} ${invoice.currency})`);
    }
  }
  summary.add('sales_orders (pazaryeri senkronu)', total);
}

/* ==================================================================== */
/* 6) Kanal hakedişleri (channel_settlements)                           */
/* ==================================================================== */

async function seedSettlements(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  const trendyol = await channelByCode(tx, 'TRENDYOL');
  const hepsiburada = await channelByCode(tx, 'HEPSIBURADA');
  await tx.insert(channelSettlements).values([
    {
      channelId: trendyol.id, periodStart: '2026-08-01', periodEnd: '2026-08-15', grossSales: '148500.0000', commissions: '31185.0000',
      shippingDeductions: '2250.0000', otherDeductions: '0.0000', returns: '2100.0000', netPayout: '112965.0000',
      expectedPayoutDate: '2026-09-05', paidAt: '2026-09-05', status: 'paid',
    },
    {
      channelId: hepsiburada.id, periodStart: '2026-08-16', periodEnd: '2026-08-31', grossSales: '96200.0000', commissions: '17316.0000',
      shippingDeductions: '1800.0000', otherDeductions: '0.0000', returns: '1200.0000', netPayout: '75884.0000',
      expectedPayoutDate: '2026-09-21', paidAt: null, status: 'open',
    },
  ]);
  summary.add('channel_settlements', 2);
}

/* ==================================================================== */
/* 7) Döviz kuru (EUR — ihracat siparişi/faturası için)                  */
/* ==================================================================== */

async function seedExchangeRates(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  const DATES = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', '2026-08-29', '2026-09-01', TODAY];
  let count = 0;
  for (const d of Array.from(new Set(DATES))) {
    await tx.insert(exchangeRates).values({ currency: 'EUR', rateDate: d, buying: '37.200000', selling: '37.400000', source: 'TCMB' }).onConflictDoNothing({ target: [exchangeRates.currency, exchangeRates.rateDate] });
    count += 1;
  }
  summary.add('exchange_rates (EUR)', count);
}

/* ==================================================================== */
/* main                                                                  */
/* ==================================================================== */

export async function seedSales(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  const [existing] = await tx.select({ id: opportunities.id }).from(opportunities).limit(1);
  if (existing) {
    log('sales', 'zaten dolu, atlanıyor (idempotent)');
    return;
  }

  log('sales', 'kurulum: SITE carisi + hammadde satılabilir SKU...');
  await ensureSitePartner(tx);
  await ensureHammaddeSku(tx);
  await seedExchangeRates(tx, summary);

  log('sales', 'fırsat aşamaları...');
  const stageIdByCode = await seedStages(tx, summary);

  log('sales', 'fırsatlar (12) + kazanılan 3\'ün teklif→sipariş dönüşümü...');
  await seedOpportunities(tx, summary, stageIdByCode);

  log('sales', 'bağımsız teklif...');
  await seedStandaloneQuotation(tx, summary);

  log('sales', 'manuel siparişler...');
  await seedManualOrders(tx, summary);

  log('sales', 'pazaryeri senkron simülasyonu...');
  await seedChannelSync(tx, summary);

  log('sales', 'kanal hakedişleri...');
  await seedSettlements(tx, summary);
}
