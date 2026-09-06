import { describe, it, expect } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { journals, salesChannels, invoices, invoiceLines, deliveryLines, stockMoves, type Tx } from '@plantero/db';
import { createExpensePurchaseInvoice, createCreditNote, cancelInvoice, getAging } from './invoices.js';
import { postJournalEntry, getPartnerBalance } from './journal.js';
import { createAndReceive } from '../stock/receipts.js';
import { createLot, postStockMove, getOnHand } from '../stock/ledger.js';
import { reserveFefo, confirmPick, shipDelivery } from '../stock/deliveries.js';
import { createSalesDoc, confirmOrder } from '../sales/orders.js';
import { createInvoiceFromDelivery } from '../sales/invoicing.js';
import { nextDocNo } from '../sequences.js';
import { D, toDb, round4 } from '../money.js';
import { withRollback, seedBase, ctx, d, today, expectReject, balanceProbe, type Base } from '../__tests__/helpers.js';

async function ensureJournals(tx: Tx) {
  for (const j of [
    { code: 'ALS', name: 'Alış Yevmiyesi', kind: 'purchase' as const },
    { code: 'SAT', name: 'Satış Yevmiyesi', kind: 'sales' as const },
  ]) {
    await tx.insert(journals).values(j).onConflictDoNothing({ target: journals.code });
  }
}

/** Mal kabulden (`receipt_lines`) otomatik faturaya kadar gerçek bir alış zinciri (`createAndReceive`
 * artık aynı transaction içinde otomatik faturalar — I23/I25 düzeltmesi, bkz. purchasing/invoicing.test.ts). */
async function receiveOne(tx: Tx, b: Base, opts: { qty?: string; unitCost?: string } = {}) {
  return createAndReceive(tx, {
    warehouseId: b.wh.id, partnerId: b.supplier.id, purchaseOrderId: null,
    lines: [{ productId: b.raw.id, qty: d(opts.qty ?? 100), uomId: b.kg.id, unitCost: d(opts.unitCost ?? 12.5), disposition: 'released' }],
  }, ctx);
}
async function getAutoInvoice(tx: Tx, receiptId: string) {
  const [invoice] = await tx.select().from(invoices).where(eq(invoices.receiptId, receiptId));
  if (!invoice) throw new Error('Otomatik fatura beklenirken bulunamadı');
  return invoice;
}

/** Gerçek bir satış faturası (satır + 120/600/391 fişi) — createCreditNote/cancelInvoice testleri için */
async function makeRealSalesInvoice(tx: Tx, b: Base, opts: { subtotal?: string; vat?: string } = {}) {
  const subtotal = D(opts.subtotal ?? '1000');
  const vat = D(opts.vat ?? '10');
  const grand = subtotal.plus(vat);
  const docNo = await nextDocNo(tx, 'INV', new Date());
  const [inv] = await tx
    .insert(invoices)
    .values({
      docNo, kind: 'sales', status: 'posted', partnerId: b.customer.id, invoiceDate: '2026-09-01', dueDate: '2026-09-15',
      subtotal: toDb(subtotal), vatTotal: toDb(vat), grandTotal: toDb(grand), grandTotalTry: toDb(grand), residual: toDb(grand),
    })
    .returning();
  await tx.insert(invoiceLines).values({
    invoiceId: inv!.id, description: 'Test satırı', qty: '1.000', unitPrice: toDb(subtotal), vatRate: '1',
    lineSubtotal: toDb(subtotal), lineVat: toDb(vat), lineTotal: toDb(grand), accountCode: '600',
  });
  const { vukId } = await postJournalEntry(tx, {
    ledger: 'both', journalCode: 'SAT', entryDate: new Date('2026-09-01'), description: `Test fatura ${docNo}`,
    refType: 'invoice', refId: inv!.id, refNo: docNo, partnerId: b.customer.id,
    lines: [
      { accountCode: '120', debit: grand, partnerId: b.customer.id },
      { accountCode: '600', credit: subtotal },
      { accountCode: '391', credit: vat },
    ],
  }, ctx);
  const [posted] = await tx.update(invoices).set({ journalEntryId: vukId }).where(eq(invoices.id, inv!.id)).returning();
  return posted!;
}

describe('accounting/invoices — gider faturası, iade, iptal, yaşlandırma', () => {
  it('createExpensePurchaseInvoice: 7XX + 191 borç, 320.cari alacak; origin manuel', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureJournals(tx);
      const probe = await balanceProbe(tx);

      const { invoice, lines } = await createExpensePurchaseInvoice(tx, {
        partnerId: b.supplier.id,
        lines: [
          { description: 'Eylül kirası', accountCode: '770', amount: d('5000'), vatRate: d('20') },
          { description: 'Elektrik', accountCode: '770', amount: d('1200'), vatRate: d('20') },
        ],
      }, ctx);

      expect(invoice.kind).toBe('purchase');
      expect(invoice.status).toBe('posted');
      expect(invoice.origin).toBe('manual');
      expect(invoice.subtotal).toBe('6200.0000');
      expect(invoice.vatTotal).toBe('1240.0000');
      expect(invoice.grandTotal).toBe('7440.0000');
      expect(lines).toHaveLength(2);
      expect(lines.every((l) => l.accountCode === '770')).toBe(true);

      expect((await probe.bal('770', 'VUK')).toFixed(4)).toBe('6200.0000');
      expect((await probe.bal('191', 'VUK')).toFixed(4)).toBe('1240.0000');
      expect((await probe.bal('320', 'VUK')).toFixed(4)).toBe('-7440.0000');
      // UFRS defterine de düşmüş olmalı (ledger:'both')
      expect((await probe.bal('770', 'UFRS')).toFixed(4)).toBe('6200.0000');
    });
  });

  it('createExpensePurchaseInvoice: müşteri (customer) cariye gider faturası girilemez', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureJournals(tx);
      const err = await expectReject(tx, (sp) =>
        createExpensePurchaseInvoice(sp, { partnerId: b.customer.id, lines: [{ description: 'x', accountCode: '770', amount: d('100') }] }, ctx),
      );
      expect(String((err as Error).message)).toMatch(/tedarikçi değil/);
    });
  });

  it('createCreditNote (satış): 610+391 borç / 120.cari alacak, kaynağa document_links ile bağlı, ikinci kez kesilemez', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureJournals(tx);
      const source = await makeRealSalesInvoice(tx, b, { subtotal: '1000', vat: '10' });
      const probe = await balanceProbe(tx);

      const { invoice: note } = await createCreditNote(tx, { invoiceId: source.id, reason: 'Hatalı sevkiyat' }, ctx);
      expect(note.kind).toBe('sales_return');
      expect(note.status).toBe('posted');
      expect(note.grandTotal).toBe(source.grandTotal);

      expect((await probe.bal('610', 'VUK')).toFixed(4)).toBe('1000.0000');
      expect((await probe.bal('391', 'VUK')).toFixed(4)).toBe('10.0000');
      expect((await probe.bal('120', 'VUK')).toFixed(4)).toBe('-1010.0000');

      const err = await expectReject(tx, (sp) => createCreditNote(sp, { invoiceId: source.id, reason: 'tekrar' }, ctx));
      expect(String((err as Error).message)).toMatch(/zaten/);
    });
  });

  it('P0 regresyon (Tur 7, I25): createCreditNote (alış, mal-kabul/320.999 tabanlı) gerçek bir return_out fiziksel iadesi üretir; 320.999 net SIFIRDA kalır, GRNI yeniden açılmaz', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureJournals(tx);
      const probe = await balanceProbe(tx);

      const { receipt } = await receiveOne(tx, b, { qty: '100', unitCost: '12.5' });
      const invoice = await getAutoInvoice(tx, receipt.id);
      // Sağlama: mal kabul otomatik faturalandığı için 320.999 zaten kapalı.
      expect((await probe.bal('320.999', 'VUK')).toFixed(4)).toBe('0.0000');
      expect((await getOnHand(tx, { productId: b.raw.id, warehouseId: b.wh.id })).qty.toFixed(4)).toBe('100.0000');

      const { invoice: note } = await createCreditNote(tx, { invoiceId: invoice.id, reason: 'Kalite sorunu — tedarikçiye iade' }, ctx);
      expect(note.kind).toBe('purchase_return');
      expect(note.status).toBe('posted');

      // KRİTİK KANIT: eski davranış burada 320.999'u 1250 TL alacaklandırıp kalıcı bir GRNI bakiyesi
      // açıyordu (I25 ihlali) — artık gerçek bir return_out hareketi onu tam netliyor, net sıfır.
      expect((await probe.bal('320.999', 'VUK')).toFixed(4)).toBe('0.0000');
      expect((await probe.bal('320.999', 'UFRS')).toFixed(4)).toBe('0.0000');

      // Fiziksel iade GERÇEKTEN oldu: stok sıfırlandı, bir return_out hareketi üretildi (CLAUDE.md kural 3).
      expect((await getOnHand(tx, { productId: b.raw.id, warehouseId: b.wh.id })).qty.toFixed(4)).toBe('0.0000');
      const returnMoves = await tx.select().from(stockMoves).where(and(eq(stockMoves.productId, b.raw.id), eq(stockMoves.kind, 'return_out')));
      expect(returnMoves).toHaveLength(1);
      expect(D(returnMoves[0]!.qty).toFixed(4)).toBe('100.0000');
      expect(D(returnMoves[0]!.value).toFixed(4)).toBe('1250.0000');

      // Tedarikçi cari bakiyesi (fatura + iade birbirini tam götürür) ve 191 net sıfıra döner.
      const { payable } = await getPartnerBalance(tx, b.supplier.id);
      expect(payable.toFixed(4)).toBe('0.0000');
      expect((await probe.bal('191', 'VUK')).toFixed(4)).toBe('0.0000');
    });
  });

  it('P2 regresyon (Tur 11, I50): createCreditNote (satış, gerçekten sevk edilmiş) gerçek bir return_in fiziksel iadesi üretir; stok geri döner, COGS (621) net sıfırlanır', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureJournals(tx);
      const probe = await balanceProbe(tx);

      // Sipariş → sevkiyat → fatura ile GERÇEK bir mamul satışı (deliveryLineId dolu satır).
      const lot = await createLot(tx, { productId: b.finished.id, lotNo: 'PL-CN-1', origin: 'production', unitCost: d(40), status: 'released' }, ctx);
      await postStockMove(tx, {
        kind: 'production', productId: b.finished.id, lotId: lot.id, fromLocationId: b.loc.prod.id, toLocationId: b.loc.mamul.id,
        qty: d(30), uomId: b.kg.id, unitCost: d(40), refType: 'work_order', refId: '00000000-0000-4000-8000-000000000098',
      }, ctx);

      const [channel] = await tx.insert(salesChannels).values({ code: `CH-CN-${b.s}`, name: `Kanal ${b.s}`, kind: 'wholesale' }).returning();
      const { order } = await createSalesDoc(tx, {
        docType: 'order', partnerId: b.customer.id, channelId: channel!.id, warehouseId: b.wh.id, orderDate: today(), currency: 'TRY',
        lines: [{ productId: b.finished.id, qty: d(20), unitPrice: d(100) }],
      }, ctx);
      const { delivery } = await confirmOrder(tx, order.id, ctx);
      await reserveFefo(tx, delivery.id, ctx);
      const [dLine] = await tx.select().from(deliveryLines).where(eq(deliveryLines.deliveryId, delivery.id));
      await confirmPick(tx, { deliveryId: delivery.id, lineId: dLine!.id, scannedLotId: dLine!.lotId }, ctx);
      await shipDelivery(tx, delivery.id, ctx);
      const { invoice: source } = await createInvoiceFromDelivery(tx, delivery.id, ctx);
      expect(source.status).toBe('posted');
      expect((await getOnHand(tx, { productId: b.finished.id, warehouseId: b.wh.id })).qty.toFixed(4)).toBe('10.0000');
      expect((await probe.bal('621', 'VUK')).toFixed(4)).toBe('800.0000'); // 20 × 40 COGS

      const { invoice: note } = await createCreditNote(tx, { invoiceId: source.id, reason: 'Müşteri iadesi' }, ctx);
      expect(note.kind).toBe('sales_return');
      expect(note.status).toBe('posted');

      // KRİTİK KANIT: mal fiziksel olarak GERİ GELDİ — return_in hareketi üretildi, stok eski haline döndü.
      expect((await getOnHand(tx, { productId: b.finished.id, warehouseId: b.wh.id })).qty.toFixed(4)).toBe('30.0000');
      const returnMoves = await tx.select().from(stockMoves).where(and(eq(stockMoves.productId, b.finished.id), eq(stockMoves.kind, 'return_in')));
      expect(returnMoves).toHaveLength(1);
      expect(D(returnMoves[0]!.qty).toFixed(4)).toBe('20.0000');
      expect(returnMoves[0]!.lotId).toBe(lot.id);
      expect(returnMoves[0]!.refType).toBe('invoice');
      expect(returnMoves[0]!.refId).toBe(note.id);

      // return_in kendi fişini atar (INV borç / 621 alacak) — delivery'nin attığı COGS'u tam netler.
      expect((await probe.bal('621', 'VUK')).toFixed(4)).toBe('0.0000');

      // Muhasebe (610/391/120) da doğru tersine çevrildi — bu servisin zaten bilinen davranışı.
      expect((await probe.bal('610', 'VUK')).toFixed(4)).toBe('2000.0000');
      expect((await probe.bal('120', 'VUK')).toFixed(4)).toBe('0.0000');
    });
  });

  it('createCreditNote (satış, teslimatsız — createInvoiceFromOrder): fiziksel mal sevk edilmediğinden return_in ÜRETİLMEZ', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureJournals(tx);
      // makeRealSalesInvoice hiç deliveryLineId taşımaz — teslimatsız (hizmet/manuel) satış senaryosunun testteki sadeleşmiş hali.
      const source = await makeRealSalesInvoice(tx, b, { subtotal: '300', vat: '3' });

      const { invoice: note } = await createCreditNote(tx, { invoiceId: source.id, reason: 'Fiyat düzeltmesi' }, ctx);
      expect(note.kind).toBe('sales_return');

      const returnMoves = await tx.select().from(stockMoves).where(eq(stockMoves.refId, note.id));
      expect(returnMoves).toHaveLength(0);
    });
  });

  it('cancelInvoice: hiç tahsil edilmemiş faturayı ters kayıtla iptal eder; tahsil edilmiş faturayı reddeder', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureJournals(tx);
      const probe = await balanceProbe(tx);
      const source = await makeRealSalesInvoice(tx, b, { subtotal: '500', vat: '5' });

      const { invoice: cancelled } = await cancelInvoice(tx, source.id, ctx, { reason: 'mükerrer' });
      expect(cancelled.status).toBe('cancelled');
      // Ters kayıt: 120/600/391 net sıfıra döner
      expect((await probe.bal('120', 'VUK')).toFixed(4)).toBe('0.0000');
      expect((await probe.bal('600', 'VUK')).toFixed(4)).toBe('0.0000');

      const paidInvoice = await makeRealSalesInvoice(tx, b, { subtotal: '200', vat: '2' });
      await tx.update(invoices).set({ paidAmount: '202.0000' }).where(eq(invoices.id, paidInvoice.id));
      const err = await expectReject(tx, (sp) => cancelInvoice(sp, paidInvoice.id, ctx));
      expect(String((err as Error).message)).toMatch(/tahsilat/);
    });
  });

  it('getAging: açık faturaları vade bazlı kovalara ayırır', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureJournals(tx);
      const docNo = await nextDocNo(tx, 'INV', new Date());
      const [inv] = await tx
        .insert(invoices)
        .values({
          docNo, kind: 'sales', status: 'posted', partnerId: b.customer.id, invoiceDate: '2026-01-01', dueDate: '2026-01-10',
          subtotal: '1000.0000', vatTotal: '10.0000', grandTotal: '1010.0000', grandTotalTry: '1010.0000', residual: '1010.0000',
        })
        .returning();
      const result = await getAging(tx, { partnerId: b.customer.id, kind: 'sales', asOf: '2026-02-15' });
      expect(result.rows.some((r) => r.invoiceId === inv!.id)).toBe(true);
      const row = result.rows.find((r) => r.invoiceId === inv!.id)!;
      expect(row.daysOverdue).toBe(36);
      const bucket90 = result.buckets.find((bkt) => bkt.label === '31-60 gün')!;
      expect(round4(bucket90.amount).gte(D('1010'))).toBe(true);
    });
  });
});
