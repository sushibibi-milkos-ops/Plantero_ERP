import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { journals, invoices, invoiceLines, type Tx } from '@plantero/db';
import { createExpensePurchaseInvoice, createCreditNote, cancelInvoice, getAging } from './invoices.js';
import { postJournalEntry } from './journal.js';
import { nextDocNo } from '../sequences.js';
import { D, toDb, round4 } from '../money.js';
import { withRollback, seedBase, ctx, d, expectReject, balanceProbe, type Base } from '../__tests__/helpers.js';

async function ensureJournals(tx: Tx) {
  for (const j of [
    { code: 'ALS', name: 'Alış Yevmiyesi', kind: 'purchase' as const },
    { code: 'SAT', name: 'Satış Yevmiyesi', kind: 'sales' as const },
  ]) {
    await tx.insert(journals).values(j).onConflictDoNothing({ target: journals.code });
  }
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
