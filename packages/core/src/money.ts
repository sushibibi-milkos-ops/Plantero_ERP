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

/**
 * Kullanıcıya gösterilecek miktar — TR ondalık (virgül) + gereksiz sıfırlar atılmış, binlik nokta ayraçlı.
 * Kök neden (tur 2 P1 muhasebe-yevmiye-03, tur 1 P1 core-trace/recall): ham `toDb(qty)` numeric(18,4)
 * string'i ("19.0000") arayüze/metne sızıyordu. Tek yerden üretilir; `stock/ledger.ts` (fiş açıklaması),
 * `lots/trace.ts` (izleme düğümü alt metni) ve `quality/recall.ts` (geri çağırma bildirim taslağı) burayı kullanır.
 */
export const formatQtyTr = (qty: Decimal | string | number): string => {
  const fixed = D(qty).toFixed(4);
  const trimmed = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 4 }).format(trimmed as unknown as number);
};

/**
 * Kullanıcıya gösterilecek tutar — TR para biçimi (₺1.234,56, negatifte işaret sembolün önünde:
 * "-₺450,75"). apps/web `formatMoney` ile aynı çıktıyı üretir. Kök neden (tur 3 P1 onaylar-13):
 * `packages/core/src/purchasing/whitelist.ts` (ve onu çağıran satın alma taslağı özet metinleri)
 * `${d.toFixed(2)}` ile ham İngilizce ondalık ("₺72000.00") üretiyordu — core katmanında üretilip
 * doğrudan ekrana yazılan (DB'ye `summary` string'i olarak gömülen) metinler `apps/web/src/lib/format.ts`
 * içindeki `formatMoney`'i kullanamaz (core → web bağımlılığı yasak); bu yüzden `formatQtyTr` ile
 * aynı desende tek core noktasından üretilir.
 */
export const formatMoneyTr = (v: Decimal | string | number | null | undefined, currency = 'TRY'): string => {
  const plain = D(v).toFixed(2);
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(plain as unknown as number);
};

export { Decimal };
