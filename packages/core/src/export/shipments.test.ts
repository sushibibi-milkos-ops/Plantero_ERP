import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { journals, salesChannels, exchangeRates, exportShipments, exportDocuments, invoices, salesOrders, products, deliveryLines, type Tx } from '@plantero/db';
import { withRollback, seedBase, ctx, d, today, type Base } from '../__tests__/helpers.js';
import { createSalesDoc, confirmOrder } from '../sales/orders.js';
import { createInvoiceFromDelivery } from '../sales/invoicing.js';
import { createLot, postStockMove } from '../stock/ledger.js';
import { reserveFefo, confirmPick, shipDelivery } from '../stock/deliveries.js';
import { createFromOrder, updateLogistics, generateProforma, linkDelivery, buildPackingList, advanceToCustoms, markShipped, markShipmentDelivered, linkInvoice, closeShipment, cancelShipment } from './shipments.js';
import { docProgress } from './documents.js';

async function ensureSalesJournal(tx: Tx) {
  await tx.insert(journals).values({ code: 'SAT', name: 'Satış Yevmiyesi', kind: 'sales' as const, defaultAccountCode: '600' }).onConflictDoNothing({ target: journals.code });
}

async function seedExportFixtures(tx: Tx, b: Base) {
  await ensureSalesJournal(tx);
  await tx.insert(exchangeRates).values({ currency: 'EUR', rateDate: today(), buying: '37.200000', selling: '37.400000', source: 'TCMB-TEST' }).onConflictDoNothing({ target: [exchangeRates.currency, exchangeRates.rateDate] });
  const [channel] = await tx.insert(salesChannels).values({ code: `IHR-${b.s}`, name: `İhracat ${b.s}`, kind: 'export', currency: 'EUR' }).returning();
  await tx.update(products).set({ weightKg: '0.5000' }).where(eq(products.id, b.finished.id));
  return channel!;
}

async function stockFinished(tx: Tx, b: Base, lotNo: string, qty: string) {
  const lot = await createLot(tx, { productId: b.finished.id, lotNo, origin: 'production', unitCost: d(40), status: 'released' }, ctx);
  await postStockMove(tx, { kind: 'production', productId: b.finished.id, lotId: lot.id, fromLocationId: b.loc.prod.id, toLocationId: b.loc.mamul.id, qty: d(qty), uomId: b.kg.id, unitCost: d(40), refType: 'work_order', refId: '00000000-0000-4000-8000-000000000099' }, ctx);
  return lot;
}

/** Sipariş → onay → sevk → fatura zincirini kurar (export sevkiyat testleri ortak hazırlığı). */
async function buildExportOrder(tx: Tx, b: Base, channelId: string, qty: string, unitPrice: string) {
  await stockFinished(tx, b, `PL-EXP-${b.s}`, qty);
  const { order } = await createSalesDoc(tx, {
    docType: 'order', partnerId: b.customer.id, channelId, warehouseId: b.wh.id, orderDate: today(), currency: 'EUR', incoterm: 'FOB',
    lines: [{ productId: b.finished.id, qty: d(qty), unitPrice: d(unitPrice) }],
  }, ctx);
  expect(order.isExport).toBe(true);
  expect(order.vatTotal).toBe('0.0000'); // ihracat istisnası — KDV %0
  const { delivery } = await confirmOrder(tx, order.id, ctx);
  return { order, delivery };
}

describe('export/shipments — sipariş → sevkiyat → proforma → çeki listesi → gümrük → fatura', () => {
  it('tam zincir (ETGB, limit altı): I36 zincirini eksiksiz kurar', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const channel = await seedExportFixtures(tx, b);
      const { order, delivery } = await buildExportOrder(tx, b, channel.id, '100', '50'); // 100 × 50 = 5.000 EUR, 50kg — ETGB sınırı altında

      const shipment = await createFromOrder(tx, { salesOrderId: order.id, destinationCountry: 'DE', portOfLoading: 'İzmir', portOfDischarge: 'Hamburg', transportMode: 'road' }, ctx);
      expect(shipment.regime).toBe('etgb');
      expect(shipment.status).toBe('draft');
      expect(shipment.currency).toBe('EUR');
      expect(shipment.docNo).toMatch(/^EXP-\d{4}-\d{6}$/);

      const [orderAfter] = await tx.select().from(salesOrders).where(eq(salesOrders.id, order.id));
      expect(orderAfter!.exportShipmentId).toBe(shipment.id);

      const docs1 = await tx.select().from(exportDocuments).where(eq(exportDocuments.shipmentId, shipment.id));
      // ETGB rejiminde gerekli: PROFORMA, INVOICE, PACKING_LIST, HEALTH, ETGB; ATR/EUR1/BL/CMR/AWB/INSURANCE gerekmiyor
      expect(docs1.find((d0) => d0.code === 'ETGB')?.status).toBe('required');
      expect(docs1.find((d0) => d0.code === 'ATR')?.status).toBe('not_required');
      expect(docProgress(docs1).total).toBeGreaterThan(0);

      const proforma = await generateProforma(tx, shipment.id, ctx);
      expect(proforma.status).toBe('proforma_sent');
      expect(proforma.proformaNo).toBeTruthy();
      expect(proforma.proformaAmount).toBe('5000.0000');
      const proformaDoc = (await tx.select().from(exportDocuments).where(eq(exportDocuments.shipmentId, shipment.id))).find((d0) => d0.code === 'PROFORMA');
      expect(proformaDoc?.status).toBe('sent');

      const linked = await linkDelivery(tx, shipment.id, delivery.id, ctx);
      expect(linked.status).toBe('confirmed');
      expect(linked.deliveryId).toBe(delivery.id);

      await reserveFefo(tx, delivery.id, ctx);
      const dLines = await tx.select().from(deliveryLines).where(eq(deliveryLines.deliveryId, delivery.id));
      for (const line of dLines) await confirmPick(tx, { deliveryId: delivery.id, lineId: line.id, scannedLotId: line.lotId }, ctx);
      await shipDelivery(tx, delivery.id, ctx);

      const packed = await buildPackingList(tx, shipment.id, ctx);
      expect(packed.shipment.status).toBe('packing');
      expect(packed.shipment.regime).toBe('etgb'); // 50kg < 300kg sınırı — hâlâ ETGB
      expect(packed.packages).toHaveLength(1);
      expect(packed.packages[0]!.netWeightKg).toBe('50.0000'); // 0.5kg × 100
      expect(packed.shipment.netWeightKg).toBe('50.0000');
      const packDoc = (await tx.select().from(exportDocuments).where(eq(exportDocuments.shipmentId, shipment.id))).find((d0) => d0.code === 'PACKING_LIST');
      expect(packDoc?.status).toBe('ready');

      const customs = await advanceToCustoms(tx, shipment.id, { etgbNo: 'ETGB-TEST-001' }, ctx);
      expect(customs.status).toBe('customs');
      expect(customs.etgbNo).toBe('ETGB-TEST-001');
      const etgbDoc = (await tx.select().from(exportDocuments).where(eq(exportDocuments.shipmentId, shipment.id))).find((d0) => d0.code === 'ETGB');
      expect(etgbDoc?.status).toBe('received');

      const shipped = await markShipped(tx, shipment.id, ctx);
      expect(shipped.status).toBe('shipped');

      const { invoice } = await createInvoiceFromDelivery(tx, delivery.id, ctx);
      expect(invoice.isExport).toBe(true);
      expect(invoice.vatTotal).toBe('0.0000');

      const withInvoice = await linkInvoice(tx, shipment.id, invoice.id, ctx);
      expect(withInvoice.invoiceId).toBe(invoice.id);
      const [invoiceAfter] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id));
      expect(invoiceAfter!.exportShipmentId).toBe(shipment.id);

      const closed = await closeShipment(tx, shipment.id, ctx);
      expect(closed.status).toBe('closed');

      // I36'nın doğruladığı üç koşul: kaynak sipariş bağlı, sevkiyat→fatura yetim değil.
      const [shipmentRow] = await tx.select().from(exportShipments).where(eq(exportShipments.id, shipment.id));
      expect(shipmentRow!.salesOrderId).toBe(order.id);
      expect(shipmentRow!.invoiceId).toBe(invoice.id);
    });
  });

  it('ETGB limiti aşılırsa (>15.000 EUR) oluşturmada otomatik standart rejime düşer', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const channel = await seedExportFixtures(tx, b);
      const { order } = await buildExportOrder(tx, b, channel.id, '500', '50'); // 500 × 50 = 25.000 EUR > 15.000

      const shipment = await createFromOrder(tx, { salesOrderId: order.id, destinationCountry: 'DE' }, ctx);
      expect(shipment.regime).toBe('standard');
      const docs = await tx.select().from(exportDocuments).where(eq(exportDocuments.shipmentId, shipment.id));
      expect(docs.find((d0) => d0.code === 'ETGB')?.status).toBe('not_required');
      expect(docs.find((d0) => d0.code === 'BL')?.status).toBe('required');
    });
  });

  it('çeki listesi ağırlığı 300kg sınırını aşarsa ETGB→standart geçişi buildPackingList aşamasında da tetiklenir', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const channel = await seedExportFixtures(tx, b);
      // 100 adet × 0.5kg birim + 100 × 50€ = 5.000€ (ETGB sınırı altı) ama ağırlık: qty 700 × 0.5kg = 350kg > 300kg
      const { order, delivery } = await buildExportOrder(tx, b, channel.id, '700', '7'); // 700 × 7 = 4.900 EUR (tutar sınır altı), 350kg (ağırlık sınır üstü)

      const shipment = await createFromOrder(tx, { salesOrderId: order.id, destinationCountry: 'DE' }, ctx);
      expect(shipment.regime).toBe('etgb'); // oluşturmada yalnızca tutar biliniyor, sınır altı

      await linkDelivery(tx, shipment.id, delivery.id, ctx);
      await reserveFefo(tx, delivery.id, ctx);
      const dLines = await tx.select().from(deliveryLines).where(eq(deliveryLines.deliveryId, delivery.id));
      for (const line of dLines) await confirmPick(tx, { deliveryId: delivery.id, lineId: line.id, scannedLotId: line.lotId }, ctx);
      await shipDelivery(tx, delivery.id, ctx);

      const packed = await buildPackingList(tx, shipment.id, ctx);
      expect(packed.shipment.netWeightKg).toBe('350.0000');
      expect(packed.shipment.regime).toBe('standard'); // ağırlık öğrenilince ETGB'den düşürüldü
      const docs = await tx.select().from(exportDocuments).where(eq(exportDocuments.shipmentId, shipment.id));
      expect(docs.find((d0) => d0.code === 'ETGB')?.status).toBe('not_required');
      expect(docs.find((d0) => d0.code === 'BL')?.status).toBe('required');
    });
  });

  it('ihracat olmayan siparişten sevkiyat oluşturulamaz; aynı sipariş ikinci kez bağlanamaz', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const channel = await seedExportFixtures(tx, b);
      await stockFinished(tx, b, `PL-DOM-${b.s}`, '10');
      const [domesticChannel] = await tx.insert(salesChannels).values({ code: `DOM-${b.s}`, name: `Yurtiçi ${b.s}`, kind: 'wholesale' }).returning();
      const { order: domesticOrder } = await createSalesDoc(tx, {
        docType: 'order', partnerId: b.customer.id, channelId: domesticChannel!.id, warehouseId: b.wh.id, orderDate: today(), currency: 'TRY',
        lines: [{ productId: b.finished.id, qty: d(5), unitPrice: d(100) }],
      }, ctx);
      await expect(createFromOrder(tx, { salesOrderId: domesticOrder.id }, ctx)).rejects.toThrow(/ihracat siparişi değil/);

      const { order } = await buildExportOrder(tx, b, channel.id, '10', '50');
      await createFromOrder(tx, { salesOrderId: order.id }, ctx);
      await expect(createFromOrder(tx, { salesOrderId: order.id }, ctx)).rejects.toThrow(/zaten bir sevkiyata bağlı/);
    });
  });

  it('iptal edilen sevkiyat siparişteki bağı serbest bırakır', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const channel = await seedExportFixtures(tx, b);
      const { order } = await buildExportOrder(tx, b, channel.id, '10', '50');
      const shipment = await createFromOrder(tx, { salesOrderId: order.id }, ctx);
      const cancelled = await cancelShipment(tx, shipment.id, 'müşteri vazgeçti', ctx);
      expect(cancelled.status).toBe('cancelled');
      const [orderAfter] = await tx.select().from(salesOrders).where(eq(salesOrders.id, order.id));
      expect(orderAfter!.exportShipmentId).toBeNull();
    });
  });

  it('faturaya bağlı bir sevkiyat iptal edilince kendi invoiceId/deliveryId alanları VE invoices.exportShipmentId de temizlenir (I44)', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const channel = await seedExportFixtures(tx, b);
      const { order, delivery } = await buildExportOrder(tx, b, channel.id, '10', '50');
      const shipment = await createFromOrder(tx, { salesOrderId: order.id }, ctx);
      const linked = await linkDelivery(tx, shipment.id, delivery.id, ctx);
      expect(linked.status).toBe('confirmed');

      await reserveFefo(tx, delivery.id, ctx);
      const dLines = await tx.select().from(deliveryLines).where(eq(deliveryLines.deliveryId, delivery.id));
      for (const line of dLines) await confirmPick(tx, { deliveryId: delivery.id, lineId: line.id, scannedLotId: line.lotId }, ctx);
      await shipDelivery(tx, delivery.id, ctx);

      const { invoice } = await createInvoiceFromDelivery(tx, delivery.id, ctx);
      const withInvoice = await linkInvoice(tx, shipment.id, invoice.id, ctx);
      expect(withInvoice.invoiceId).toBe(invoice.id);
      expect(withInvoice.deliveryId).toBe(delivery.id);
      const [invoiceBefore] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id));
      expect(invoiceBefore!.exportShipmentId).toBe(shipment.id);

      const cancelled = await cancelShipment(tx, shipment.id, 'gümrük reddi', ctx);
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.invoiceId).toBeNull();
      expect(cancelled.deliveryId).toBeNull();

      const [invoiceAfter] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id));
      expect(invoiceAfter!.exportShipmentId).toBeNull(); // I44 — iptal edilmiş sevkiyata geri işaret edemez
      const [orderAfter] = await tx.select().from(salesOrders).where(eq(salesOrders.id, order.id));
      expect(orderAfter!.exportShipmentId).toBeNull();
    });
  });

  it('markShipped bağlı irsaliye sevk edilmeden çağrılırsa hata verir', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const channel = await seedExportFixtures(tx, b);
      const { order, delivery } = await buildExportOrder(tx, b, channel.id, '10', '50');
      const shipment = await createFromOrder(tx, { salesOrderId: order.id }, ctx);
      await linkDelivery(tx, shipment.id, delivery.id, ctx);
      await advanceToCustoms(tx, shipment.id, { etgbNo: 'ETGB-X' }, ctx).catch(() => null); // packing'e geçmeden customs denenirse INVALID_SHIPMENT_STATUS
      await expect(markShipped(tx, shipment.id, ctx)).rejects.toThrow();
    });
  });

  it('updateLogistics ve markShipmentDelivered çalışır', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const channel = await seedExportFixtures(tx, b);
      const { order, delivery } = await buildExportOrder(tx, b, channel.id, '10', '50');
      const shipment = await createFromOrder(tx, { salesOrderId: order.id }, ctx);
      const updated = await updateLogistics(tx, shipment.id, { carrier: 'DHL', trackingNo: 'DHL123', etd: today(), eta: today() }, ctx);
      expect(updated.carrier).toBe('DHL');
      expect(updated.trackingNo).toBe('DHL123');

      await linkDelivery(tx, shipment.id, delivery.id, ctx);
      await reserveFefo(tx, delivery.id, ctx);
      const dLines = await tx.select().from(deliveryLines).where(eq(deliveryLines.deliveryId, delivery.id));
      for (const line of dLines) await confirmPick(tx, { deliveryId: delivery.id, lineId: line.id, scannedLotId: line.lotId }, ctx);
      await shipDelivery(tx, delivery.id, ctx);
      await buildPackingList(tx, shipment.id, ctx);
      await advanceToCustoms(tx, shipment.id, { etgbNo: 'ETGB-Y' }, ctx);
      await markShipped(tx, shipment.id, ctx);
      const delivered = await markShipmentDelivered(tx, shipment.id, ctx);
      expect(delivered.status).toBe('delivered');
    });
  });
});
