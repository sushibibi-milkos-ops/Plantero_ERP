import { describe, expect, it } from 'vitest';
import { bizimhesap } from '../einvoice/bizimhesap.js';
import { whatsapp } from '../messaging/whatsapp.js';
import { email } from '../messaging/email.js';
import { getIntegrationStatus } from '../index.js';

describe('bizimhesap sandbox', () => {
  it('UUID üretir ve accepted döner', async () => {
    expect(bizimhesap.mode).toBe('sandbox');
    const res = await bizimhesap.sendInvoice({
      kind: 'e_arsiv', docNo: 'INV-2026-000001', partnerName: 'Test Cari A.Ş.', invoiceDate: '2026-09-02',
      currency: 'TRY', lines: [{ description: 'Ürün', qty: '1', unitPrice: '100', vatRate: '1', lineTotal: '101' }],
      subtotal: '100', vatTotal: '1', grandTotal: '101',
    });
    expect(res.ok).toBe(true);
    expect(res.status).toBe('accepted');
    expect(res.sandbox).toBe(true);
    expect(res.uuid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('her çağrıda farklı UUID üretir', async () => {
    const input = { kind: 'e_arsiv' as const, docNo: 'X', partnerName: 'X', invoiceDate: '2026-09-02', currency: 'TRY', lines: [], subtotal: '0', vatTotal: '0', grandTotal: '0' };
    const a = await bizimhesap.sendInvoice(input);
    const b = await bizimhesap.sendInvoice(input);
    expect(a.uuid).not.toBe(b.uuid);
  });
});

describe('messaging sandbox', () => {
  it('whatsapp sandboxta providerId döner', async () => {
    const res = await whatsapp.sendWhatsApp({ to: '+905551234567', body: 'Test' });
    expect(res.ok).toBe(true);
    expect(res.sandbox).toBe(true);
    expect(res.providerId).toContain('sandbox-wa-');
  });

  it('email sandboxta providerId döner', async () => {
    const res = await email.sendEmail({ to: 'test@plantero.local', subject: 'Test', body: 'Merhaba' });
    expect(res.ok).toBe(true);
    expect(res.sandbox).toBe(true);
    expect(res.providerId).toContain('sandbox-email-');
  });
});

describe('getIntegrationStatus', () => {
  it('kimlik bilgisi verilmemiş ortamda tüm adaptörler sandboxtadır', () => {
    const status = getIntegrationStatus();
    expect(status).toEqual({
      einvoice: 'sandbox', trendyol: 'sandbox', hepsiburada: 'sandbox',
      bank: 'sandbox', tcmb: 'sandbox', whatsapp: 'sandbox', email: 'sandbox',
    });
  });
});
