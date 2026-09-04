import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreModule from '@plantero/core';

const core = vi.hoisted(() => ({
  listUnmatchedTransactions: vi.fn(),
  buildCandidates: vi.fn(),
  persistAndApply: vi.fn(),
}));

vi.mock('@plantero/core', async (importOriginal) => {
  const actual = await importOriginal<typeof CoreModule>();
  return { ...actual, ...core };
});

import { runAiReconciliation } from '../reconciliationRunner.js';

/** `db.transaction` taklidi: callback'e sahte tx nesnesi verir */
const fakeDb = { transaction: async <T,>(fn: (tx: unknown) => Promise<T>) => fn({ fake: true }) } as unknown as Parameters<typeof runAiReconciliation>[0];

const candidatesFor = (id: string, amount: string) => ({
  tx: { id, bankAccountId: 'acc-1', description: 'Havale — ABC Gıda', amount, currency: 'TRY', counterpartyName: 'ABC GIDA TICARET AS', counterpartyIban: null, txDate: '2026-09-01', txType: 'havale' },
  invoices: [{ id: 'inv-1', docNo: 'INV-2026-000001', partnerId: 'p-1', partnerName: 'ABC Gıda Ticaret A.Ş.', residual: '15000.0000', dueDate: '2026-09-01', kind: 'sales' as const }],
  partners: [{ id: 'p-1', name: 'ABC Gıda Ticaret A.Ş.' }],
  loanInstallments: [],
  learnings: [],
});

describe('runAiReconciliation', () => {
  beforeEach(() => {
    core.listUnmatchedTransactions.mockReset();
    core.buildCandidates.mockReset();
    core.persistAndApply.mockReset();
  });

  it('her eşleşmemiş hareket için aday toplar, skorlar ve persistAndApply sonucunu sayar', async () => {
    core.listUnmatchedTransactions.mockResolvedValue([{ id: 'bt-1' }, { id: 'bt-2' }, { id: 'bt-3' }]);
    core.buildCandidates.mockImplementation(async (_tx: unknown, id: string) => candidatesFor(id, id === 'bt-3' ? '77.0000' : '15000.0000'));
    core.persistAndApply.mockImplementation(async (_tx: unknown, id: string, matches: Array<{ confidence: number }>) => {
      if (id === 'bt-1') return { applied: true, suggestedCount: 0 };
      if (id === 'bt-2') return { applied: false, suggestedCount: matches.length };
      return { applied: false, suggestedCount: 0 };
    });

    const result = await runAiReconciliation(fakeDb, {}, { userId: null });

    expect(result.evaluated).toBe(3);
    expect(result.autoApplied).toBe(1);
    expect(result.suggested).toBe(1);
    expect(result.unresolved).toBe(1);
    expect(result.failed).toBe(0);
    expect(core.buildCandidates).toHaveBeenCalledTimes(3);
    // Skorlama sonucu core'un beklediği şekle (ReconciliationMatchInput) dönüştürülerek aktarılır
    const passed = core.persistAndApply.mock.calls[0]![2] as Array<Record<string, unknown>>;
    expect(passed.length).toBeGreaterThan(0);
    expect(passed[0]).toMatchObject({ kind: 'invoice', invoiceIds: ['inv-1'], source: 'rule' });
    expect(typeof passed[0]!.confidence).toBe('number');
  });

  it('bir hareketin uygulanması hata verirse diğerleri işlenmeye devam eder ve hata raporlanır', async () => {
    core.listUnmatchedTransactions.mockResolvedValue([{ id: 'bt-1' }, { id: 'bt-2' }]);
    core.buildCandidates.mockImplementation(async (_tx: unknown, id: string) => candidatesFor(id, '15000.0000'));
    core.persistAndApply.mockImplementation(async (_tx: unknown, id: string) => {
      if (id === 'bt-1') throw new Error('PERIOD_CLOSED: dönem kapalı');
      return { applied: true, suggestedCount: 0 };
    });

    const result = await runAiReconciliation(fakeDb, { bankAccountId: 'acc-1' }, { userId: 'u-1' });

    expect(result.evaluated).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toEqual({ bankTransactionId: 'bt-1', message: 'PERIOD_CLOSED: dönem kapalı' });
    expect(result.autoApplied).toBe(1);
    expect(core.listUnmatchedTransactions).toHaveBeenCalledWith(fakeDb, { bankAccountId: 'acc-1' });
  });
});
