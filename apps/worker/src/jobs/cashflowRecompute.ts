import { and, eq, isNotNull } from 'drizzle-orm';
import { bankAccounts, cashflowLines, db, fixedExpenses, forecasts, loanInstallments } from '@plantero/db';
import { D, type Decimal, sum, toDb } from '@plantero/core';
import { forecastCash, type SalesHistoryPoint } from '@plantero/ai';

/**
 * Nakit akışı yeniden hesaplama: gerçekleşen aylık net nakit akışını (`cashflow_lines.actual_net_cashflow`)
 * geçmiş olarak kullanır, güncel banka bakiyesi + aktif sabit giderler + planlı kredi taksitleriyle
 * birlikte AI'a (yoksa mevsimsel hareketli ortalama fallback'e) 3 aylık nakit tahmini çıkarttırır ve
 * sonucu `forecasts` (kind='cash') tablosuna yazar.
 */
export async function runCashflowRecompute(): Promise<Record<string, unknown>> {
  const actuals = await db
    .select({ period: cashflowLines.period, actualNetCashflow: cashflowLines.actualNetCashflow })
    .from(cashflowLines)
    .where(and(eq(cashflowLines.scenario, 'base'), isNotNull(cashflowLines.actualNetCashflow)))
    .orderBy(cashflowLines.period);

  const history: SalesHistoryPoint[] = actuals.map((a) => ({ period: a.period, amount: a.actualNetCashflow! }));

  if (history.length < 2) {
    return { skipped: true, reason: 'Yeterli gerçekleşen nakit akışı verisi yok (cashflow_lines.actual_net_cashflow)', historyPoints: history.length };
  }

  const accounts = await db.select({ balance: bankAccounts.statementBalance }).from(bankAccounts).where(eq(bankAccounts.isActive, true));
  const currentBalance = toDb(sum(accounts.map((a) => a.balance)));

  const activeExpenses = await db.select({ monthlyAmount: fixedExpenses.monthlyAmount }).from(fixedExpenses).where(eq(fixedExpenses.isActive, true));
  const fixedMonthlyExpenses = toDb(sum(activeExpenses.map((e) => e.monthlyAmount)));

  const installments = await db.select({ period: loanInstallments.period, installment: loanInstallments.installment }).from(loanInstallments).where(eq(loanInstallments.status, 'scheduled'));
  const loanByMonth = new Map<string, Decimal>();
  for (const i of installments) loanByMonth.set(i.period, (loanByMonth.get(i.period) ?? D(0)).plus(D(i.installment)));
  const loanInstallmentsByMonth = Array.from(loanByMonth.entries()).map(([period, amount]) => ({ period, amount: toDb(amount) }));

  const projection = await forecastCash({ currentBalance, history, fixedMonthlyExpenses, loanInstallmentsByMonth }, 3);

  let written = 0;
  for (const p of projection) {
    await db.insert(forecasts).values({ kind: 'cash', period: p.period, predicted: p.predicted, low: p.low, high: p.high, method: p.method, rationale: p.rationale });
    written++;
  }

  return { historyPoints: history.length, projected: written };
}
