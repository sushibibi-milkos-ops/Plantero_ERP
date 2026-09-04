import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { journals, loans, loanInstallments, type Tx } from '@plantero/db';
import { withRollback, seedBase, ctx, d, today, balanceProbe, suffix, type Base } from '../__tests__/helpers.js';
import { postLoanOpeningEntry, postLoanInstallmentPayment, recomputeVariableLoan, listConsolidatedInstallments } from './loans.js';
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

  it('recomputeVariableLoan: sabit faizli kredide reddedilir', async () => {
    await withRollback(async (tx) => {
      await seedBase(tx);
      const loan = await makeLoan(tx, { remainingPrincipal: '10000.0000' }); // rateKind varsayılan 'fixed'
      await expect(recomputeVariableLoan(tx, loan.id, d('3.5'), ctx)).rejects.toThrow();
    });
  });

  it('recomputeVariableLoan: ödenmemiş taksitleri yeni oranla yeniden hesaplar; anapara toplamı kalan bakiyeye tam eşitlenir (son taksit telescoping)', async () => {
    await withRollback(async (tx) => {
      const s = suffix();
      const [loan] = await tx
        .insert(loans)
        .values({
          code: `LV-${s}`, bankName: 'Test Bankası', productName: 'Değişken Test', principal: '30000.0000', openedAt: today(),
          termMonths: 3, monthlyRatePct: '2.0000', rateKind: 'variable', monthlyInstallment: '10200.0000', paymentDay: 10,
          remainingPrincipal: '30000.0000', remainingInstallments: 3, accountCode: '300',
        })
        .returning();

      // 3 taksitlik basit (eski orandaki) bir takvim: her biri 10.000 anapara + 2% faiz kabaca — DEĞERLER
      // testin amacı için kabaca tutarlı, önemli olan recompute'un YENİ orana göre yeniden üretmesi.
      const rows: Array<typeof loanInstallments.$inferInsert> = [
        { loanId: loan!.id, seq: 1, dueDate: today(), period: today().slice(0, 7), installment: '10600.0000', interest: '600.0000', principal: '10000.0000', remainingAfter: '20000.0000', status: 'scheduled' },
        { loanId: loan!.id, seq: 2, dueDate: today(), period: today().slice(0, 7), installment: '10400.0000', interest: '400.0000', principal: '10000.0000', remainingAfter: '10000.0000', status: 'scheduled' },
        { loanId: loan!.id, seq: 3, dueDate: today(), period: today().slice(0, 7), installment: '10200.0000', interest: '200.0000', principal: '10000.0000', remainingAfter: '0.0000', status: 'scheduled' },
      ];
      await tx.insert(loanInstallments).values(rows);

      const result = await recomputeVariableLoan(tx, loan!.id, d('4'), ctx); // %2 → %4
      expect(result.updated).toBe(3);

      const updated = await tx.select().from(loanInstallments).where(eq(loanInstallments.loanId, loan!.id)).orderBy(loanInstallments.seq);
      // seq1: faiz = 30.000 × %4 = 1.200; anapara = taksit(10.600) − faiz = 9.400
      expect(round4(d(updated[0]!.interest)).toFixed(4)).toBe('1200.0000');
      expect(round4(d(updated[0]!.principal)).toFixed(4)).toBe('9400.0000');
      expect(round4(d(updated[0]!.remainingAfter)).toFixed(4)).toBe('20600.0000');
      // Son taksit (seq3): remainingAfter tam SIFIRA kapanır (telescoping) — kuruş sapması birikmez.
      expect(round4(d(updated[2]!.remainingAfter)).toFixed(4)).toBe('0.0000');
      // Σanapara = ilk bakiye (30.000) — I34 ile aynı özdeşlik.
      const principalSum = updated.reduce((acc, r) => acc.plus(d(r.principal)), d(0));
      expect(round4(principalSum).toFixed(4)).toBe('30000.0000');

      const [loanAfter] = await tx.select().from(loans).where(eq(loans.id, loan!.id));
      expect(loanAfter!.monthlyRatePct).toBe('4.000000');
    });
  });

  it('recomputeVariableLoan: ödenmemiş taksit yoksa (hepsi paid) yalnızca oranı günceller, 0 taksit değişir', async () => {
    await withRollback(async (tx) => {
      const s = suffix();
      const [loan] = await tx
        .insert(loans)
        .values({ code: `LV-${s}`, bankName: 'Test', productName: 'Değişken', principal: '5000.0000', openedAt: today(), termMonths: 1, monthlyRatePct: '2', rateKind: 'variable', monthlyInstallment: '5100.0000', paymentDay: 1, remainingPrincipal: '5000.0000', remainingInstallments: 1, accountCode: '300' })
        .returning();
      await tx.insert(loanInstallments).values({ loanId: loan!.id, seq: 1, dueDate: today(), period: today().slice(0, 7), installment: '5100.0000', interest: '100.0000', principal: '5000.0000', remainingAfter: '0.0000', status: 'paid' });

      const result = await recomputeVariableLoan(tx, loan!.id, d('3'), ctx);
      expect(result.updated).toBe(0);
      const [loanAfter] = await tx.select().from(loans).where(eq(loans.id, loan!.id));
      expect(loanAfter!.monthlyRatePct).toBe('3.000000');
    });
  });

  it('listConsolidatedInstallments: birden fazla kredinin taksitlerini dönem+kod sıralı döner', async () => {
    await withRollback(async (tx) => {
      const loanA = await makeLoan(tx, { remainingPrincipal: '1000.0000' });
      const loanB = await makeLoan(tx, { remainingPrincipal: '2000.0000' });
      await tx.insert(loanInstallments).values([
        { loanId: loanA.id, seq: 1, dueDate: today(), period: today().slice(0, 7), installment: '100.0000', interest: '10.0000', principal: '90.0000', remainingAfter: '910.0000', status: 'scheduled' },
        { loanId: loanB.id, seq: 1, dueDate: today(), period: today().slice(0, 7), installment: '200.0000', interest: '20.0000', principal: '180.0000', remainingAfter: '1820.0000', status: 'scheduled' },
      ]);
      const rows = await listConsolidatedInstallments(tx);
      const codes = rows.filter((r) => r.loanId === loanA.id || r.loanId === loanB.id).map((r) => r.loanCode);
      expect(codes).toEqual(expect.arrayContaining([loanA.code, loanB.code]));
    });
  });
});
