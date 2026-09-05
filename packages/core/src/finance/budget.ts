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

/** `refreshActualsForTouchedLines` girdisi — bir yevmiye fişinin postladığı tek bir satır özeti */
export type TouchedJournalLine = { accountCode: string; channelId?: string | null };

/**
 * `getAccountBalance`'ın hesap-kodu eşleşme kuralıyla (`accountCodeCond`, accounting/journal.ts)
 * BİREBİR aynı yön: `targetCode`'un bakiyesi `touchedCode`'un hareketlerinden etkilenir ⟺
 * `touchedCode === targetCode` ya da `touchedCode` `targetCode`'un bir alt hesabıdır (`targetCode.`
 * ile başlar). Aksi yön (targetCode, touchedCode'un alt hesabı) burada aranmaz — `getAccountBalance`
 * de aramaz.
 */
function matchesAccount(touchedCode: string, targetCode: string): boolean {
  return touchedCode === targetCode || touchedCode.startsWith(`${targetCode}.`);
}

/** `cashflow_lines.actual*` kolonlarının beslendiği hesap kökleri (bkz. aşağıdaki `computeCashflowActuals`) */
const CASHFLOW_ACCOUNT_ROOTS = ['600', '601', '610', '120', '770', '100', '102'] as const;

/** Bir periyot için `cashflow_lines.actual*` değerlerini muhasebeden hesaplar (yazmaz) */
async function computeCashflowActuals(tx: DbOrTx, period: string): Promise<{
  actualRevenue: Decimal; actualCollections: Decimal; actualFixedExpenses: Decimal; actualNetCashflow: Decimal;
}> {
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
  return {
    actualRevenue: bal600.plus(bal601).plus(bal610).neg(),
    // Tahsilat: 120 (Alıcılar) hesabındaki net ALACAK hareketi — tahsilat 120'yi kredi ile azaltır.
    actualCollections: bal120.neg(),
    // 770 gider hesabı borç-normal; prefix eşleşmesiyle tüm 770.xx alt kalemleri kapsar
    actualFixedExpenses: bal770,
    // Net nakit akışı: dönem içinde kasa+banka hesaplarındaki TOPLAM net hareket (her nakit etkileyen
    // işlem er ya da geç 100/102'ye düşer — çift kayıt sayesinde bu, gerçekleşen net nakit akışının
    // muhasebeden türetilebilecek en doğru/eksiksiz karşılığıdır).
    actualNetCashflow: bal100.plus(bal102),
  };
}

/** Hesaplanan `cashflow_lines.actual*` değerlerini `(scenario='base', period)` satırına yazar (upsert) */
async function upsertCashflowActuals(tx: DbOrTx, period: string, actuals: Awaited<ReturnType<typeof computeCashflowActuals>>): Promise<void> {
  const values = {
    actualRevenue: toDb(actuals.actualRevenue),
    actualCollections: toDb(actuals.actualCollections),
    actualFixedExpenses: toDb(actuals.actualFixedExpenses),
    actualNetCashflow: toDb(actuals.actualNetCashflow),
  };
  await tx
    .insert(cashflowLines)
    .values({ period, scenario: 'base', ...values })
    .onConflictDoUpdate({ target: [cashflowLines.scenario, cashflowLines.period], set: values });
}

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
    await upsertCashflowActuals(tx, period, await computeCashflowActuals(tx, period));
    cashflowLinesUpdated++;
  }

  return { budgetLinesUpdated, cashflowLinesUpdated, periods: [...periodsTouched].sort() };
}

/**
 * P1 kök neden düzeltmesi (kritik bulgu, Tur 6): `budget_lines.actual/variance` ve
 * `cashflow_lines.actual*` yalnızca elle/nightly `refreshActuals()` çağrılırsa güncelleniyordu;
 * `postJournalEntry` (TEK muhasebe yazma noktası) hiçbir çağrısında bunu tetiklemiyordu — bir
 * kullanıcı yeni fatura/tahsilat/gider fişi postaladığında `/finans/butce` ve nakit tahmini
 * kullanıcı elle "Yenile"ye basana kadar sessizce bayat kalıyordu (nightly `cashflowRecompute`
 * de yalnızca OKUR, hiç tetiklemez).
 *
 * Bu fonksiyon `postJournalEntry` içinden, AYNI transaction'da, o fişin VUK ledger'a postladığı
 * satırlar postlandıktan HEMEN SONRA çağrılır. Tam `refreshActuals()`'ın aksine tüm tabloyu
 * taramaz: yalnızca bu fişin dokunduğu (period, accountCode/channelId) kombinasyonuyla eşleşen
 * `budget_lines` satırlarını ve (dokunulan hesap kökü nakit akışıyla ilgiliyse) o periyodun
 * `cashflow_lines` satırını hedefler — böylece her postajda tüm bütçe/nakit tablosunu yeniden
 * hesaplamanın maliyetine girmeden önbellek her zaman güncel kalır.
 */
export async function refreshActualsForTouchedLines(
  tx: DbOrTx,
  ctx: ActorCtx,
  period: string,
  touched: TouchedJournalLine[],
): Promise<RefreshActualsResult> {
  void ctx;
  if (!touched.length) return { budgetLinesUpdated: 0, cashflowLinesUpdated: 0, periods: [] };
  const { from, to } = monthRange(period);
  const touchedAccountCodes = [...new Set(touched.map((t) => t.accountCode))];
  const touchedChannelIds = new Set(touched.map((t) => t.channelId).filter((c): c is string => !!c));

  let budgetLinesUpdated = 0;
  const candidateLines = await tx.select().from(budgetLines).where(eq(budgetLines.period, period));
  for (const line of candidateLines) {
    const affected =
      (line.kind === 'revenue' && !!line.channelId && touchedChannelIds.has(line.channelId)) ||
      (!!line.accountCode && touchedAccountCodes.some((code) => matchesAccount(code, line.accountCode!)));
    if (!affected) continue;

    let actual: Decimal = ZERO;
    if (line.kind === 'revenue' && line.channelId) {
      actual = await channelRevenueActual(tx, line.channelId, from, to);
    } else if (line.accountCode) {
      actual = await getAccountBalance(tx, { accountCode: line.accountCode, ledger: 'VUK', from, asOf: to });
    }
    const planned = D(line.planned);
    await tx.update(budgetLines).set({ actual: toDb(actual), variance: toDb(actual.minus(planned)) }).where(eq(budgetLines.id, line.id));
    budgetLinesUpdated++;
  }

  let cashflowLinesUpdated = 0;
  const cashflowAffected = touchedAccountCodes.some((code) => CASHFLOW_ACCOUNT_ROOTS.some((root) => matchesAccount(code, root)));
  if (cashflowAffected) {
    await upsertCashflowActuals(tx, period, await computeCashflowActuals(tx, period));
    cashflowLinesUpdated = 1;
  }

  return { budgetLinesUpdated, cashflowLinesUpdated, periods: [period] };
}
