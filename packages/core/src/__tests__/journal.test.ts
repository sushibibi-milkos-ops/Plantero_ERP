import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { journalEntries, journalLines, accounts, partners, fiscalPeriods } from '@plantero/db';
import { postJournalEntry, reverseJournalEntry, getAccountBalance, getPartnerBalance } from '../accounting/journal.js';
import { ensurePartnerAccount } from '../accounting/mapping.js';
import { DomainError } from '../auth/errors.js';
import { withRollback, expectReject, seedBase, ctx, d } from './helpers.js';

describe('journal', () => {
  it('dengesiz fiş reddedilir', async () => {
    await withRollback(async (tx) => {
      await seedBase(tx);
      const err = await expectReject(tx, (sp) =>
        postJournalEntry(sp, {
          ledger: 'VUK', journalCode: 'GEN', entryDate: new Date(), description: 'dengesiz',
          lines: [{ accountCode: '100', debit: d('100') }, { accountCode: '500', credit: d('99.9999') }],
        }, ctx),
      );
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe('JOURNAL_UNBALANCED');
    });
  });

  it('4 hane altındaki fark dengeli sayılır', async () => {
    await withRollback(async (tx) => {
      await seedBase(tx);
      const r = await postJournalEntry(tx, {
        ledger: 'VUK', journalCode: 'GEN', entryDate: new Date(), description: 'yuvarlama',
        lines: [{ accountCode: '100', debit: d('100.00004') }, { accountCode: '500', credit: d('100') }],
      }, ctx);
      expect(r.vukId).toBeTruthy();
    });
  });

  it("ledger 'both' → iki fiş, twinEntryId çapraz, satırlarda accountCode/accountId", async () => {
    await withRollback(async (tx) => {
      await seedBase(tx);
      const r = await postJournalEntry(tx, {
        ledger: 'both', journalCode: 'GEN', entryDate: new Date(), description: 'açılış',
        lines: [{ accountCode: '100', debit: d('1000') }, { accountCode: '500', credit: d('1000') }],
      }, ctx);
      expect(r.vukId).toBeTruthy();
      expect(r.ufrsId).toBeTruthy();
      const [vuk] = await tx.select().from(journalEntries).where(eq(journalEntries.id, r.vukId!));
      const [ufrs] = await tx.select().from(journalEntries).where(eq(journalEntries.id, r.ufrsId!));
      expect(vuk!.ledger).toBe('VUK');
      expect(ufrs!.ledger).toBe('UFRS');
      expect(vuk!.twinEntryId).toBe(ufrs!.id);
      expect(ufrs!.twinEntryId).toBe(vuk!.id);
      expect(vuk!.totalDebit).toBe('1000.0000');
      expect(vuk!.docNo).not.toBe(ufrs!.docNo);
      expect(vuk!.periodId).toBeTruthy();

      const lines = await tx.select().from(journalLines).where(eq(journalLines.entryId, r.vukId!));
      expect(lines).toHaveLength(2);
      const [acc100] = await tx.select().from(accounts).where(eq(accounts.code, '100'));
      const l100 = lines.find((l) => l.accountCode === '100');
      expect(l100?.accountId).toBe(acc100!.id);
      expect(l100?.ledger).toBe('VUK');

      expect((await getAccountBalance(tx, { accountCode: '100', ledger: 'VUK' })).toFixed(4)).toBe('1000.0000');
      expect((await getAccountBalance(tx, { accountCode: '100', ledger: 'UFRS' })).toFixed(4)).toBe('1000.0000');
      expect((await getAccountBalance(tx, { accountCode: '500', ledger: 'VUK' })).toFixed(4)).toBe('-1000.0000');
    });
  });

  it('kapalı döneme kayıt reddedilir', async () => {
    await withRollback(async (tx) => {
      await seedBase(tx);
      await tx.insert(fiscalPeriods).values({ code: '1999-01', year: 1999, month: 1, startDate: '1999-01-01', endDate: '1999-01-31', isClosed: true, closedAt: new Date() }).onConflictDoNothing({ target: fiscalPeriods.code });
      await tx.update(fiscalPeriods).set({ isClosed: true }).where(eq(fiscalPeriods.code, '1999-01'));
      const err = await expectReject(tx, (sp) =>
        postJournalEntry(sp, {
          ledger: 'VUK', journalCode: 'GEN', entryDate: new Date(Date.UTC(1999, 0, 15)), description: 'eski',
          lines: [{ accountCode: '100', debit: d('1') }, { accountCode: '500', credit: d('1') }],
        }, ctx),
      );
      expect((err as DomainError).code).toBe('PERIOD_CLOSED');
    });
  });

  it('cari alt hesabı otomatik açılır ve partners.balance güncellenir', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      // Satış faturası: 120.cari borç 1010, 600 alacak 1000, 391 alacak 10
      await postJournalEntry(tx, {
        ledger: 'both', journalCode: 'GEN', entryDate: new Date(), description: 'satış faturası', partnerId: b.customer.id,
        lines: [
          { accountCode: '120', debit: d('1010'), partnerId: b.customer.id },
          { accountCode: '600', credit: d('1000') },
          { accountCode: '391', credit: d('10') },
        ],
      }, ctx);
      const code = `120.${b.customer.code}`;
      const [sub] = await tx.select().from(accounts).where(eq(accounts.code, code));
      expect(sub).toBeTruthy();
      expect(sub!.isPartnerAccount).toBe(true);
      expect(sub!.partnerId).toBe(b.customer.id);
      const [p] = await tx.select().from(partners).where(eq(partners.id, b.customer.id));
      expect(p!.receivableAccountCode).toBe(code);
      expect(p!.balance).toBe('1010.0000');
      const bal = await getPartnerBalance(tx, b.customer.id);
      expect(bal.receivable.toFixed(4)).toBe('1010.0000');
      expect(bal.net.toFixed(4)).toBe('1010.0000');

      // Tahsilat: 102 borç, 120.cari alacak (alt hesap koduyla)
      await postJournalEntry(tx, {
        ledger: 'both', journalCode: 'GEN', entryDate: new Date(), description: 'tahsilat', partnerId: b.customer.id,
        lines: [{ accountCode: '102', debit: d('1010') }, { accountCode: code, credit: d('1010') }],
      }, ctx);
      const [p2] = await tx.select().from(partners).where(eq(partners.id, b.customer.id));
      expect(p2!.balance).toBe('0.0000');

      // Tedarikçi: 320 alt hesabı
      const sup = await ensurePartnerAccount(tx, b.supplier.id, '320');
      expect(sup.code).toBe(`320.${b.supplier.code}`);
      const again = await ensurePartnerAccount(tx, b.supplier.id, '320');
      expect(again.id).toBe(sup.id);
    });
  });

  it('ters kayıt: ikiz fiş de ters çevrilir, bakiye sıfırlanır', async () => {
    await withRollback(async (tx) => {
      await seedBase(tx);
      const r = await postJournalEntry(tx, {
        ledger: 'both', journalCode: 'GEN', entryDate: new Date(), description: 'x',
        lines: [{ accountCode: '100', debit: d('250') }, { accountCode: '500', credit: d('250') }],
      }, ctx);
      const rev = await reverseJournalEntry(tx, r.vukId!, ctx);
      expect(rev.reversalIds).toHaveLength(2);
      const [orig] = await tx.select().from(journalEntries).where(eq(journalEntries.id, r.vukId!));
      expect(orig!.status).toBe('reversed');
      expect(orig!.reversedById).toBe(rev.vukId);
      const [twin] = await tx.select().from(journalEntries).where(eq(journalEntries.id, r.ufrsId!));
      expect(twin!.status).toBe('reversed');
      expect((await getAccountBalance(tx, { accountCode: '100', ledger: 'VUK' })).isZero()).toBe(true);
      expect((await getAccountBalance(tx, { accountCode: '100', ledger: 'UFRS' })).isZero()).toBe(true);
      const err = await expectReject(tx, (sp) => reverseJournalEntry(sp, r.vukId!, ctx));
      expect((err as DomainError).code).toBe('JOURNAL_NOT_POSTED');
    });
  });
  it('120/320 ana hesabına cari olmadan kayıt reddedilir', async () => {
    await withRollback(async (tx) => {
      await seedBase(tx);
      const err = await expectReject(tx, (sp) =>
        postJournalEntry(sp, {
          ledger: 'VUK', journalCode: 'GEN', entryDate: new Date(), description: 'carisiz alacak',
          lines: [{ accountCode: '120', debit: d('10') }, { accountCode: '600', credit: d('10') }],
        }, ctx),
      );
      expect((err as Error).message).toContain('partnerId zorunlu');
    });
  });

  it('yevmiye tarihi Europe/Istanbul iş günüdür (UTC 22:30 → ertesi gün)', async () => {
    await withRollback(async (tx) => {
      await seedBase(tx);
      // Açık bir döneme düşsün diye 2 ay ileri; UTC 22:30, İstanbul 01:30 ertesi gün
      const base = new Date();
      const dt = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 2, 10, 22, 30));
      await tx.insert(fiscalPeriods).values({
        code: `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-T`, year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1,
        startDate: `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-01`, endDate: `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-28`,
      }).onConflictDoNothing({ target: fiscalPeriods.code });
      const r = await postJournalEntry(tx, {
        ledger: 'VUK', journalCode: 'GEN', entryDate: dt, description: 'gece yarısı',
        lines: [{ accountCode: '100', debit: d('1') }, { accountCode: '500', credit: d('1') }],
      }, ctx);
      const [e] = await tx.select().from(journalEntries).where(eq(journalEntries.id, r.vukId!));
      expect(e!.entryDate).toBe(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-11`);
    });
  });
});
