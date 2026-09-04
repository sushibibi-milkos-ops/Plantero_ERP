import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { salesChannels, salesOrders, partners, products, warehouses, deliveries, deliveryLines, invoices, exportShipments, hsCodes } from '../schema/index.js';
import {
  D, SYSTEM_ACTOR, writeAudit,
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

  log('export', 'SO-2026-000023 → kapanmış sevkiyat (ETGB, Almanya) geriye dönük kuruluyor...');
  await backfillClosedShipment(tx, summary);

  log('export', 'yeni ihracat siparişi → gümrükte sevkiyat (standart rejim, Hollanda)...');
  await seedCustomsShipment(tx, summary);

  log('export', 'yeni ihracat siparişi → taslak sevkiyat...');
  await seedDraftShipment(tx, summary);
}
