import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { accounts, journals, bankAccounts, bankTransactions, invoices, invoiceLines, reconciliationMatches, type Tx } from '@plantero/db';
import { nextDocNo } from '../sequences.js';
import { D } from '../money.js';
import {
  buildCandidates, listUnmatchedTransactions, persistAndApply, isAutoApplicable,
  approveReconciliationMatch, rejectReconciliationMatch, manualReconciliationMatch, ignoreBankTransaction,
  type ReconciliationMatchInput,
} from './reconciliation.js';
import { withRollback, seedBase, ctx, expectReject, balanceProbe, type Base } from '../__tests__/helpers.js';

async function ensureJournals(tx: Tx) {
  for (const j of [
    { code: 'SAT', name: 'Satış Yevmiyesi', kind: 'sales' as const },
    { code: 'BNK', name: 'Banka Yevmiyesi', kind: 'bank' as const },
  ]) {
    await tx.insert(journals).values(j).onConflictDoNothing({ target: journals.code });
  }
}

async function makeBankAccount(tx: Tx, b: Base) {
  const code = `102.TEST-${b.s}`;
  await tx.insert(accounts).values({ code, name: 'Test Banka', type: 'asset', parentCode: '102', level: 2 }).onConflictDoNothing({ target: accounts.code });
  const [acc] = await tx.insert(bankAccounts).values({ code: `BT-${b.s}`, bankName: 'Test Bank', currency: 'TRY', accountCode: code }).returning();
  return acc!;
}

async function makeOpenSalesInvoice(tx: Tx, b: Base, residual: string) {
  const docNo = await nextDocNo(tx, 'INV', new Date());
  const [inv] = await tx
    .insert(invoices)
    .values({ docNo, kind: 'sales', status: 'posted', partnerId: b.customer.id, invoiceDate: '2026-09-01', dueDate: '2026-09-02', subtotal: residual, vatTotal: '0.0000', grandTotal: residual, grandTotalTry: residual, residual })
    .returning();
  await tx.insert(invoiceLines).values({ invoiceId: inv!.id, description: 'x', qty: '1.000', unitPrice: residual, vatRate: '0', lineSubtotal: residual, lineVat: '0.0000', lineTotal: residual, accountCode: '600' });
  return inv!;
}

async function makeBankTx(tx: Tx, bankAccountId: string, opts: { amount: string; description: string; counterpartyName?: string | null; externalRef: string }) {
  const [row] = await tx
    .insert(bankTransactions)
    .values({ bankAccountId, externalRef: opts.externalRef, txDate: '2026-09-03', amount: opts.amount, currency: 'TRY', description: opts.description, counterpartyName: opts.counterpartyName ?? null })
    .returning();
  return row!;
}

describe('accounting/reconciliation — aday toplama + kalıcılaştırma + onay ekranı', () => {
  it('buildCandidates: yöne uygun açık faturalar + cariler döner', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureJournals(tx);
      const bank = await makeBankAccount(tx, b);
      const invoice = await makeOpenSalesInvoice(tx, b, '1500.0000');
      const bt = await makeBankTx(tx, bank.id, { amount: '1500.0000', description: `Havale — ${b.customer.name}`, counterpartyName: b.customer.name, externalRef: 'REF-1' });

      const candidates = await buildCandidates(tx, bt.id);
      expect(candidates.invoices.some((i) => i.id === invoice.id)).toBe(true);
      expect(candidates.partners.some((p) => p.id === b.customer.id)).toBe(true);

      const unmatched = await listUnmatchedTransactions(tx, { bankAccountId: bank.id });
      expect(unmatched.map((r) => r.id)).toContain(bt.id);
    });
  });

  it('isAutoApplicable: tek yüksek güvenli aday true, iki yakın aday false', () => {
    const strong: ReconciliationMatchInput[] = [{ kind: 'invoice', confidence: 0.97, rationale: 'x', source: 'rule' }];
    expect(isAutoApplicable(strong)).toBe(true);
    const ambiguous: ReconciliationMatchInput[] = [
      { kind: 'invoice', confidence: 0.95, rationale: 'a', source: 'rule' },
      { kind: 'invoice', confidence: 0.93, rationale: 'b', source: 'rule' },
    ];
    expect(isAutoApplicable(ambiguous)).toBe(false);
    const unsupported: ReconciliationMatchInput[] = [{ kind: 'marketplace_payout', confidence: 0.99, rationale: 'x', source: 'rule' }];
    expect(isAutoApplicable(unsupported)).toBe(false);
  });

  it('persistAndApply: güven ≥0.92 tek aday → otomatik tahsilat + fiş üretir, bank_transactions matched olur', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureJournals(tx);
      const bank = await makeBankAccount(tx, b);
      const invoice = await makeOpenSalesInvoice(tx, b, '900.0000');
      const bt = await makeBankTx(tx, bank.id, { amount: '900.0000', description: `Havale — ${b.customer.name}`, externalRef: 'REF-2' });

      const result = await persistAndApply(tx, bt.id, [
        { kind: 'invoice', partnerId: b.customer.id, invoiceIds: [invoice.id], allocations: [{ invoiceId: invoice.id, amount: D('900') }], confidence: 0.96, rationale: 'tutar birebir', source: 'rule' },
      ], ctx);

      expect(result.applied).toBe(true);
      expect(result.paymentId).toBeTruthy();
      const [updatedBt] = await tx.select().from(bankTransactions).where(eq(bankTransactions.id, bt.id));
      expect(updatedBt!.status).toBe('matched');
      const [updatedInv] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id));
      expect(updatedInv!.status).toBe('paid');
      expect(updatedInv!.residual).toBe('0.0000');
    });
  });

  it('persistAndApply: düşük güven → suggested kalır; approveReconciliationMatch onaylayınca uygulanır', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureJournals(tx);
      const bank = await makeBankAccount(tx, b);
      const invoice = await makeOpenSalesInvoice(tx, b, '750.0000');
      const bt = await makeBankTx(tx, bank.id, { amount: '750.0000', description: 'Havale', externalRef: 'REF-3' });

      const result = await persistAndApply(tx, bt.id, [
        { kind: 'invoice', partnerId: b.customer.id, invoiceIds: [invoice.id], allocations: [{ invoiceId: invoice.id, amount: D('750') }], confidence: 0.55, rationale: 'belirsiz', source: 'rule' },
      ], ctx);
      expect(result.applied).toBe(false);
      expect(result.suggestedCount).toBe(1);
      const [afterSuggest] = await tx.select().from(bankTransactions).where(eq(bankTransactions.id, bt.id));
      expect(afterSuggest!.status).toBe('suggested');

      const [match] = await tx.select().from(reconciliationMatches).where(eq(reconciliationMatches.bankTransactionId, bt.id));
      const applied = await approveReconciliationMatch(tx, match!.id, ctx);
      expect(applied.paymentId).toBeTruthy();
      const [afterApprove] = await tx.select().from(bankTransactions).where(eq(bankTransactions.id, bt.id));
      expect(afterApprove!.status).toBe('matched');
    });
  });

  it('rejectReconciliationMatch: reddedince hareket unmatched a döner; ignoreBankTransaction ile yok sayılır', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureJournals(tx);
      const bank = await makeBankAccount(tx, b);
      const bt = await makeBankTx(tx, bank.id, { amount: '300.0000', description: 'Tanımsız havale', externalRef: 'REF-4' });
      const invoice = await makeOpenSalesInvoice(tx, b, '300.0000');

      await persistAndApply(tx, bt.id, [
        { kind: 'invoice', partnerId: b.customer.id, invoiceIds: [invoice.id], allocations: [{ invoiceId: invoice.id, amount: D('300') }], confidence: 0.4, rationale: 'zayıf', source: 'rule' },
      ], ctx);
      const [match] = await tx.select().from(reconciliationMatches).where(eq(reconciliationMatches.bankTransactionId, bt.id));
      await rejectReconciliationMatch(tx, match!.id, 'yanlış öneri', ctx);
      const [afterReject] = await tx.select().from(bankTransactions).where(eq(bankTransactions.id, bt.id));
      expect(afterReject!.status).toBe('unmatched');

      await ignoreBankTransaction(tx, bt.id, ctx);
      const [afterIgnore] = await tx.select().from(bankTransactions).where(eq(bankTransactions.id, bt.id));
      expect(afterIgnore!.status).toBe('ignored');
    });
  });

  it('manualReconciliationMatch: gider (expense) türü — banka hesabı + 7XX fişi atar, payment üretmez', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureJournals(tx);
      const bank = await makeBankAccount(tx, b);
      const bt = await makeBankTx(tx, bank.id, { amount: '-450.0000', description: 'SEDAŞ Elektrik Faturası', externalRef: 'REF-5' });
      const probe = await balanceProbe(tx);

      const applied = await manualReconciliationMatch(tx, bt.id, { kind: 'expense', expenseAccountCode: '770', amount: D('450') }, ctx);
      expect(applied.journalEntryId).toBeTruthy();
      expect(applied.paymentId).toBeUndefined();

      expect((await probe.bal('770', 'VUK')).toFixed(4)).toBe('450.0000');
      expect((await probe.bal(bank.accountCode, 'VUK')).toFixed(4)).toBe('-450.0000');
      const [updatedBt] = await tx.select().from(bankTransactions).where(eq(bankTransactions.id, bt.id));
      expect(updatedBt!.status).toBe('matched');
      expect(updatedBt!.matchedExpenseAccountCode).toBe('770');
    });
  });

  it('manualReconciliationMatch: zaten eşleşmiş hareket reddedilir', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureJournals(tx);
      const bank = await makeBankAccount(tx, b);
      const bt = await makeBankTx(tx, bank.id, { amount: '-100.0000', description: 'Masraf', externalRef: 'REF-6' });
      await manualReconciliationMatch(tx, bt.id, { kind: 'expense', expenseAccountCode: '770', amount: D('100') }, ctx);
      const err = await expectReject(tx, (sp) => manualReconciliationMatch(sp, bt.id, { kind: 'expense', expenseAccountCode: '770', amount: D('100') }, ctx));
      expect(String((err as Error).message)).toMatch(/zaten eşleşmiş/);
    });
  });
});
