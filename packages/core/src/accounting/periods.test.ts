import { describe, it, expect } from 'vitest';
import { fiscalPeriods, type Tx } from '@plantero/db';
import { closePeriod, openPeriod, listPeriods } from './periods.js';
import { postJournalEntry } from './journal.js';
import { D } from '../money.js';
import { withRollback, seedBase, ctx, expectReject } from '../__tests__/helpers.js';

async function openFiscalPeriod(tx: Tx, code: string) {
  const [y, m] = code.split('-').map(Number);
  const start = `${code}-01`;
  const end = new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
  await tx.insert(fiscalPeriods).values({ code, year: y!, month: m!, startDate: start, endDate: end }).onConflictDoNothing({ target: fiscalPeriods.code });
}

describe('accounting/periods — dönem kapat/aç', () => {
  it('kapatılan döneme fiş atılamaz; açılınca tekrar atılabilir; idempotent', async () => {
    await withRollback(async (tx) => {
      await seedBase(tx);
      const code = '2032-03';
      await openFiscalPeriod(tx, code);

      const closed = await closePeriod(tx, code, ctx);
      expect(closed.isClosed).toBe(true);
      expect(closed.closedAt).toBeTruthy();

      // İdempotent: ikinci kapatma hata vermez, aynı satırı döner
      const closedAgain = await closePeriod(tx, code, ctx);
      expect(closedAgain.isClosed).toBe(true);

      const err = await expectReject(tx, (sp) =>
        postJournalEntry(sp, { ledger: 'VUK', journalCode: 'GEN', entryDate: new Date(`${code}-15`), description: 'test', lines: [{ accountCode: '100', debit: D('1') }, { accountCode: '500', credit: D('1') }] }, ctx),
      );
      expect(String((err as Error).message)).toMatch(/kapalı/);

      const reopened = await openPeriod(tx, code, ctx);
      expect(reopened.isClosed).toBe(false);
      expect(reopened.closedAt).toBeNull();

      const rows = await listPeriods(tx);
      expect(rows.some((r) => r.code === code)).toBe(true);
    });
  });

  it('olmayan dönem kodunda NotFoundError fırlatır', async () => {
    await withRollback(async (tx) => {
      await seedBase(tx);
      const err = await expectReject(tx, (sp) => closePeriod(sp, '1999-01', ctx));
      expect(String((err as Error).message)).toMatch(/bulunamadı/);
    });
  });
});
