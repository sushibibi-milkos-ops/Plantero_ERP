import { describe, expect, it } from 'vitest';
import { draftDunningMessage, fallbackDunningMessage } from '../dunning.js';

const invoice = { docNo: 'INV-2026-000456', grandTotal: '12000.0000', residual: '12000.0000', dueDate: '2026-08-01', currency: 'TRY' };
const partner = { name: 'Deniz Gıda Ticaret Ltd. Şti.' };

describe('fallbackDunningMessage', () => {
  it('seviye 1 nazik hatırlatma üretir', () => {
    const draft = fallbackDunningMessage(invoice, partner, 1);
    expect(draft.subject).toContain('INV-2026-000456');
    expect(draft.body).toContain(partner.name);
    expect(draft.body).toContain('₺12.000,00');
  });

  it('seviye 4 ihtarname niteliğinde uyarı üretir', () => {
    const draft = fallbackDunningMessage(invoice, partner, 4);
    expect(draft.subject).toContain('İHTARNAME');
    expect(draft.body).toContain('yasal takip');
  });

  it('4 seviye de farklı metin üretir', () => {
    const bodies = [1, 2, 3, 4].map((l) => fallbackDunningMessage(invoice, partner, l as 1 | 2 | 3 | 4).body);
    expect(new Set(bodies).size).toBe(4);
  });
});

describe('draftDunningMessage (ANTHROPIC_API_KEY yokken fallback)', () => {
  it('API anahtarı yoksa şablon fallback döner', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const draft = await draftDunningMessage(invoice, partner, 2);
    expect(draft).toEqual(fallbackDunningMessage(invoice, partner, 2));
  });
});
