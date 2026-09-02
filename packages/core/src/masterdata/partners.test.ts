import { describe, it, expect } from 'vitest';
import { validateTaxNumber, nextPartnerCode, createPartner, updatePartner } from './partners.js';
import { withRollback } from '../__tests__/helpers.js';

describe('masterdata/partners — VKN/TCKN doğrulama ve cari kodu', () => {
  it('validateTaxNumber: 10 hane VKN kabul edilir, boş alan geçerlidir', () => {
    expect(validateTaxNumber('1700727314').valid).toBe(true); // Plantero VKN (docs/ARCHITECTURE.md)
    expect(validateTaxNumber(null).valid).toBe(true);
    expect(validateTaxNumber('123').valid).toBe(false);
    expect(validateTaxNumber('abcdefghij').valid).toBe(false);
  });

  it('validateTaxNumber: TCKN algoritma doğrulaması (11 hane)', () => {
    expect(validateTaxNumber('99999999999').valid).toBe(false); // algoritmaya uymaz
    expect(validateTaxNumber('01234567890').valid).toBe(false); // ilk hane 0 olamaz
  });

  it('nextPartnerCode: C-000001 biçiminde artan kod üretir', async () => {
    await withRollback(async (tx) => {
      const a = await nextPartnerCode(tx, 'customer');
      const b = await nextPartnerCode(tx, 'customer');
      expect(a).toMatch(/^C-\d{6}$/);
      expect(Number(b.slice(2))).toBe(Number(a.slice(2)) + 1);
      const s = await nextPartnerCode(tx, 'supplier');
      expect(s).toMatch(/^S-\d{6}$/);
    });
  });

  it('createPartner: kod otomatik üretilir, updatePartner alanları değiştirir', async () => {
    await withRollback(async (tx) => {
      const p = await createPartner(tx, { name: 'Test Tedarikçi', kind: 'supplier' });
      expect(p.code).toMatch(/^S-\d{6}$/);
      const updated = await updatePartner(tx, p.id, { phone: '+905551112233' });
      expect(updated.phone).toBe('+905551112233');
    });
  });

  it('createPartner: geçersiz VKN reddedilir', async () => {
    await withRollback(async (tx) => {
      await expect(createPartner(tx, { name: 'Kötü VKN', kind: 'customer', taxNumber: '123' })).rejects.toThrow(/Vergi kimlik/);
    });
  });
});
