import { describe, it, expect } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { journals, budgets, budgetLines, salesChannels, fixedExpenses as fixedExpensesTable, cashflowLines, accounts, type Tx } from '@plantero/db';
import { withRollback, seedBase, ctx, suffix, type Base } from '../__tests__/helpers.js';
import { postJournalEntry } from '../accounting/journal.js';
import { D, round4 } from '../money.js';
import { refreshActuals } from './budget.js';

async function ensureSalesJournal(tx: Tx) {
  await tx.insert(journals).values({ code: 'SAT', name: 'Satış Yevmiyesi', kind: 'sales', defaultAccountCode: '600' }).onConflictDoNothing({ target: journals.code });
  await tx.insert(journals).values({ code: 'GID', name: 'Gider Yevmiyesi', kind: 'general', defaultAccountCode: '770' }).onConflictDoNothing({ target: journals.code });
}

describe('finance/budget — refreshActuals', () => {
  it('gerçekleşen ciroyu (kanal bazlı 600) ve sabit gideri (770.xx) muhasebeden okuyup budget_lines + cashflow_lines alanlarına yazar', async () => {
    await withRollback(async (tx) => {
      const b: Base = await seedBase(tx);
      await ensureSalesJournal(tx);
      const s = suffix();

      const [channel] = await tx.insert(salesChannels).values({ code: `CH-${s}`, name: `Kanal ${s}`, kind: 'wholesale' }).returning();
      const feAccountCode = `770.${s.slice(0, 2)}`;
      await tx.insert(accounts).values({ code: feAccountCode, name: `Test gider ${s}`, type: 'expense', parentCode: '770', level: 2 }).onConflictDoNothing({ target: accounts.code });
      const [fe] = await tx.insert(fixedExpensesTable).values({ code: `FE-${s}`, name: `Gider ${s}`, category: 'other', monthlyAmount: '1000.0000', accountCode: feAccountCode }).returning();

      const now = new Date();
      const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const entryDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15));

      // Bu ay 50.000 TL ciro (600 alacak, kanal etiketli) — cari borç tarafı basitlik için 120 genel.
      await postJournalEntry(tx, {
        ledger: 'VUK', journalCode: 'SAT', entryDate, description: 'Test satış',
        partnerId: b.customer.id,
        lines: [
          { accountCode: '120', debit: D('50000'), partnerId: b.customer.id },
          { accountCode: '600', credit: D('50000'), channelId: channel!.id },
        ],
      }, ctx);

      // 800 TL sabit gider (770.xx borç / 320 alacak)
      await postJournalEntry(tx, {
        ledger: 'VUK', journalCode: 'GID', entryDate, description: 'Test sabit gider',
        partnerId: b.supplier.id,
        lines: [
          { accountCode: fe!.accountCode!, debit: D('800') },
          { accountCode: '320', credit: D('800'), partnerId: b.supplier.id },
        ],
      }, ctx);

      const [budget] = await tx.insert(budgets).values({ year: now.getUTCFullYear(), name: `Test Bütçe ${s}` }).returning();
      const [revLine] = await tx.insert(budgetLines).values({ budgetId: budget!.id, period, kind: 'revenue', channelId: channel!.id, label: 'Ciro', planned: '40000.0000' }).returning();
      const [expLine] = await tx.insert(budgetLines).values({ budgetId: budget!.id, period, kind: 'fixed_expense', accountCode: fe!.accountCode, label: 'Gider', planned: '1000.0000' }).returning();

      const result = await refreshActuals(tx, ctx, { budgetId: budget!.id });
      expect(result.budgetLinesUpdated).toBe(2);
      expect(result.periods).toContain(period);

      const [revAfter] = await tx.select().from(budgetLines).where(eq(budgetLines.id, revLine!.id));
      expect(round4(D(revAfter!.actual)).toFixed(4)).toBe('50000.0000');
      expect(round4(D(revAfter!.variance)).toFixed(4)).toBe('10000.0000'); // 50.000 gerçekleşen − 40.000 plan

      const [expAfter] = await tx.select().from(budgetLines).where(eq(budgetLines.id, expLine!.id));
      expect(round4(D(expAfter!.actual)).toFixed(4)).toBe('800.0000');
      expect(round4(D(expAfter!.variance)).toFixed(4)).toBe('-200.0000'); // 800 gerçekleşen − 1000 plan

      // cashflow_lines.actual* HESAP DÜZEYİNDE toplanır (600/770 — tüm kanallar/kalemler), bu yüzden
      // aynı ayda önceden var olan (seed'den gelen) diğer kayıtları da içerebilir — bu test veritabanı
      // izole değil (withRollback yalnızca KENDİ yazdıklarını geri alır). Tam eşitlik yerine, bu testin
      // eklediği tutarların bakiyeye YANSIDIĞI (en az o kadar olduğu) doğrulanır.
      // scenario='base' FİLTRESİ ZORUNLU (Tur 1 kendi bulgusu — gerçek flaky hata): `cashflow_lines`in
      // benzersiz anahtarı (scenario,period) — AYNI period için optimistic/pessimistic satırları da
      // vardır (seed/finance-projections.ts 3 senaryo için de satır üretir). Filtresiz sorgu ORDER BY
      // olmadığından rastgele bir senaryo satırı dönebilir; `refreshActuals` yalnızca 'base'e yazar,
      // diğer ikisinde `actualRevenue` hep NULL'dur — bu testin `full pnpm test` koşusunda (paralel,
      // seed verisiyle birlikte) ARA SIRA "false" ile patlamasının kök nedeni buydu.
      const [cfLine] = await tx.select().from(cashflowLines).where(and(eq(cashflowLines.period, period), eq(cashflowLines.scenario, 'base')));
      expect(cfLine).toBeTruthy();
      expect(D(cfLine!.actualRevenue!).gte('50000')).toBe(true);
      expect(D(cfLine!.actualFixedExpenses!).gte('800')).toBe(true);
    });
  });

  it('bütçesi olmayan bir yıl için no-op döner (0 güncelleme)', async () => {
    await withRollback(async (tx) => {
      await seedBase(tx);
      const result = await refreshActuals(tx, ctx, { year: 1999 });
      expect(result).toEqual({ budgetLinesUpdated: 0, cashflowLinesUpdated: 0, periods: [] });
    });
  });

  it('P1 regresyon (Tur 6): postJournalEntry TEK BAŞINA (refreshActuals hiç elle çağrılmadan) budget_lines.actual/variance ve cashflow_lines.actual_fixed_expenses/actual_net_cashflow kolonlarını güncel tutar', async () => {
    await withRollback(async (tx) => {
      const b: Base = await seedBase(tx);
      await ensureSalesJournal(tx);
      const s = suffix();

      const now = new Date();
      const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const entryDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 20));

      const feAccountCode = `770.${s.slice(0, 2)}`;
      await tx.insert(accounts).values({ code: feAccountCode, name: `Test gider ${s}`, type: 'expense', parentCode: '770', level: 2 }).onConflictDoNothing({ target: accounts.code });

      // Bütçe satırı ÖNCEDEN var (postJournalEntry'den ÖNCE) — canlı bulguyla birebir senaryo:
      // fresh bütçe + 5.000 TL'lik yeni bir gider fişi.
      const [budget] = await tx.insert(budgets).values({ year: now.getUTCFullYear(), name: `Test Bütçe ${s}` }).returning();
      const [expLine] = await tx
        .insert(budgetLines)
        .values({ budgetId: budget!.id, period, kind: 'fixed_expense', accountCode: feAccountCode, label: 'Gider', planned: '1000.0000' })
        .returning();

      const [cfBefore] = await tx.select().from(cashflowLines).where(and(eq(cashflowLines.period, period), eq(cashflowLines.scenario, 'base')));
      const netBefore = cfBefore?.actualNetCashflow ? D(cfBefore.actualNetCashflow) : null;

      // Kritik bulgudaki gibi doğrudan postJournalEntry — refreshActuals'a HİÇ dokunulmuyor.
      await postJournalEntry(tx, {
        ledger: 'both', journalCode: 'GID', entryDate, description: 'Test gider (P1 regresyon)', origin: 'manual',
        partnerId: b.supplier.id,
        lines: [
          { accountCode: feAccountCode, debit: D('5000') },
          { accountCode: '100', credit: D('5000') },
        ],
      }, ctx);

      const [expAfter] = await tx.select().from(budgetLines).where(eq(budgetLines.id, expLine!.id));
      expect(round4(D(expAfter!.actual)).toFixed(4)).toBe('5000.0000');
      expect(round4(D(expAfter!.variance)).toFixed(4)).toBe('4000.0000'); // 5.000 gerçekleşen − 1.000 plan

      const [cfAfter] = await tx.select().from(cashflowLines).where(and(eq(cashflowLines.period, period), eq(cashflowLines.scenario, 'base')));
      expect(cfAfter).toBeTruthy();
      expect(D(cfAfter!.actualFixedExpenses!).gte('5000')).toBe(true);
      // 100 (kasa) hesabı postJournalEntry ile alacaklandırıldı (−5.000); önceki değere göre net nakit
      // akışı en az 5.000 TL azalmış olmalı — nightly job'u BEKLEMEDEN, aynı transaction içinde.
      if (netBefore) expect(D(cfAfter!.actualNetCashflow!).lte(netBefore.minus('4999'))).toBe(true);
    });
  });
});
