import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { journals, invoices, payments, exchangeRates, type Tx } from '@plantero/db';
import { postJournalEntry, getPartnerBalance } from '../accounting/journal.js';
import { recordPayment, unapplyPayment, getOpenInvoicesForPartner } from './payments.js';
import { withRollback, seedBase, ctx, d, today, expectReject, balanceProbe, type Base } from '../__tests__/helpers.js';
import { round4 } from '../money.js';

/** SAT/ALS/BNK/KAS/KUR yevmiyeleri seedBase'de yok — testte elle eklenir (bkz. sales/orders.test.ts örüntüsü). */
async function ensureJournals(tx: Tx) {
  for (const j of [
    { code: 'SAT', name: 'Satış Yevmiyesi', kind: 'sales' as const, defaultAccountCode: '600' },
    { code: 'ALS', name: 'Alış Yevmiyesi', kind: 'purchase' as const, defaultAccountCode: '320' },
    { code: 'BNK', name: 'Banka Yevmiyesi', kind: 'bank' as const, defaultAccountCode: '102' },
    { code: 'KAS', name: 'Kasa Yevmiyesi', kind: 'cash' as const, defaultAccountCode: '100' },
    { code: 'KUR', name: 'Kur Farkı Yevmiyesi', kind: 'fx' as const },
  ]) {
    await tx.insert(journals).values(j).onConflictDoNothing({ target: journals.code });
  }
}

/** Gerçek `createInvoiceFromOrder`'ın ürettiği duruma denk bir fatura kurar (120/320 fişi dahil) — payments.ts'in yalnızca kendi mantığını izole test eder. */
async function makeInvoice(tx: Tx, opts: { partnerId: string; kind: 'sales' | 'purchase'; currency?: string; exchangeRate?: string; grandTotal: string; dueDate?: string }) {
  const currency = opts.currency ?? 'TRY';
  const exchangeRate = opts.exchangeRate ?? '1';
  const grandTotal = round4(d(opts.grandTotal));
  const grandTotalTry = round4(grandTotal.mul(d(exchangeRate)));
  const docNo = `TEST-INV-${Math.random().toString(36).slice(2, 8)}`;
  const dueDate = opts.dueDate ?? today();
  const [invoice] = await tx
    .insert(invoices)
    .values({
      docNo, kind: opts.kind, status: 'posted', partnerId: opts.partnerId, invoiceDate: today(), dueDate, currency,
      exchangeRate, subtotal: grandTotal.toFixed(4), vatTotal: '0.0000', grandTotal: grandTotal.toFixed(4),
      grandTotalTry: grandTotalTry.toFixed(4), residual: grandTotal.toFixed(4), origin: 'manual',
    })
    .returning();

  const lines =
    opts.kind === 'sales'
      ? [{ accountCode: '120', debit: grandTotalTry, partnerId: opts.partnerId }, { accountCode: '600', credit: grandTotalTry }]
      : [{ accountCode: '320.999', debit: grandTotalTry }, { accountCode: '320', credit: grandTotalTry, partnerId: opts.partnerId }];
  const { vukId } = await postJournalEntry(tx, {
    ledger: 'both', journalCode: opts.kind === 'sales' ? 'SAT' : 'ALS', entryDate: new Date(), description: `Test fatura ${docNo}`,
    refType: 'invoice', refId: invoice!.id, refNo: docNo, partnerId: opts.partnerId, currency, exchangeRate: d(exchangeRate), lines, origin: 'manual',
  }, ctx);
  await tx.update(invoices).set({ journalEntryId: vukId ?? null }).where(eq(invoices.id, invoice!.id));
  const [final] = await tx.select().from(invoices).where(eq(invoices.id, invoice!.id));
  return final!;
}

async function seedEurRate(tx: Tx, rate: string, dateStr = today()) {
  await tx.insert(exchangeRates).values({ currency: 'EUR', rateDate: dateStr, buying: rate, selling: rate, source: 'TEST' }).onConflictDoUpdate({ target: [exchangeRates.currency, exchangeRates.rateDate], set: { buying: rate, selling: rate } });
}

describe('finance/payments', () => {
  it('TRY tahsilat: fatura tam kapanır, 102 borçlanır, 120.cari alacaklanır, kur farkı üretilmez', async () => {
    await withRollback(async (tx) => {
      const b: Base = await seedBase(tx);
      await ensureJournals(tx);
      const probe = await balanceProbe(tx);
      const invoice = await makeInvoice(tx, { partnerId: b.customer.id, kind: 'sales', grandTotal: '1000' });

      const { payment, allocations } = await recordPayment(tx, {
        direction: 'inbound', method: 'bank_transfer', partnerId: b.customer.id, paymentDate: today(), amount: d(1000),
        allocations: [{ invoiceId: invoice.id, amount: d(1000) }],
      }, ctx);

      expect(payment.docNo).toMatch(/^PAY-/);
      expect(payment.amountTry).toBe('1000.0000');
      expect(payment.fxDifference).toBe('0.0000');
      expect(payment.fxJournalEntryId).toBeNull();
      expect(allocations).toHaveLength(1);
      expect(allocations[0]!.amountTry).toBe('1000.0000');

      const [updated] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id));
      expect(updated!.paidAmount).toBe('1000.0000');
      expect(updated!.residual).toBe('0.0000');
      expect(updated!.status).toBe('paid');

      // 120.cari faturayla borçlanmış, tahsilatla tam kapanmış olmalı (delta sıfır)
      expect((await probe.bal('120', 'VUK')).toFixed(4)).toBe('0.0000');
      expect((await probe.bal('102', 'VUK')).toFixed(4)).toBe('1000.0000');

      const { receivable } = await getPartnerBalance(tx, b.customer.id);
      expect(receivable.toFixed(4)).toBe('0.0000');
    });
  });

  it('EUR tahsilat: kur payment > invoice ⇒ lehte kur farkı (646 alacaklanır), 120.cari tam kapanır', async () => {
    await withRollback(async (tx) => {
      const b: Base = await seedBase(tx);
      await ensureJournals(tx);
      const probe = await balanceProbe(tx);

      await seedEurRate(tx, '35.000000');
      const invoice = await makeInvoice(tx, { partnerId: b.customer.id, kind: 'sales', currency: 'EUR', exchangeRate: '35', grandTotal: '1000' });

      await seedEurRate(tx, '36.000000');
      const { payment } = await recordPayment(tx, {
        direction: 'inbound', partnerId: b.customer.id, paymentDate: today(), currency: 'EUR', amount: d(1000),
        allocations: [{ invoiceId: invoice.id, amount: d(1000) }],
      }, ctx);

      // fx_difference = amount × (payment.rate − invoice.rate) = 1000 × (36−35) = 1000
      expect(payment.fxDifference).toBe('1000.0000');
      expect(payment.fxJournalEntryId).not.toBeNull();
      expect(payment.amountTry).toBe('36000.0000');

      const [updated] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id));
      expect(updated!.status).toBe('paid');
      expect(updated!.residual).toBe('0.0000');

      // Ana fiş 120'yi 36000 alacaklandırdı, kur farkı fişi lehte olduğu için 120'yi 1000 borçlandırıp
      // 646'yı 1000 alacaklandırdı ⇒ net 120 = 36000 − 1000 = 35000 = faturanın kendi kuruyla TL karşılığı.
      expect((await probe.bal('120', 'VUK')).toFixed(4)).toBe('0.0000');
      expect((await probe.bal('646', 'VUK')).toFixed(4)).toBe('-1000.0000'); // alacak bakiyesi negatif (gelir)
      expect((await probe.bal('656', 'VUK')).toFixed(4)).toBe('0.0000');

      const { receivable } = await getPartnerBalance(tx, b.customer.id);
      expect(receivable.toFixed(4)).toBe('0.0000');
    });
  });

  it('EUR tahsilat: kur payment < invoice ⇒ aleyhte kur farkı (656 borçlanır)', async () => {
    await withRollback(async (tx) => {
      const b: Base = await seedBase(tx);
      await ensureJournals(tx);
      const probe = await balanceProbe(tx);

      await seedEurRate(tx, '35.000000');
      const invoice = await makeInvoice(tx, { partnerId: b.customer.id, kind: 'sales', currency: 'EUR', exchangeRate: '35', grandTotal: '1000' });

      await seedEurRate(tx, '34.000000');
      const { payment } = await recordPayment(tx, {
        direction: 'inbound', partnerId: b.customer.id, paymentDate: today(), currency: 'EUR', amount: d(1000),
        allocations: [{ invoiceId: invoice.id, amount: d(1000) }],
      }, ctx);

      expect(payment.fxDifference).toBe('-1000.0000');
      expect((await probe.bal('120', 'VUK')).toFixed(4)).toBe('0.0000');
      expect((await probe.bal('656', 'VUK')).toFixed(4)).toBe('1000.0000'); // gider borç bakiyesi
      expect((await probe.bal('646', 'VUK')).toFixed(4)).toBe('0.0000');
    });
  });

  it('TRY ödeme: 320.cari borçlanır, kasa/banka alacaklanır, tedarikçi bakiyesi kapanır', async () => {
    await withRollback(async (tx) => {
      const b: Base = await seedBase(tx);
      await ensureJournals(tx);
      const probe = await balanceProbe(tx);
      const invoice = await makeInvoice(tx, { partnerId: b.supplier.id, kind: 'purchase', grandTotal: '500' });

      await recordPayment(tx, {
        direction: 'outbound', method: 'cash', partnerId: b.supplier.id, paymentDate: today(), amount: d(500),
        allocations: [{ invoiceId: invoice.id, amount: d(500) }],
      }, ctx);

      // '320' aggregate ('320' + '320.%') 320.999'u da kapsar (bkz. ledger/mapping.ts) — tedarikçi carisi
      // yalnızca getPartnerBalance (partnerId filtreli) ile doğrulanır; kasa hesabı bağımsız kontrol edilir.
      expect((await probe.bal('100', 'VUK')).toFixed(4)).toBe('-500.0000');
      const { payable } = await getPartnerBalance(tx, b.supplier.id);
      expect(payable.toFixed(4)).toBe('0.0000');
    });
  });

  it('EUR ödeme: kur payment > invoice ⇒ aleyhte (656), payment < invoice ⇒ lehte (646)', async () => {
    await withRollback(async (tx) => {
      const b: Base = await seedBase(tx);
      await ensureJournals(tx);
      const probe = await balanceProbe(tx);

      await seedEurRate(tx, '35.000000');
      const invoice = await makeInvoice(tx, { partnerId: b.supplier.id, kind: 'purchase', currency: 'EUR', exchangeRate: '35', grandTotal: '1000' });
      await seedEurRate(tx, '36.000000');

      const { payment } = await recordPayment(tx, {
        direction: 'outbound', partnerId: b.supplier.id, paymentDate: today(), currency: 'EUR', amount: d(1000),
        allocations: [{ invoiceId: invoice.id, amount: d(1000) }],
      }, ctx);

      expect(payment.fxDifference).toBe('1000.0000'); // amount × (36−35)
      expect((await probe.bal('656', 'VUK')).toFixed(4)).toBe('1000.0000'); // daha çok TL ödedik ⇒ zarar
      const { payable } = await getPartnerBalance(tx, b.supplier.id);
      expect(payable.toFixed(4)).toBe('0.0000');
    });
  });

  it('kısmi tahsis: iki faturaya bölünmüş tahsilat her ikisini de doğru günceller', async () => {
    await withRollback(async (tx) => {
      const b: Base = await seedBase(tx);
      await ensureJournals(tx);
      const inv1 = await makeInvoice(tx, { partnerId: b.customer.id, kind: 'sales', grandTotal: '600' });
      const inv2 = await makeInvoice(tx, { partnerId: b.customer.id, kind: 'sales', grandTotal: '400' });

      const { payment, allocations } = await recordPayment(tx, {
        direction: 'inbound', partnerId: b.customer.id, paymentDate: today(), amount: d(1000),
        allocations: [{ invoiceId: inv1.id, amount: d(600) }, { invoiceId: inv2.id, amount: d(400) }],
      }, ctx);

      expect(allocations).toHaveLength(2);
      expect(payment.unallocatedAmount).toBe('0.0000');
      const [u1] = await tx.select().from(invoices).where(eq(invoices.id, inv1.id));
      const [u2] = await tx.select().from(invoices).where(eq(invoices.id, inv2.id));
      expect(u1!.status).toBe('paid');
      expect(u2!.status).toBe('paid');
    });
  });

  it('kısmi ödeme (tek fatura, tutarın altında): fatura partially_paid kalır, residual doğru', async () => {
    await withRollback(async (tx) => {
      const b: Base = await seedBase(tx);
      await ensureJournals(tx);
      const invoice = await makeInvoice(tx, { partnerId: b.customer.id, kind: 'sales', grandTotal: '1000' });

      await recordPayment(tx, {
        direction: 'inbound', partnerId: b.customer.id, paymentDate: today(), amount: d(300),
        allocations: [{ invoiceId: invoice.id, amount: d(300) }],
      }, ctx);

      const [updated] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id));
      expect(updated!.status).toBe('partially_paid');
      expect(updated!.paidAmount).toBe('300.0000');
      expect(updated!.residual).toBe('700.0000');
    });
  });

  it('tahsis tutarı fatura kalanını aşarsa reddedilir', async () => {
    await withRollback(async (tx) => {
      const b: Base = await seedBase(tx);
      await ensureJournals(tx);
      const invoice = await makeInvoice(tx, { partnerId: b.customer.id, kind: 'sales', grandTotal: '100' });

      const err = await expectReject(tx, (sp) =>
        recordPayment(sp, { direction: 'inbound', partnerId: b.customer.id, paymentDate: today(), amount: d(200), allocations: [{ invoiceId: invoice.id, amount: d(200) }] }, ctx),
      );
      expect(String((err as Error).message)).toMatch(/kalan tutarı/);
    });
  });

  it('yanlış yönde fatura tahsisi reddedilir (alış faturasına tahsilat)', async () => {
    await withRollback(async (tx) => {
      const b: Base = await seedBase(tx);
      await ensureJournals(tx);
      const invoice = await makeInvoice(tx, { partnerId: b.supplier.id, kind: 'purchase', grandTotal: '100' });

      const err = await expectReject(tx, (sp) =>
        recordPayment(sp, { direction: 'inbound', partnerId: b.supplier.id, paymentDate: today(), amount: d(100), allocations: [{ invoiceId: invoice.id, amount: d(100) }] }, ctx),
      );
      expect(err).toBeTruthy();
    });
  });

  it('unapplyPayment: tahsilatı geri alır, fatura ve bakiye eski haline döner', async () => {
    await withRollback(async (tx) => {
      const b: Base = await seedBase(tx);
      await ensureJournals(tx);
      const probe = await balanceProbe(tx);
      const invoice = await makeInvoice(tx, { partnerId: b.customer.id, kind: 'sales', grandTotal: '1000' });

      const { payment } = await recordPayment(tx, {
        direction: 'inbound', partnerId: b.customer.id, paymentDate: today(), amount: d(1000),
        allocations: [{ invoiceId: invoice.id, amount: d(1000) }],
      }, ctx);

      await unapplyPayment(tx, payment.id, ctx);

      const [updated] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id));
      expect(updated!.paidAmount).toBe('0.0000');
      expect(updated!.residual).toBe('1000.0000');
      expect(updated!.status).toBe('posted');
      expect((await probe.bal('120', 'VUK')).toFixed(4)).toBe('1000.0000'); // yalnızca fatura kaldı
      expect((await probe.bal('102', 'VUK')).toFixed(4)).toBe('0.0000'); // tahsilat ters döndü

      const [cancelled] = await tx.select().from(payments).where(eq(payments.id, payment.id));
      expect(cancelled!.status).toBe('cancelled');
    });
  });

  it('getOpenInvoicesForPartner: yalnızca kalanı olan ve doğru yöndeki faturaları vade sırasıyla döner', async () => {
    await withRollback(async (tx) => {
      const b: Base = await seedBase(tx);
      await ensureJournals(tx);
      const inv1 = await makeInvoice(tx, { partnerId: b.customer.id, kind: 'sales', grandTotal: '100', dueDate: '2030-02-01' });
      const inv2 = await makeInvoice(tx, { partnerId: b.customer.id, kind: 'sales', grandTotal: '200', dueDate: '2030-01-01' });
      await recordPayment(tx, { direction: 'inbound', partnerId: b.customer.id, paymentDate: today(), amount: d(100), allocations: [{ invoiceId: inv1.id, amount: d(100) }] }, ctx);

      const open = await getOpenInvoicesForPartner(tx, b.customer.id, 'inbound');
      expect(open.map((o) => o.id)).toEqual([inv2.id]);
    });
  });

  it('yeterli tutar yoksa fatura eşleşmez (kalan 0.0001 tolerans dışında) — tam kapama sonrası ikinci tahsilat reddedilir', async () => {
    await withRollback(async (tx) => {
      const b: Base = await seedBase(tx);
      await ensureJournals(tx);
      const invoice = await makeInvoice(tx, { partnerId: b.customer.id, kind: 'sales', grandTotal: '100' });
      await recordPayment(tx, { direction: 'inbound', partnerId: b.customer.id, paymentDate: today(), amount: d(100), allocations: [{ invoiceId: invoice.id, amount: d(100) }] }, ctx);

      const err = await expectReject(tx, (sp) =>
        recordPayment(sp, { direction: 'inbound', partnerId: b.customer.id, paymentDate: today(), amount: d(1), allocations: [{ invoiceId: invoice.id, amount: d(1) }] }, ctx),
      );
      expect(err).toBeTruthy();
    });
  });
});
