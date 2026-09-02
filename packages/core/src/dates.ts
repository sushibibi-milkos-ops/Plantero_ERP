/**
 * Tarih yardımcıları. Zaman damgaları UTC saklanır; iş tarihi (yevmiye tarihi, SKT karşılaştırması)
 * Europe/Istanbul takvim gününe göre belirlenir — gece yarısı civarındaki hareketler yanlış döneme düşmez.
 */

const TZ = 'Europe/Istanbul';
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Date → Istanbul takvim günü `YYYY-MM-DD`; string verilirse ilk 10 karakter (zaten tarih) */
export function businessDate(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** `YYYY-MM-DD` üzerine gün ekler (takvim aritmetiği, UTC) */
export function addDays(d: string, days: number): string {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
