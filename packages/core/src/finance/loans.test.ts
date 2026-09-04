import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { journals, loans, loanInstallments, type Tx } from '@plantero/db';
import { withRollback, seedBase, ctx, d, today, balanceProbe, suffix, type Base } from '../__tests__/helpers.js';
import { postLoanOpeningEntry, postLoanInstallmentPayment } from './loans.js';
import { round4 } from '../money.js';

/** BNK yevmiyesi seedBase'de yok — testte elle eklenir (bkz. finance/payments.test.ts örüntüsü). */
async function ensureBankJournal(tx: Tx) {
  await tx.insert(journals).values({ code: 'BNK', name: 'Banka Yevmiyesi', kind: 'bank', defaultAccountCode: '102' }).onConflictDoNothing({ target: journals.code });
}

async function makeLoan(tx: Tx, opts: { remainingPrincipal: string; accountCode?: string; interestAccountCode?: string }) {
  const s = suffix();
  const [loan] = await tx
    .insert(loans)
    .values({
      code: `L-${s}`,
      bankName: 'Test Bankası',
      productName: `Test Kredi ${s}`,
      principal: opts.remainingPrincipal,
      openedAt: today(),
      termMonths: 12,
      monthlyRatePct: '2.5',
      monthlyInstallment: '1000.0000',
      paymentDay: 15,
      remainingPrincipal: opts.remainingPrincipal,
      remainingInstallments: 1,
      accountCode: opts.accountCode ?? '300',
      interestAccountCode: opts.interestAccountCode ?? '780',
    })
    .returning();
  return loan!;
}

describe('finance/loans', () => {
  it('postLoanOpeningEntry: 500 borç / 300.xx alacak, VUK+UFRS ikiz fiş üretir', async () => {
    await withRollback(async (tx) => {
      const b: Base = await seedBase(tx);
      void b;
      const loan = await makeLoan(tx, { remainingPrincipal: '50000.0000' });
      const probe = await balanceProbe(tx);

      const result = await postLoanOpeningEntry(tx, loan.id, ctx);
      expect(result.skipped).toBe(false);
      expect(result.journalEntryId).toBeTruthy();

      expect((await probe.bal('500', 'VUK')).toFixed(4)).toBe('50000.0000');
      expect((await probe.bal('300', 'VUK')).toFixed(4)).toBe('-50000.0000');
      expect((await probe.bal('500', 'UFRS')).toFixed(4)).toBe('50000.0000');
      expect((await probe.bal('300', 'UFRS')).toFixed(4)).toBe('-50000.0000');
    });
  });

  it('postLoanOpeningEntry: idempotent — ikinci çağrı no-op, ikinci fiş atılmaz', async () => {
    await withRollback(async (tx) => {
      await seedBase(tx);
      const loan = await makeLoan(tx, { remainingPrincipal: '12345.6700' });

      const first = await postLoanOpeningEntry(tx, loan.id, ctx);
      expect(first.skipped).toBe(false);

      const probe = await balanceProbe(tx);
      const second = await postLoanOpeningEntry(tx, loan.id, ctx);
      expect(second.skipped).toBe(true);
      expect(second.journalEntryId).toBeUndefined();

      // İkinci çağrıdan sonra hiçbir hesap bakiyesi değişmedi (fiş tekrar atılmadı)
      expect((await probe.bal('500', 'VUK')).toFixed(4)).toBe('0.0000');
      expect((await probe.bal('300', 'VUK')).toFixed(4)).toBe('0.0000');
    });
  });

  it('postLoanInstallmentPayment: 300.xx borç (anapara) + 780 borç (faiz) + 102 alacak (toplam taksit); taksit paid işaretlenir', async () => {
    await withRollback(async (tx) => {
      await seedBase(tx);
      await ensureBankJournal(tx);
      const loan = await makeLoan(tx, { remainingPrincipal: '10000.0000' });
      const [inst] = await tx
        .insert(loanInstallments)
        .values({
          loanId: loan.id, seq: 1, dueDate: today(), period: today().slice(0, 7),
          installment: '1050.0000', interest: '50.0000', principal: '1000.0000', remainingAfter: '9000.0000', status: 'scheduled',
        })
        .returning();

      const probe = await balanceProbe(tx);
      const result = await postLoanInstallmentPayment(tx, { loanId: loan.id, seq: 1 }, ctx);
      expect(result.skipped).toBe(false);
      expect(result.journalEntryId).toBeTruthy();

      expect((await probe.bal('300', 'VUK')).toFixed(4)).toBe('1000.0000');
      expect((await probe.bal('780', 'VUK')).toFixed(4)).toBe('50.0000');
      expect((await probe.bal('102', 'VUK')).toFixed(4)).toBe('-1050.0000');

      const [updated] = await tx.select().from(loanInstallments).where(eq(loanInstallments.id, inst!.id)).limit(1);
      expect(updated!.status).toBe('paid');
      expect(updated!.journalEntryId).toBe(result.journalEntryId);
      expect(round4(d(updated!.principal)).toFixed(4)).toBe('1000.0000');
    });
  });

  it('postLoanInstallmentPayment: zaten ödenmiş taksit no-op döner, ikinci fiş atılmaz', async () => {
    await withRollback(async (tx) => {
      await seedBase(tx);
      await ensureBankJournal(tx);
      const loan = await makeLoan(tx, { remainingPrincipal: '5000.0000' });
      await tx.insert(loanInstallments).values({
        loanId: loan.id, seq: 1, dueDate: today(), period: today().slice(0, 7),
        installment: '550.0000', interest: '50.0000', principal: '500.0000', remainingAfter: '4500.0000', status: 'scheduled',
      });

      await postLoanInstallmentPayment(tx, { loanId: loan.id, seq: 1 }, ctx);
      const probe = await balanceProbe(tx);
      const second = await postLoanInstallmentPayment(tx, { loanId: loan.id, seq: 1 }, ctx);
      expect(second.skipped).toBe(true);
      expect((await probe.bal('300', 'VUK')).toFixed(4)).toBe('0.0000');
    });
  });

  it('postLoanOpeningEntry: hesap kodu tanımlı olmayan kredi reddedilir', async () => {
    await withRollback(async (tx) => {
      await seedBase(tx);
      const s = suffix();
      const [loan] = await tx
        .insert(loans)
        .values({
          code: `L-${s}`, bankName: 'Test Bankası', productName: `Test Kredi ${s}`, principal: '1000.0000', openedAt: today(),
          termMonths: 12, monthlyRatePct: '2.5', monthlyInstallment: '100.0000', paymentDay: 10,
          remainingPrincipal: '1000.0000', remainingInstallments: 1, accountCode: null,
        })
        .returning();
      await expect(postLoanOpeningEntry(tx, loan!.id, ctx)).rejects.toThrow();
    });
  });
});
