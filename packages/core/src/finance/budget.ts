import { and, eq, gte, lte, inArray, or, sql } from 'drizzle-orm';
import { budgets, budgetLines, journalLines, journalEntries, cashflowLines, type DbOrTx } from '@plantero/db';
import { D, ZERO, toDb, type Decimal } from '../money.js';
import { getAccountBalance } from '../accounting/journal.js';
import { daysInMonth } from './cashflow.js';
import type { ActorCtx } from '../types.js';

/**
 * Bütçe vs gerçekleşen (`/finans/butce`). `refreshActuals` muhasebeden (yevmiye satırlarından)
 * gerçekleşen tutarları okuyup hem `budget_lines.actual/variance` hem de `cashflow_lines.actual*`
 * kolonlarını günceller — ikisi de AYNI kaynaktan (posted/reversed yevmiye satırları) beslenir, bu
 * yüzden tek fonksiyonda birleştirilmiştir (docs/modules/finans.md §core: "refreshActuals").
 */

function monthRange(period: string): { from: string; to: string } {
  const total = daysInMonth(period);
  return { from: `${period}-01`, to: `${period}-${String(total).padStart(2, '0')}` };
}

/** Bir kanalın 600/601 hesaplarındaki net cirosu (kredi−borç = pozitif ciro), belirli tarih aralığında */
async function channelRevenueActual(tx: DbOrTx, channelId: string, from: string, to: string): Promise<Decimal> {
  const [row] = await tx
    .select({ debit: sql<string>`coalesce(sum(${journalLines.debit}), 0)`, credit: sql<string>`coalesce(sum(${journalLines.credit}), 0)` })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(
      and(
        eq(journalLines.channelId, channelId),
        eq(journalLines.ledger, 'VUK'),
        inArray(journalEntries.status, ['posted', 'reversed']),
        gte(journalEntries.entryDate, from),
        lte(journalEntries.entryDate, to),
        or(eq(journalLines.accountCode, '600'), eq(journalLines.accountCode, '601')),
      ),
    );
  return D(row?.credit).minus(D(row?.debit));
}

export type RefreshActualsResult = { budgetLinesUpdated: number; cashflowLinesUpdated: number; periods: string[] };

export type RefreshActualsInput = { year?: number; budgetId?: string };

/**
 * `budget_lines.actual/variance` ve o yılın 12 ayı için `cashflow_lines.actual*` kolonlarını
 * muhasebeden (posted/reversed yevmiye satırları) yeniden hesaplar. `ctx` şu an yalnızca imza
 * uyumu için tutulur (audit web katmanında `withAudit` ile yazılır — CLAUDE.md kural 6).
 */
export async function refreshActuals(tx: DbOrTx, ctx: ActorCtx, input: RefreshActualsInput = {}): Promise<RefreshActualsResult> {
  void ctx;
  const year = input.year ?? new Date().getUTCFullYear();
  const budgetRows = input.budgetId
    ? await tx.select().from(budgets).where(eq(budgets.id, input.budgetId))
    : await tx.select().from(budgets).where(eq(budgets.year, year));
  if (!budgetRows.length) return { budgetLinesUpdated: 0, cashflowLinesUpdated: 0, periods: [] };

  const lines = await tx.select().from(budgetLines).where(
    inArray(budgetLines.budgetId, budgetRows.map((b) => b.id)),
  );

  let budgetLinesUpdated = 0;
  const periodsTouched = new Set<string>();
  for (const line of lines) {
    const { from, to } = monthRange(line.period);
    periodsTouched.add(line.period);
    let actual: Decimal = ZERO;
    if (line.kind === 'revenue' && line.channelId) {
      // Kanal bazlı ciro: 600/601 hesaplarının o kanala ait payı (kredi−borç = pozitif ciro)
      actual = await channelRevenueActual(tx, line.channelId, from, to);
    } else if (line.accountCode) {
      // fixed_expense/cogs/finance/capex: hesap bazlı — gider hesapları borç-normal, bakiye doğrudan
      // gider tutarını (pozitif) verir; `planned` de aynı işaretle (pozitif TL) tutulur.
      actual = await getAccountBalance(tx, { accountCode: line.accountCode, ledger: 'VUK', from, asOf: to });
    }
    const planned = D(line.planned);
    await tx.update(budgetLines).set({ actual: toDb(actual), variance: toDb(actual.minus(planned)) }).where(eq(budgetLines.id, line.id));
    budgetLinesUpdated++;
  }

  let cashflowLinesUpdated = 0;
  for (const period of periodsTouched) {
    const { from, to } = monthRange(period);
    const [bal600, bal601, bal610, bal120, bal770, bal100, bal102] = await Promise.all([
      getAccountBalance(tx, { accountCode: '600', ledger: 'VUK', from, asOf: to }),
      getAccountBalance(tx, { accountCode: '601', ledger: 'VUK', from, asOf: to }),
      getAccountBalance(tx, { accountCode: '610', ledger: 'VUK', from, asOf: to }),
      getAccountBalance(tx, { accountCode: '120', ledger: 'VUK', from, asOf: to }),
      getAccountBalance(tx, { accountCode: '770', ledger: 'VUK', from, asOf: to }),
      getAccountBalance(tx, { accountCode: '100', ledger: 'VUK', from, asOf: to }),
      getAccountBalance(tx, { accountCode: '102', ledger: 'VUK', from, asOf: to }),
    ]);
    const actualRevenue = bal600.plus(bal601).plus(bal610).neg();
    // Tahsilat: 120 (Alıcılar) hesabındaki net ALACAK hareketi — tahsilat 120'yi kredi ile azaltır.
    const actualCollections = bal120.neg();
    const actualFixedExpenses = bal770; // 770 gider hesabı borç-normal; prefix eşleşmesiyle tüm 770.xx alt kalemleri kapsar
    // Net nakit akışı: dönem içinde kasa+banka hesaplarındaki TOPLAM net hareket (her nakit etkileyen
    // işlem er ya da geç 100/102'ye düşer — çift kayıt sayesinde bu, gerçekleşen net nakit akışının
    // muhasebeden türetilebilecek en doğru/eksiksiz karşılığıdır).
    const actualNetCashflow = bal100.plus(bal102);

    await tx
      .insert(cashflowLines)
      .values({
        period,
        scenario: 'base',
        actualRevenue: toDb(actualRevenue),
        actualCollections: toDb(actualCollections),
        actualFixedExpenses: toDb(actualFixedExpenses),
        actualNetCashflow: toDb(actualNetCashflow),
      })
      .onConflictDoUpdate({
        target: [cashflowLines.scenario, cashflowLines.period],
        set: {
          actualRevenue: toDb(actualRevenue),
          actualCollections: toDb(actualCollections),
          actualFixedExpenses: toDb(actualFixedExpenses),
          actualNetCashflow: toDb(actualNetCashflow),
        },
      });
    cashflowLinesUpdated++;
  }

  return { budgetLinesUpdated, cashflowLinesUpdated, periods: [...periodsTouched].sort() };
}
