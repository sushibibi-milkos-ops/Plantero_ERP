import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { invoices, receiptLines, purchaseOrders } from '@plantero/db';
import {
  createPurchaseOrder, approvePurchaseOrder, rejectPurchaseOrder, markPurchaseOrderSent, cancelPurchaseOrder,
  recomputePurchaseOrderStatus, getOpenPoQtyByProduct, createRetroactivePurchaseOrderForReceipt,
} from './orders.js';
import { createAndReceive } from '../stock/receipts.js';
import { withRollback, seedBase, ctx, d } from '../__tests__/helpers.js';
import { D } from '../money.js';

describe('purchasing/orders', () => {
  it('oluştur → onayla → gönder yaşam döngüsü, toplamlar KDV dahil doğru hesaplanır', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const { order, lines } = await createPurchaseOrder(tx, {
        partnerId: b.supplier.id, warehouseId: b.wh.id,
        lines: [{ productId: b.raw.id, qty: d(100), uomId: b.kg.id, unitPrice: d(200), vatRate: d(20) }],
      }, ctx);
      expect(order.status).toBe('draft');
      expect(D(order.subtotal).toFixed(4)).toBe('20000.0000');
      expect(D(order.vatTotal).toFixed(4)).toBe('4000.0000');
      expect(D(order.grandTotal).toFixed(4)).toBe('24000.0000');
      expect(lines).toHaveLength(1);

      const approved = await approvePurchaseOrder(tx, order.id, ctx);
      expect(approved.status).toBe('approved');
      expect(approved.approvedAt).not.toBeNull();

      const sent = await markPurchaseOrderSent(tx, order.id, { sentVia: 'email', sentTo: 'tedarikci@example.com' }, ctx);
      expect(sent.status).toBe('sent');
      expect(sent.sentTo).toBe('tedarikci@example.com');

      // Onaysız/gönderilmemiş sipariş iptal edilebilir; gönderilmiş sipariş taslak onayı tekrar alamaz
      await expect(approvePurchaseOrder(tx, order.id, ctx)).rejects.toMatchObject({ code: 'INVALID_PO_STATUS' });
    });
  });

  it('ai_draft → reddedildi akışı ve iptal', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const { order } = await createPurchaseOrder(tx, {
        partnerId: b.supplier.id, warehouseId: b.wh.id, isAiGenerated: true, aiRationale: 'test',
        lines: [{ productId: b.pack.id, qty: d(500), uomId: b.kg.id, unitPrice: d(10) }],
      }, ctx);
      expect(order.status).toBe('ai_draft');
      // I7 (docs/INVARIANTS.md): kaynak referanssız belge yalnızca origin='manual' olabilir — AI taslağı
      // olması (isAiGenerated) belgeye bağlanacak bir üst belge kazandırmaz, origin varsayılan 'manual' kalır.
      expect(order.origin).toBe('manual');

      const rejected = await rejectPurchaseOrder(tx, order.id, 'fiyat yüksek', ctx);
      expect(rejected.status).toBe('rejected');
      await expect(cancelPurchaseOrder(tx, order.id, null, ctx)).rejects.toMatchObject({ code: 'INVALID_PO_STATUS' });

      const { order: order2 } = await createPurchaseOrder(tx, {
        partnerId: b.supplier.id, warehouseId: b.wh.id,
        lines: [{ productId: b.pack.id, qty: d(10), uomId: b.kg.id, unitPrice: d(10) }],
      }, ctx);
      const cancelled = await cancelPurchaseOrder(tx, order2.id, 'ihtiyaç kalmadı', ctx);
      expect(cancelled.status).toBe('cancelled');
    });
  });

  it('mal kabul sonrası PO durumu received/invoiced\'a geçer ve açık PO miktarı düşer', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const { order, lines } = await createPurchaseOrder(tx, {
        partnerId: b.supplier.id, warehouseId: b.wh.id,
        lines: [{ productId: b.raw.id, qty: d(100), uomId: b.kg.id, unitPrice: d(200), vatRate: d(20) }],
      }, ctx);
      await approvePurchaseOrder(tx, order.id, ctx);
      await markPurchaseOrderSent(tx, order.id, { sentVia: 'email' }, ctx);

      const openBefore = await getOpenPoQtyByProduct(tx, b.raw.id, b.wh.id);
      expect(openBefore.toFixed(4)).toBe('100.0000');

      const { receipt } = await createAndReceive(tx, {
        warehouseId: b.wh.id, partnerId: b.supplier.id, purchaseOrderId: order.id,
        lines: [{ purchaseOrderLineId: lines[0]!.id, productId: b.raw.id, qty: d(100), uomId: b.kg.id, unitCost: d(200), disposition: 'released' }],
      }, ctx);

      const openAfter = await getOpenPoQtyByProduct(tx, b.raw.id, b.wh.id);
      expect(openAfter.toFixed(4)).toBe('0.0000');

      // Otomatik faturalama: partnerId + değerli hareket → createPurchaseInvoiceFromReceipt tetiklenir (I23/I25)
      const [invoice] = await tx.select().from(invoices).where(eq(invoices.receiptId, receipt.id));
      expect(invoice).toBeDefined();
      expect(invoice!.kind).toBe('purchase');
      expect(invoice!.purchaseOrderId).toBe(order.id);

      const recomputed = await recomputePurchaseOrderStatus(tx, order.id);
      expect(recomputed.status).toBe('invoiced');
    });
  });

  it('PO\'suz mal kabulde receiveGoods() canlı akışta otomatik geriye dönük PO kurar ve faturaya bağlar (I24 — tur 7 P0 düzeltmesi)', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      // receiveGoods() artık (docs/INVARIANTS.md I24 — canlı akış güvenlik ağı) purchaseOrderId
      // verilmeden gelen, tedarikçisi olan her kabulü aynı transaction içinde otomatik bağlar —
      // createRetroactivePurchaseOrderForReceipt'i elle çağırmaya gerek kalmadan.
      const { receipt } = await createAndReceive(tx, {
        warehouseId: b.wh.id, partnerId: b.supplier.id, origin: 'manual',
        lines: [{ productId: b.raw.id, qty: d(40), uomId: b.kg.id, unitCost: d(300), disposition: 'released' }],
      }, ctx);
      expect(receipt.purchaseOrderId).not.toBeNull();

      const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, receipt.purchaseOrderId!));
      expect(po!.status).toBe('invoiced');

      const [receiptRow] = await tx.select().from(receiptLines).where(eq(receiptLines.receiptId, receipt.id));
      expect(receiptRow!.purchaseOrderLineId).not.toBeNull();

      const [invoiceAfter] = await tx.select().from(invoices).where(eq(invoices.receiptId, receipt.id));
      expect(invoiceAfter!.purchaseOrderId).toBe(po!.id);

      // İdempotent: yardımcı elle tekrar çağrılırsa aynı PO'yu döner, ikinci bir PO oluşturmaz
      const again = await createRetroactivePurchaseOrderForReceipt(tx, receipt.id, ctx);
      expect(again.id).toBe(po!.id);
    });
  });
});
