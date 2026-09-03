import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { journals, purchaseOrders, purchaseOrderLines, invoices, type Tx } from '@plantero/db';
import { createAndReceive } from '../stock/receipts.js';
import { getPartnerBalance } from '../accounting/journal.js';
import { createPurchaseInvoiceFromReceipt } from './invoicing.js';
import { withRollback, seedBase, ctx, d, expectReject, balanceProbe, type Base } from '../__tests__/helpers.js';
import { D } from '../money.js';

/** ALS yevmiyesi seedBase'de yok (satın alma modülüne özel) — testte elle eklenir (bkz. sales/orders.test.ts). */
async function ensurePurchaseJournal(tx: Tx) {
  await tx.insert(journals).values({ code: 'ALS', name: 'Alış Yevmiyesi', kind: 'purchase', defaultAccountCode: '320' }).onConflictDoNothing({ target: journals.code });
}

async function receiveOne(tx: Tx, b: Base, opts: { qty?: string; unitCost?: string; rejectedQty?: string; purchaseOrderId?: string; purchaseOrderLineId?: string } = {}) {
  return createAndReceive(tx, {
    warehouseId: b.wh.id, partnerId: b.supplier.id, purchaseOrderId: opts.purchaseOrderId ?? null,
    lines: [{
      purchaseOrderLineId: opts.purchaseOrderLineId ?? null, productId: b.raw.id, qty: d(opts.qty ?? 100), uomId: b.kg.id,
      unitCost: d(opts.unitCost ?? 12.5), rejectedQty: opts.rejectedQty ? d(opts.rejectedQty) : undefined, disposition: 'released',
    }],
  }, ctx);
}

/** `receiveGoods` artık (P0 düzeltme — I23/I25) partnerli, değerli her kabulü aynı transaction içinde
 * otomatik faturalar (bkz. `stock/receipts.ts`) — bu yüzden aşağıdaki testler `createPurchaseInvoiceFromReceipt`'i
 * ikinci kez elle çağırmak yerine, `receiveOne`'ın zaten ürettiği faturayı `receiptId` üzerinden sorgular. */
async function getAutoInvoice(tx: Tx, receiptId: string) {
  const [invoice] = await tx.select().from(invoices).where(eq(invoices.receiptId, receiptId));
  if (!invoice) throw new Error('Otomatik fatura beklenirken bulunamadı');
  return invoice;
}

describe('purchasing/invoicing', () => {
  it('mal kabul otomatik faturalanır: 320.999 kapanır, 191 doğar, tedarikçi cari bakiyesi (320) artar', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensurePurchaseJournal(tx);
      const probe = await balanceProbe(tx);

      const { receipt } = await receiveOne(tx, b, { qty: '100', unitCost: '12.5' });
      // receiveGoods aynı transaction içinde otomatik faturaladığı için 320.999 kabulden hemen sonra zaten kapalıdır.
      const invoice = await getAutoInvoice(tx, receipt.id);

      expect(invoice.kind).toBe('purchase');
      expect(invoice.status).toBe('posted');
      expect(invoice.receiptId).toBe(receipt.id);
      expect(invoice.subtotal).toBe('1250.0000');
      expect(invoice.vatTotal).toBe('250.0000'); // %20 varsayılan alış KDV
      expect(invoice.grandTotal).toBe('1500.0000');

      // 320.999 faturayla tam kapanmalı (mal kabul kredisi + fatura borcu = 0)
      expect((await probe.bal('320.999', 'VUK')).toFixed(4)).toBe('0.0000');
      // 191 (İndirilecek KDV) fatura KDV'si kadar borçlanmalı
      expect((await probe.bal('191', 'VUK')).toFixed(4)).toBe('250.0000');
      // 320 (Satıcılar) gerçek tedarikçi alt hesabı brüt tutar kadar alacaklanmalı
      expect((await probe.bal('320', 'VUK')).toFixed(4)).toBe('-1500.0000');

      const { payable } = await getPartnerBalance(tx, b.supplier.id);
      expect(payable.toFixed(4)).toBe('1500.0000');

      // UFRS defterine de aynı fiş düşmüş olmalı (çift defter kuralı) — bu testte açılan 320.999 hareketi net sıfırlanır
      expect((await probe.bal('320.999', 'UFRS')).toFixed(4)).toBe('0.0000');
    });
  });

  it('kısmi red içeren mal kabul: red edilen miktar da faturaya dahil olur (tedarikçiye borç aynı kalır)', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensurePurchaseJournal(tx);
      const probe = await balanceProbe(tx);

      const { receipt } = await receiveOne(tx, b, { qty: '100', unitCost: '10', rejectedQty: '15' });
      const invoice = await getAutoInvoice(tx, receipt.id);

      // 100 × 10 = 1000 (kabul + red toplamı) — kısmi red faturalanacak tutarı değiştirmez
      expect(invoice.subtotal).toBe('1000.0000');
      expect((await probe.bal('320.999', 'VUK')).toFixed(4)).toBe('0.0000');
    });
  });

  it('PO bağlı mal kabul: purchase_order_lines.invoicedQty artar ve PO tamamen faturalanınca invoiced durumuna geçer', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensurePurchaseJournal(tx);

      const [po] = await tx.insert(purchaseOrders).values({ docNo: `PO-TEST-${b.s}`, partnerId: b.supplier.id, warehouseId: b.wh.id, orderDate: new Date().toISOString().slice(0, 10) }).returning();
      const [poLine] = await tx.insert(purchaseOrderLines).values({ orderId: po!.id, productId: b.raw.id, qty: d(60).toFixed(4), uomId: b.kg.id, unitPrice: d(12).toFixed(4) }).returning();

      const { receipt } = await receiveOne(tx, b, { qty: '60', unitCost: '12', purchaseOrderId: po!.id, purchaseOrderLineId: poLine!.id });
      await getAutoInvoice(tx, receipt.id);

      const [updatedLine] = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.id, poLine!.id));
      expect(D(updatedLine!.invoicedQty).toFixed(4)).toBe('60.0000');

      const [updatedPo] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, po!.id));
      expect(updatedPo!.status).toBe('invoiced');
    });
  });

  it('bir mal kabul yalnızca bir kez faturalanabilir (otomatik faturadan sonra elle tekrar çağrı reddedilir)', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensurePurchaseJournal(tx);
      const { receipt } = await receiveOne(tx, b);
      await getAutoInvoice(tx, receipt.id); // receiveGoods içinde zaten oluştu

      const err = await expectReject(tx, (sp) => createPurchaseInvoiceFromReceipt(sp, receipt.id, ctx));
      expect((err as Error & { code?: string }).code).toBe('RECEIPT_ALREADY_INVOICED');
    });
  });

  it('henüz kabul edilmemiş (draft) mal kabul faturalanamaz', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensurePurchaseJournal(tx);
      const { createReceipt } = await import('../stock/receipts.js');
      const { receipt } = await createReceipt(tx, {
        warehouseId: b.wh.id, partnerId: b.supplier.id,
        lines: [{ productId: b.raw.id, qty: d(10), uomId: b.kg.id, unitCost: d(5) }],
      }, ctx);

      const err = await expectReject(tx, (sp) => createPurchaseInvoiceFromReceipt(sp, receipt.id, ctx));
      expect((err as Error & { code?: string }).code).toBe('RECEIPT_NOT_RECEIVED');
    });
  });

  it('doc no PINV önekiyle üretilir ve document_index/invoices tablosuna yazılır', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensurePurchaseJournal(tx);
      const { receipt } = await receiveOne(tx, b);
      const invoice = await getAutoInvoice(tx, receipt.id);
      expect(invoice.docNo.startsWith('PINV-')).toBe(true);

      const [row] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id));
      expect(row!.kind).toBe('purchase');
    });
  });
});
