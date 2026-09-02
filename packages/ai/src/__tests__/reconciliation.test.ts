import { describe, expect, it } from 'vitest';
import { isAutoApplicable, matchBankTransaction, ruleBasedMatch, textSimilarity, type ReconCandidates } from '../reconciliation.js';

const baseCandidates: ReconCandidates = {
  invoices: [
    { id: 'inv-1', docNo: 'INV-2026-000123', partnerId: 'p-1', partnerName: 'ABC Gıda Ticaret A.Ş.', residual: '15000.0000', dueDate: '2026-09-01', kind: 'sales' },
    { id: 'inv-2', docNo: 'INV-2026-000124', partnerId: 'p-2', partnerName: 'XYZ Market Ltd. Şti.', residual: '8000.0000', dueDate: '2026-09-05', kind: 'sales' },
  ],
  partners: [
    { id: 'p-1', name: 'ABC Gıda Ticaret A.Ş.' },
    { id: 'p-2', name: 'XYZ Market Ltd. Şti.' },
  ],
  loanInstallments: [{ id: 'li-1', loanId: 'l-1', loanCode: 'L1', dueDate: '2026-09-05', installment: '25000.0000' }],
  learnings: [{ pattern: 'ABC GIDA', patternKind: 'description', partnerId: 'p-1', matchKind: 'invoice', hits: 4 }],
};

describe('textSimilarity', () => {
  it('şirket eklerini görmezden gelerek yüksek benzerlik verir', () => {
    expect(textSimilarity('ABC Gıda Tic. A.Ş.', 'ABC GIDA TİCARET A.Ş.')).toBeGreaterThan(0.6);
  });
  it('alakasız metinlerde düşük benzerlik verir', () => {
    expect(textSimilarity('ABC Gıda', 'Zeynep Kaya Kişisel Hesap')).toBeLessThan(0.3);
  });
});

describe('ruleBasedMatch', () => {
  it('tutar tam eşleşme + isim benzerliği ile yüksek güvenle fatura eşleştirir', () => {
    const matches = ruleBasedMatch(
      { id: 'tx-1', description: 'Havale Gelen - ABC GIDA TICARET AS', amount: '15000.0000', counterpartyName: 'ABC GIDA TICARET AS', txDate: '2026-09-01' },
      baseCandidates,
    );
    expect(matches[0]!.kind).toBe('invoice');
    expect(matches[0]!.invoiceIds).toEqual(['inv-1']);
    expect(matches[0]!.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('fatura numarası açıklamada geçiyorsa tutar farklı olsa da eşleştirir', () => {
    const matches = ruleBasedMatch(
      { id: 'tx-2', description: 'INV-2026-000123 nolu fatura icin kismi odeme', amount: '5000.0000', txDate: '2026-09-01' },
      baseCandidates,
    );
    const invMatch = matches.find((m) => m.invoiceIds.includes('inv-1'));
    expect(invMatch).toBeDefined();
    expect(invMatch!.allocations[0]!.amount).toBe('5000.0000');
  });

  it('kredi taksiti tutar+tarih eşleşmesinde loan_installment döner', () => {
    const matches = ruleBasedMatch({ id: 'tx-3', description: 'Kredi Taksit Odemesi', amount: '-25000.0000', txDate: '2026-09-05' }, baseCandidates);
    expect(matches[0]).toMatchObject({ kind: 'loan_installment', loanInstallmentId: 'li-1' });
    expect(matches[0]!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('banka masrafı deseninde fee döner', () => {
    const matches = ruleBasedMatch({ id: 'tx-4', description: 'EFT Masrafı', amount: '-45.0000', txDate: '2026-09-02' }, { ...baseCandidates, loanInstallments: [] });
    expect(matches[0]).toMatchObject({ kind: 'fee', expenseAccountCode: '770' });
  });

  it('öğrenilmiş IBAN deseninde yüksek güvenle cari önerir', () => {
    const candidatesWithIban: ReconCandidates = {
      ...baseCandidates,
      learnings: [{ pattern: 'TR1234567890', patternKind: 'iban', partnerId: 'p-2', matchKind: 'partner_on_account', hits: 6 }],
    };
    const matches = ruleBasedMatch(
      { id: 'tx-5', description: 'Havale', amount: '1234.0000', counterpartyIban: 'TR1234567890', txDate: '2026-09-02' },
      candidatesWithIban,
    );
    expect(matches.some((m) => m.partnerId === 'p-2' && m.source === 'learned')).toBe(true);
  });

  it('hiçbir kural tutmazsa unknown döner', () => {
    const matches = ruleBasedMatch({ id: 'tx-6', description: 'Bilinmeyen', amount: '99999.0000', txDate: '2026-09-02' }, { invoices: [], partners: [], loanInstallments: [], learnings: [] });
    expect(matches).toEqual([{ kind: 'unknown', invoiceIds: [], allocations: [], confidence: 0, rationale: expect.any(String), features: {}, source: 'rule' }]);
  });
});

describe('isAutoApplicable', () => {
  it('tek yüksek güvenli aday varsa true döner', () => {
    expect(isAutoApplicable([{ kind: 'invoice', invoiceIds: [], allocations: [], confidence: 0.95, rationale: '', features: {}, source: 'rule' }])).toBe(true);
  });
  it('iki güçlü aday varsa (belirsiz) false döner', () => {
    expect(
      isAutoApplicable([
        { kind: 'invoice', invoiceIds: [], allocations: [], confidence: 0.95, rationale: '', features: {}, source: 'rule' },
        { kind: 'invoice', invoiceIds: [], allocations: [], confidence: 0.93, rationale: '', features: {}, source: 'rule' },
      ]),
    ).toBe(false);
  });
  it('güven eşiğin altındaysa false döner', () => {
    expect(isAutoApplicable([{ kind: 'invoice', invoiceIds: [], allocations: [], confidence: 0.8, rationale: '', features: {}, source: 'rule' }])).toBe(false);
  });
});

describe('matchBankTransaction (ANTHROPIC_API_KEY yokken fallback)', () => {
  it('API anahtarı yoksa kural motorunun sonucunu döner', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const matches = await matchBankTransaction(
      { id: 'tx-1', description: 'Havale Gelen - ABC GIDA TICARET AS', amount: '15000.0000', counterpartyName: 'ABC GIDA TICARET AS', txDate: '2026-09-01' },
      baseCandidates,
    );
    expect(matches[0]!.source).toBe('rule');
    expect(matches[0]!.invoiceIds).toEqual(['inv-1']);
  });
});
