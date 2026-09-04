import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { journals, salesChannels, salesOrderLines, salesOrders, deliveryLines, type Tx } from '@plantero/db';
import { createSalesDoc, updateLines, sendQuotation, acceptQuotation, convertQuotationToOrder, confirmOrder, cancelOrder, recomputeOrderStatus } from './orders.js';
import { createInvoiceFromDelivery } from './invoicing.js';
import { createLot, postStockMove } from '../stock/ledger.js';
import { reserveFefo, confirmPick, shipDelivery } from '../stock/deliveries.js';
import { getChain } from '../documents/chain.js';
import { getPartnerBalance } from '../accounting/journal.js';
import { withRollback, seedBase, ctx, d, today, type Base } from '../__tests__/helpers.js';

/** SAT yevmiyesi seedBase'de yok (satış modülüne özel) — testte elle eklenir. */
async function ensureSalesJournal(tx: Tx) {
  await tx.insert(journals).values({ code: 'SAT', name: 'Satış Yevmiyesi', kind: 'sales', defaultAccountCode: '600' }).onConflictDoNothing({ target: journals.code });
}

async function seedChannel(tx: Tx, b: Base, overrides: Partial<typeof salesChannels.$inferInsert> = {}) {
  const [channel] = await tx.insert(salesChannels).values({ code: `CH-${b.s}`, name: `Kanal ${b.s}`, kind: 'wholesale', ...overrides }).returning();
  return channel!;
}

async function stockFinished(tx: Tx, b: Base, lotNo: string, qty: string) {
  const lot = await createLot(tx, { productId: b.finished.id, lotNo, origin: 'production', unitCost: d(40), status: 'released' }, ctx);
  await postStockMove(tx, { kind: 'production', productId: b.finished.id, lotId: lot.id, fromLocationId: b.loc.prod.id, toLocationId: b.loc.mamul.id, qty: d(qty), uomId: b.kg.id, unitCost: d(40), refType: 'work_order', refId: '00000000-0000-4000-8000-000000000099' }, ctx);
  return lot;
}

describe('sales/orders — sipariş → onay → sevk → fatura', () => {
  it('tam zincir: fiyat/kesinti hesapları, teslim/fatura miktar zinciri, cari bakiye', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureSalesJournal(tx);
      const channel = await seedChannel(tx, b, { commissionPct: '21', shippingDeductionPerOrder: '45' });
      await stockFinished(tx, b, 'PL-ORD-1', '30');

      const { order } = await createSalesDoc(tx, {
        docType: 'order', partnerId: b.customer.id, channelId: channel.id, warehouseId: b.wh.id, orderDate: today(), currency: 'TRY',
        lines: [{ productId: b.finished.id, qty: d(20), unitPrice: d(100) }],
      }, ctx);

      // 20 × 100 = 2000; KDV %1 = 20; genel toplam 2020; komisyon %21 = 420, kargo 45 → net ciro 2000-420-45=1535
      expect(order.subtotal).toBe('2000.0000');
      expect(order.vatTotal).toBe('20.0000');
      expect(order.grandTotal).toBe('2020.0000');
      expect(order.commissionAmount).toBe('420.0000');
      expect(order.shippingDeduction).toBe('45.0000');
      expect(order.netRevenue).toBe('1535.0000');
      expect(order.status).toBe('draft');

      const { order: confirmed, delivery, warnings } = await confirmOrder(tx, order.id, ctx);
      expect(confirmed.status).toBe('confirmed');
      expect(warnings).toHaveLength(0); // 30 elde, 20 gerekli
      expect(delivery.status).toBe('draft');

      await reserveFefo(tx, delivery.id, ctx);
      const [line] = await tx.select().from(deliveryLines).where(eq(deliveryLines.deliveryId, delivery.id));
      await confirmPick(tx, { deliveryId: delivery.id, lineId: line!.id, scannedLotId: line!.lotId }, ctx);
      await shipDelivery(tx, delivery.id, ctx);

      const [soLineAfterShip] = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, order.id));
      expect(soLineAfterShip!.deliveredQty).toBe('20.0000');

      const { invoice } = await createInvoiceFromDelivery(tx, delivery.id, ctx);
      expect(invoice.status).toBe('posted');
      expect(invoice.grandTotal).toBe('2020.0000');
      expect(invoice.grandTotalTry).toBe('2020.0000'); // TRY kur 1

      const [soLineAfterInvoice] = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, order.id));
      expect(soLineAfterInvoice!.invoicedQty).toBe('20.0000');
      const [orderAfterInvoice] = await tx.select().from(salesOrders).where(eq(salesOrders.id, order.id));
      expect(orderAfterInvoice!.status).toBe('invoiced');

      const balance = await getPartnerBalance(tx, b.customer.id);
      expect(balance.receivable.toFixed(4)).toBe('2020.0000');

      const chain = await getChain(tx, 'sales_order', order.id);
      expect(chain.downstream.some((n) => n.type === 'delivery' && n.id === delivery.id)).toBe(true);
      expect(chain.downstream.some((n) => n.type === 'invoice' && n.id === invoice.id)).toBe(true);
    });
  });

  it('yetersiz stokta onay uyarı üretir ama işlemi engellemez', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureSalesJournal(tx);
      const channel = await seedChannel(tx, b);
      await stockFinished(tx, b, 'PL-LOW', '5');

      const { order } = await createSalesDoc(tx, {
        docType: 'order', partnerId: b.customer.id, channelId: channel.id, warehouseId: b.wh.id, orderDate: today(), currency: 'TRY',
        lines: [{ productId: b.finished.id, qty: d(20), unitPrice: d(100) }],
      }, ctx);

      const { warnings } = await confirmOrder(tx, order.id, ctx);
      expect(warnings.length).toBe(1);
      expect(warnings[0]).toMatch(/yetersiz stok/);
    });
  });

  it('teklif → kabul → siparişe dönüştür → document_links', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureSalesJournal(tx);
      const channel = await seedChannel(tx, b);

      const { order: quotation } = await createSalesDoc(tx, {
        docType: 'quotation', partnerId: b.customer.id, channelId: channel.id, warehouseId: b.wh.id, orderDate: today(), currency: 'TRY',
        lines: [{ productId: b.finished.id, qty: d(10), unitPrice: d(50) }],
      }, ctx);
      expect(quotation.docNo).toMatch(/^QT-/);
      expect(quotation.commissionAmount).toBe('0.0000'); // teklifte kanal kesintisi hesaplanmaz

      await sendQuotation(tx, quotation.id, ctx);
      await acceptQuotation(tx, quotation.id, ctx);
      const { order } = await convertQuotationToOrder(tx, quotation.id, ctx);
      expect(order.docNo).toMatch(/^SO-/);
      expect(order.quotationId).toBe(quotation.id);
      expect(order.grandTotal).toBe(quotation.grandTotal);

      const chain = await getChain(tx, 'quotation', quotation.id);
      expect(chain.downstream.some((n) => n.type === 'sales_order' && n.id === order.id)).toBe(true);
    });
  });

  it('updateLines yalnızca taslakta çalışır; onaylı siparişte iptal engellenir', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureSalesJournal(tx);
      const channel = await seedChannel(tx, b);
      await stockFinished(tx, b, 'PL-UPD', '50');

      const { order } = await createSalesDoc(tx, {
        docType: 'order', partnerId: b.customer.id, channelId: channel.id, warehouseId: b.wh.id, orderDate: today(), currency: 'TRY',
        lines: [{ productId: b.finished.id, qty: d(5), unitPrice: d(100) }],
      }, ctx);

      const { order: updated } = await updateLines(tx, order.id, [{ productId: b.finished.id, qty: d(8), unitPrice: d(100) }], ctx);
      expect(updated.subtotal).toBe('800.0000');

      const { order: confirmed } = await confirmOrder(tx, order.id, ctx);
      await expect(updateLines(tx, confirmed.id, [{ productId: b.finished.id, qty: d(1), unitPrice: d(100) }], ctx)).rejects.toMatchObject({ code: 'ORDER_NOT_EDITABLE' });

      const cancelled = await cancelOrder(tx, order.id, ctx, 'test');
      expect(cancelled.status).toBe('cancelled');
      await expect(cancelOrder(tx, order.id, ctx)).rejects.toMatchObject({ code: 'ALREADY_CLOSED' });
    });
  });

  it('recomputeOrderStatus draft/cancelled siparişe dokunmaz', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const channel = await seedChannel(tx, b);
      const { order } = await createSalesDoc(tx, {
        docType: 'order', partnerId: b.customer.id, channelId: channel.id, warehouseId: b.wh.id, orderDate: today(), currency: 'TRY',
        lines: [{ productId: b.finished.id, qty: d(1), unitPrice: d(10) }],
      }, ctx);
      const untouched = await recomputeOrderStatus(tx, order.id);
      expect(untouched.status).toBe('draft');
    });
  });

  // Kök neden: istemcide fiyat çözümü (resolvePrice) asenkron tamamlanır; rozet gelmeden "Kaydet"e
  // basılırsa satır hâlâ ilk (tahmini) 0 ₺ değerini taşıyabiliyordu. Bu durumda kaydedilen sipariş
  // grand_total=0 oluyor ve faturalandırmada postJournalEntry "Fiş tutarı sıfır olamaz" ile
  // reddediyordu. buildLine artık elle (manuel) girilen 0 (veya altı) birim fiyatı `isFree`
  // bayrağı olmadan reddeder — istemci + sunucu aynı kuralı iki kez uygular (savunma derinliği).
  it('elle 0 birim fiyat isFree olmadan reddedilir; isFree ile kabul edilir ve priceSource=free olur', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureSalesJournal(tx);
      const channel = await seedChannel(tx, b);

      await expect(
        createSalesDoc(tx, {
          docType: 'order', partnerId: b.customer.id, channelId: channel.id, warehouseId: b.wh.id, orderDate: today(), currency: 'TRY',
          lines: [{ productId: b.finished.id, qty: d(5), unitPrice: d(0) }],
        }, ctx),
      ).rejects.toMatchObject({ code: 'VALIDATION' });

      const { order, lines } = await createSalesDoc(tx, {
        docType: 'order', partnerId: b.customer.id, channelId: channel.id, warehouseId: b.wh.id, orderDate: today(), currency: 'TRY',
        lines: [{ productId: b.finished.id, qty: d(5), unitPrice: d(0), isFree: true }],
      }, ctx);
      expect(lines[0]!.priceSource).toBe('free');
      expect(lines[0]!.unitPrice).toBe('0.0000');
      expect(order.grandTotal).toBe('0.0000');

      // updateLines aynı kuralı uygular (taslak sipariş satırları elle 0 fiyatla değiştirilemez)
      await expect(updateLines(tx, order.id, [{ productId: b.finished.id, qty: d(5), unitPrice: d(0) }], ctx)).rejects.toMatchObject({ code: 'VALIDATION' });
    });
  });
});
