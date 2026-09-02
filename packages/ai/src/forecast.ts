import { D, max as maxDecimal, sum, toDb, ZERO } from '@plantero/core';
import { getClient, structuredComplete } from './client.js';

/**
 * Satış ve nakit akışı tahmini. Fallback: mevsimsel düzeltmeli hareketli ortalama + trend
 * (zorunlu, testli).
 */

export type SalesHistoryPoint = { period: string; amount: string }; // period: 'YYYY-MM'

export type ForecastPoint = { period: string; predicted: string; low: string; high: string; method: string; rationale: string };

function addMonths(period: string, n: number): string {
  const [yStr, mStr] = period.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const total = (y * 12 + (m - 1)) + n;
  const newY = Math.floor(total / 12);
  const newM = (total % 12) + 1;
  return `${newY}-${String(newM).padStart(2, '0')}`;
}

/** Mevsimsel düzeltmeli hareketli ortalama + doğrusal trend (kural tabanlı fallback) */
export function fallbackForecastSales(history: SalesHistoryPoint[], periodsAhead = 3): ForecastPoint[] {
  if (history.length === 0) return [];

  const values = history.map((h) => D(h.amount));
  const n = values.length;
  const windowSize = Math.min(3, n);
  const window = values.slice(-windowSize);
  const movingAvg = sum(window).div(windowSize);

  const trend = n >= 2 ? values[n - 1]!.minus(values[Math.max(0, n - windowSize)]!).div(Math.max(1, windowSize - 1)) : ZERO;

  const seasonalIdx = n >= 12 ? n - 12 : -1;
  const seasonalFactor = seasonalIdx >= 0 && !values[seasonalIdx]!.isZero() ? values[n - 1]!.div(values[seasonalIdx]!) : null;

  const lastPeriod = history[n - 1]!.period;
  const results: ForecastPoint[] = [];
  let base = movingAvg;

  for (let i = 1; i <= periodsAhead; i++) {
    base = base.plus(trend);
    let predicted = base;
    if (seasonalFactor) predicted = predicted.plus(predicted.mul(seasonalFactor)).div(2); // yumuşatılmış mevsimsel düzeltme
    predicted = maxDecimal(predicted, ZERO);
    const band = predicted.mul(0.15);

    results.push({
      period: addMonths(lastPeriod, i),
      predicted: toDb(predicted),
      low: toDb(maxDecimal(predicted.minus(band), ZERO)),
      high: toDb(predicted.plus(band)),
      method: 'moving_average',
      rationale: `${windowSize} aylık hareketli ortalama (${toDb(movingAvg)}) + aylık trend (${toDb(trend)})${seasonalFactor ? ' + mevsimsel düzeltme (12 ay önceki döneme göre)' : ''}`,
    });
  }

  return results;
}

async function tryAiForecast(kind: 'sales' | 'cash', history: SalesHistoryPoint[], periodsAhead: number, fallback: ForecastPoint[]): Promise<ForecastPoint[] | null> {
  const result = await structuredComplete<{ points: ForecastPoint[] }>({
    system: `Sen Plantero ERP için ${kind === 'sales' ? 'satış' : 'nakit akışı'} tahmini yapan bir analistsin. Geçmiş aylık verilere göre mevsimsellik ve trendi dikkate alarak gelecek dönemleri tahmin et.`,
    prompt: JSON.stringify({ history, periodsAhead, ruleBasedFallback: fallback }),
    toolName: 'report_forecast',
    toolDescription: 'Gelecek dönemler için tahmin, alt/üst bant ve gerekçe döner',
    inputSchema: {
      type: 'object',
      properties: {
        points: {
          type: 'array',
          items: {
            type: 'object',
            properties: { period: { type: 'string' }, predicted: { type: 'string' }, low: { type: 'string' }, high: { type: 'string' }, rationale: { type: 'string' } },
            required: ['period', 'predicted', 'low', 'high', 'rationale'],
          },
        },
      },
      required: ['points'],
    },
  });
  if (!result?.points?.length) return null;
  return result.points.map((p) => ({ ...p, method: 'ai' }));
}

/** Ana giriş noktası: AI varsa dener (yeterli veri varsa), yoksa/başarısızsa fallback'e düşer */
export async function forecastSales(history: SalesHistoryPoint[], periodsAhead = 3): Promise<ForecastPoint[]> {
  const fallback = fallbackForecastSales(history, periodsAhead);
  if (!getClient() || history.length < 2) return fallback;
  const ai = await tryAiForecast('sales', history, periodsAhead, fallback);
  return ai ?? fallback;
}

/* ------------------------------------------------------------------ */
/* Nakit akışı tahmini                                                 */
/* ------------------------------------------------------------------ */

export type CashflowForecastInput = {
  currentBalance: string;
  history: SalesHistoryPoint[]; // aylık net nakit akışı (gerçekleşen)
  fixedMonthlyExpenses: string;
  loanInstallmentsByMonth: { period: string; amount: string }[];
};

/** Satış/nakit tahmininin devamı: bakiye + tahsilat tahmini − sabit gider − kredi taksiti */
export function fallbackForecastCash(input: CashflowForecastInput, periodsAhead = 3): ForecastPoint[] {
  const salesForecast = fallbackForecastSales(input.history, periodsAhead);
  let balance = D(input.currentBalance);
  const results: ForecastPoint[] = [];

  for (const f of salesForecast) {
    const loanForPeriod = input.loanInstallmentsByMonth.find((l) => l.period === f.period);
    const inflow = D(f.predicted);
    const outflow = D(input.fixedMonthlyExpenses).plus(D(loanForPeriod?.amount ?? '0'));
    balance = balance.plus(inflow).minus(outflow);
    const band = balance.abs().mul(0.1).plus(inflow.mul(0.1));

    results.push({
      period: f.period,
      predicted: toDb(balance),
      low: toDb(balance.minus(band)),
      high: toDb(balance.plus(band)),
      method: 'moving_average',
      rationale: `Önceki bakiye + tahmini tahsilat (${f.predicted}) − sabit gider (${input.fixedMonthlyExpenses}) − kredi taksiti (${loanForPeriod?.amount ?? '0'})`,
    });
  }

  return results;
}

async function tryAiCashForecast(input: CashflowForecastInput, periodsAhead: number, fallback: ForecastPoint[]): Promise<ForecastPoint[] | null> {
  const result = await structuredComplete<{ points: ForecastPoint[] }>({
    system: 'Sen Plantero ERP için nakit akışı tahmini yapan bir finans analistisin. Bakiye, tahsilat trendi, sabit giderler ve kredi taksitlerini dikkate al.',
    prompt: JSON.stringify({ ...input, periodsAhead, ruleBasedFallback: fallback }),
    toolName: 'report_cash_forecast',
    toolDescription: 'Gelecek dönemler için nakit bakiye tahmini, alt/üst bant ve gerekçe döner',
    inputSchema: {
      type: 'object',
      properties: {
        points: {
          type: 'array',
          items: {
            type: 'object',
            properties: { period: { type: 'string' }, predicted: { type: 'string' }, low: { type: 'string' }, high: { type: 'string' }, rationale: { type: 'string' } },
            required: ['period', 'predicted', 'low', 'high', 'rationale'],
          },
        },
      },
      required: ['points'],
    },
  });
  if (!result?.points?.length) return null;
  return result.points.map((p) => ({ ...p, method: 'ai' }));
}

export async function forecastCash(input: CashflowForecastInput, periodsAhead = 3): Promise<ForecastPoint[]> {
  const fallback = fallbackForecastCash(input, periodsAhead);
  if (!getClient() || input.history.length < 2) return fallback;
  const ai = await tryAiCashForecast(input, periodsAhead, fallback);
  return ai ?? fallback;
}
