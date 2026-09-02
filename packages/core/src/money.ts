import Decimal from 'decimal.js';

/**
 * Para ve miktar yardımcıları.
 * Kural: float yasak — DB'den gelen numeric string `D(...)` ile Decimal'e çevrilir,
 * DB'ye yazarken `toDb(...)` ile 4 haneli string üretilir (numeric(18,4)).
 */
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type Money = Decimal;

/** Her türlü girdiyi Decimal'e çevirir; null/undefined → 0 */
export const D = (v: string | number | Decimal | null | undefined): Decimal => new Decimal(v ?? 0);

/** numeric(18,4) kolonlar için: her zaman 4 haneli string */
export const toDb = (d: Decimal | string | number): string => D(d).toFixed(4);

/** numeric(12,6) kur kolonları için */
export const toDbRate = (d: Decimal | string | number): string => D(d).toFixed(6);

export const round2 = (d: Decimal): Decimal => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
export const round4 = (d: Decimal): Decimal => d.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);

export const sum = (xs: Iterable<Decimal | string | number | null | undefined>): Decimal => {
  let acc = ZERO;
  for (const x of xs) acc = acc.plus(D(x));
  return acc;
};

/** base'in %p'si */
export const pct = (base: Decimal, p: Decimal | string | number): Decimal => base.mul(D(p)).div(100);

/** KDV dahil tutardan net tutar: gross / (1 + rate/100) */
export const netFromGross = (gross: Decimal, ratePct: Decimal | string | number): Decimal =>
  gross.div(ONE.plus(D(ratePct).div(100)));

export const isZero = (d: Decimal): boolean => d.isZero();
export const eq = (a: Decimal, b: Decimal): boolean => a.eq(b);
export const max = (a: Decimal, b: Decimal): Decimal => (a.gt(b) ? a : b);
export const min = (a: Decimal, b: Decimal): Decimal => (a.lt(b) ? a : b);

/** 4 hanede sıfır mı (fiş denge kontrolü için) */
export const isZero4 = (d: Decimal): boolean => round4(d).isZero();

export { Decimal };
