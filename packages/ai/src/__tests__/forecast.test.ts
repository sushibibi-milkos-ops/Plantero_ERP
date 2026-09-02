import { describe, expect, it } from 'vitest';
import { fallbackForecastCash, fallbackForecastSales, forecastCash, forecastSales } from '../forecast.js';

describe('fallbackForecastSales', () => {
  it('boş geçmiş için boş dizi döner', () => {
    expect(fallbackForecastSales([])).toEqual([]);
  });

  it('artan trendi yansıtan pozitif tahmin üretir', () => {
    const history = [
      { period: '2026-05', amount: '100000' },
      { period: '2026-06', amount: '110000' },
      { period: '2026-07', amount: '120000' },
      { period: '2026-08', amount: '130000' },
    ];
    const forecast = fallbackForecastSales(history, 3);
    expect(forecast).toHaveLength(3);
    expect(forecast[0]!.period).toBe('2026-09');
    expect(forecast[1]!.period).toBe('2026-10');
    expect(forecast[2]!.period).toBe('2026-11');
    expect(Number(forecast[0]!.predicted)).toBeGreaterThan(120000); // trend yukarı
    expect(Number(forecast[0]!.low)).toBeLessThan(Number(forecast[0]!.predicted));
    expect(Number(forecast[0]!.high)).toBeGreaterThan(Number(forecast[0]!.predicted));
  });

  it('yıl sınırını doğru aşar (Aralık → Ocak)', () => {
    const history = [
      { period: '2025-11', amount: '50000' },
      { period: '2025-12', amount: '55000' },
    ];
    const forecast = fallbackForecastSales(history, 2);
    expect(forecast[0]!.period).toBe('2026-01');
    expect(forecast[1]!.period).toBe('2026-02');
  });

  it('negatife düşmez (alt sınır 0)', () => {
    const history = [
      { period: '2026-01', amount: '1000' },
      { period: '2026-02', amount: '10' },
    ];
    const forecast = fallbackForecastSales(history, 1);
    expect(Number(forecast[0]!.low)).toBeGreaterThanOrEqual(0);
  });
});

describe('fallbackForecastCash', () => {
  it('bakiyeyi tahsilat - sabit gider - kredi taksiti ile ilerletir', () => {
    const result = fallbackForecastCash(
      {
        currentBalance: '500000',
        history: [
          { period: '2026-06', amount: '20000' },
          { period: '2026-07', amount: '20000' },
          { period: '2026-08', amount: '20000' },
        ],
        fixedMonthlyExpenses: '15000',
        loanInstallmentsByMonth: [{ period: '2026-09', amount: '5000' }],
      },
      1,
    );
    expect(result).toHaveLength(1);
    // 500000 + ~20000 (tahsilat) - 15000 (sabit gider) - 5000 (kredi) ≈ 500000
    expect(Number(result[0]!.predicted)).toBeGreaterThan(495000);
    expect(Number(result[0]!.predicted)).toBeLessThan(505000);
  });
});

describe('forecastSales / forecastCash (ANTHROPIC_API_KEY yokken fallback)', () => {
  it('forecastSales API anahtarı yoksa fallback döner', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const history = [
      { period: '2026-06', amount: '100000' },
      { period: '2026-07', amount: '105000' },
    ];
    expect(await forecastSales(history, 2)).toEqual(fallbackForecastSales(history, 2));
  });

  it('forecastCash API anahtarı yoksa fallback döner', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const input = {
      currentBalance: '100000',
      history: [
        { period: '2026-06', amount: '10000' },
        { period: '2026-07', amount: '11000' },
      ],
      fixedMonthlyExpenses: '5000',
      loanInstallmentsByMonth: [],
    };
    expect(await forecastCash(input, 2)).toEqual(fallbackForecastCash(input, 2));
  });
});
