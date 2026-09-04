'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db, bankAccounts, fixedExpenses, loanInstallments } from '@plantero/db';
import { D, sum, toDb, loadSalesHistory, loadCashHistory, listForecastChannels, saveForecasts, applyForecastToCashflow, type SaveForecastInput, type Scenario } from '@plantero/core';
import { forecastSales, forecastCash, type CashflowForecastInput } from '@plantero/ai';
import { requirePermission } from '@/lib/auth';
import { withAudit } from '@/lib/actions';

function revalidateForecast() {
  revalidatePath('/finans/tahmin');
  revalidatePath('/finans/nakit-akisi');
}

const genSchema = z.object({ periodsAhead: z.number().int().min(1).max(12).default(6) });

/** Toplam + kanal bazlı satış tahmini üretir (AI, yoksa mevsimsel hareketli ortalama fallback) — "Yeniden üret" */
export const generateSalesForecastAction = withAudit('finance.generateSalesForecast', async (raw: z.infer<typeof genSchema> | undefined) => {
  const user = await requirePermission('finance.manage');
  const input = genSchema.parse(raw ?? {});

  const [overallHistory, channels] = await Promise.all([loadSalesHistory(db, { months: 12 }), listForecastChannels(db)]);
  const overallPoints = await forecastSales(overallHistory, input.periodsAhead);
  const toSave: SaveForecastInput[] = overallPoints.map((p) => ({ kind: 'sales', period: p.period, predicted: p.predicted, low: p.low, high: p.high, method: p.method, rationale: p.rationale }));

  for (const c of channels) {
    const hist = await loadSalesHistory(db, { months: 12, channelId: c.id });
    // Genç şirket (üretime başlama 20.07.2026): bazı kanallarda tek bir tamamlanmış ay bile olabilir.
    // `forecastSales`/fallback tek noktalı geçmişte de çalışır (düz projeksiyon) — eşik burada 0
    // veri yerine yalnızca HİÇ veri yoksa atlar; "en az 2 ay" şartı bu erken aşamada kanal tahminini
    // ekranda hiçbir zaman üretilemez hale getiriyordu (Tur 1 kendi bulgusu).
    if (hist.length < 1) continue;
    const points = await forecastSales(hist, input.periodsAhead);
    toSave.push(...points.map((p) => ({ kind: 'channel_sales' as const, period: p.period, channelId: c.id, predicted: p.predicted, low: p.low, high: p.high, method: p.method, rationale: p.rationale })));
  }

  const written = await db.transaction((tx) => saveForecasts(tx, toSave, user.actor));
  revalidateForecast();
  return { data: { written }, audit: { action: 'other' as const, tableName: 'forecasts', summary: `${written} satış tahmini noktası üretildi (toplam + ${channels.length} kanal)` } };
});

const cashGenSchema = z.object({ periodsAhead: z.number().int().min(1).max(12).default(3) });

/** Nakit bakiyesi tahmini üretir — bkz. `apps/worker/src/jobs/cashflowRecompute.ts` (aynı girdi biçimi, ekrandan elle tetiklenir) */
export const generateCashForecastAction = withAudit('finance.generateCashForecast', async (raw: z.infer<typeof cashGenSchema> | undefined) => {
  const user = await requirePermission('finance.manage');
  const input = cashGenSchema.parse(raw ?? {});

  const history = await loadCashHistory(db);
  if (history.length < 2) throw new Error('Nakit tahmini için en az 2 aylık gerçekleşen nakit akışı verisi gerekir — önce Bütçe ekranından "Gerçekleşenleri yenile"yi çalıştırın.');

  const accounts = await db.select({ balance: bankAccounts.statementBalance }).from(bankAccounts).where(eq(bankAccounts.isActive, true));
  const currentBalance = toDb(sum(accounts.map((a) => a.balance)));

  const activeExpenses = await db.select({ monthlyAmount: fixedExpenses.monthlyAmount }).from(fixedExpenses).where(eq(fixedExpenses.isActive, true));
  const fixedMonthlyExpenses = toDb(sum(activeExpenses.map((e) => e.monthlyAmount)));

  const installments = await db.select({ period: loanInstallments.period, installment: loanInstallments.installment }).from(loanInstallments).where(and(eq(loanInstallments.status, 'scheduled')));
  const byMonth = new Map<string, ReturnType<typeof D>>();
  for (const i of installments) byMonth.set(i.period, (byMonth.get(i.period) ?? D(0)).plus(D(i.installment)));
  const loanInstallmentsByMonth = [...byMonth.entries()].map(([period, amount]) => ({ period, amount: toDb(amount) }));

  const cashInput: CashflowForecastInput = { currentBalance, history, fixedMonthlyExpenses, loanInstallmentsByMonth };
  const points = await forecastCash(cashInput, input.periodsAhead);
  const toSave: SaveForecastInput[] = points.map((p) => ({ kind: 'cash', period: p.period, predicted: p.predicted, low: p.low, high: p.high, method: p.method, rationale: p.rationale }));

  const written = await db.transaction((tx) => saveForecasts(tx, toSave, user.actor));
  revalidateForecast();
  return { data: { written }, audit: { action: 'other' as const, tableName: 'forecasts', summary: `${written} nakit tahmini noktası üretildi` } };
});

const applySchema = z.object({ forecastId: z.string().uuid(), scenario: z.enum(['base', 'optimistic', 'pessimistic']) });

/** Bir kanal satış tahminini nakit akışı senaryosuna "uygula" (mavi hücre override'ı olarak yazar) */
export const applyForecastAction = withAudit('finance.applyForecast', async (raw: z.infer<typeof applySchema>) => {
  const user = await requirePermission('finance.manage');
  const input = applySchema.parse(raw);
  await db.transaction((tx) => applyForecastToCashflow(tx, input.forecastId, input.scenario as Scenario, user.actor));
  revalidateForecast();
  return { data: undefined, audit: { action: 'update' as const, tableName: 'cashflow_lines', summary: `Tahmin ${input.scenario} senaryosuna uygulandı` } };
});
