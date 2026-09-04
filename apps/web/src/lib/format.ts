import Decimal from 'decimal.js';
import { formatDistanceStrict } from 'date-fns';
import { tr } from 'date-fns/locale';

/**
 * Biçimlendirme yardımcıları — yalnızca ekran içindir.
 * Hesaplama asla burada yapılmaz; girdi string/Decimal olarak gelir ve
 * Intl'e string olarak verilir (float dönüşümü yok, hassasiyet korunur).
 */

export type NumberLike = string | number | Decimal | null | undefined;

export const TZ = 'Europe/Istanbul';
export const LOCALE = 'tr-TR';

function toPlain(v: NumberLike, dp?: number): string {
  if (v === null || v === undefined || v === '') return '0';
  const d = new Decimal(typeof v === 'number' ? v : v.toString());
  if (!d.isFinite()) return '0';
  return dp === undefined ? d.toFixed() : d.toFixed(dp, Decimal.ROUND_HALF_UP);
}

/** ₺1.234,56 — para birimi sembolü Intl'den (TRY → ₺, EUR → €, USD → $)
 *  `compact`: Intl'in `style:'currency'+notation:'compact'` ikilisi ICU sürümüne göre sembolü
 *  sona düşürebiliyordu ("16 B ₺") — sayfadaki her yerdeki sembol-önde biçimle ("₺98.193")
 *  çelişiyordu (grafik Y ekseni, Tur 3 bulgusu). Sembol her zaman ayrı alınıp sayının önüne
 *  (negatifte işaretin sonrasına) sabit eklenir; ICU'nun kısaltma yerleşimine bağımlı değildir. */
export function formatMoney(v: NumberLike, currency = 'TRY', opts: { digits?: number; compact?: boolean } = {}): string {
  const digits = opts.digits ?? 2;
  const plain = toPlain(v, digits);
  if (opts.compact) {
    const symbol = new Intl.NumberFormat(LOCALE, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? '';
    const numPart = new Intl.NumberFormat(LOCALE, { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(plain as unknown as number);
    const neg = numPart.startsWith('-');
    return `${neg ? '-' : ''}${symbol}${neg ? numPart.slice(1) : numPart}`;
  }
  const nf = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return nf.format(plain as unknown as number);
}

/** 1.250,5 kg — en fazla 3 ondalık, gereksiz sıfır yok */
export function formatQty(v: NumberLike, uom?: string | null, opts: { maxDigits?: number; minDigits?: number } = {}): string {
  const plain = toPlain(v);
  const nf = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: opts.minDigits ?? 0,
    maximumFractionDigits: opts.maxDigits ?? 3,
  });
  const s = nf.format(plain as unknown as number);
  return uom ? `${s} ${uom}` : s;
}

/** Tam sayı: 1.234 */
export function formatInt(v: NumberLike): string {
  return formatQty(v, undefined, { maxDigits: 0 });
}

/** %12,5 — girdi yüzde puanıdır (12.5 → %12,5). Tek tip: tr-TR ayracı, en fazla `digits` ondalık, gereksiz sıfır yok. */
export function formatPct(v: NumberLike, digits = 2): string {
  const plain = toPlain(new Decimal(toPlain(v)).div(100), digits + 2);
  const nf = new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
  return nf.format(plain as unknown as number);
}

/**
 * Ortak para girişi ayrıştırıcı (tur 14, P0 — `/finans/tahsilat/yeni` çift tahsilat kusuru).
 * Hem tr-TR ekran biçimini ("1.020,00" — nokta binlik, virgül ondalık) hem de kanonik/API
 * biçimini ("1020.00" — noktalı ondalık, binlik ayraç yok) kabul eder; geçersiz/bozuk metinde
 * (ör. odak/otomasyon yarışından doğan "919,99991020,00" gibi birleşmiş metin) `null` döner.
 *
 * Kök neden (kanıtlandı, packages/core/src/finance/payments.ts / RecordPaymentForm): paylaşılan
 * `NumberInput` (apps/web/src/components/form/number-input.tsx, ORTAK — bu modül değiştiremez)
 * odaklanınca metni `value` prop'undan (tam hassasiyet, numeric(18,4) → 4 ondalık, ör. "919.9999")
 * yeniden kurar; bu, o ana kadar ekranda görünen 2 ondaklı biçimden ("920,00") FARKLI uzunlukta
 * bir metindir. Programatik/otomatik doldurma (Playwright `fill`, bazı IME/otomasyon akışları)
 * odak olayı ile asıl yazma arasına bu yeniden biçimlenmeyi sıkıştırabiliyor; sonuç, eski ve yeni
 * metnin BİRLEŞTİĞİ ayrıştırılamaz bir dize. Eskiden bu durumda ilgili tahsis satırı SESSİZCE
 * düşüyordu (tutar '' oluyordu, checkbox işaretli kalsa da tahsis dizisine hiç girmiyordu) —
 * kullanıcı bir faturayı tahsis ediyormuş gibi görünürken ödeme tahsissiz (avans) kaydediliyordu.
 * Bu fonksiyon + RecordPaymentForm.onSubmit artık bu durumu bir alan hatasına çeviriyor (bkz. rapor).
 */
export function parseMoneyInput(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = raw.replace(/[\s₺€$%]/g, '').trim();
  if (s === '' || s === '-') return null;
  const hasComma = s.includes(',');
  // Virgül varsa tr-TR: nokta binlik ayraç (silinir), virgül ondalık (noktaya çevrilir).
  // Virgül yoksa kanonik: metin olduğu gibi ondalık noktalı sayı olarak değerlendirilir.
  const normalized = hasComma ? s.replace(/\./g, '').replace(',', '.') : s;
  if (!/^-?\d*(\.\d*)?$/.test(normalized) || normalized === '' || normalized === '.' || normalized === '-') return null;
  // Tek bir ondalık ayraçtan fazlası (ör. hem binlik hem ondalık nokta karışmış, ya da yarışın
  // birleştirdiği "919.99991020.00" gibi bir metin) kalmışsa geçersiz say — sessizce yanlış
  // yorumlamaktansa reddetmek daha güvenli.
  if ((normalized.match(/\./g)?.length ?? 0) > 1) return null;
  try {
    const d = new Decimal(normalized);
    return d.isFinite() ? d.toFixed() : null;
  } catch {
    return null;
  }
}

type DateLike = Date | string | number | null | undefined;

function toDate(v: DateLike): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 02.09.2026 (Europe/Istanbul) */
export function formatDate(v: DateLike): string {
  const d = toDate(v);
  if (!d) return '—';
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

/** 02.09.2026 14:35 */
export function formatDateTime(v: DateLike): string {
  const d = toDate(v);
  if (!d) return '—';
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/** 14:35 */
export function formatTime(v: DateLike): string {
  const d = toDate(v);
  if (!d) return '—';
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

/** 2 Eylül 2026 */
export function formatDateLong(v: DateLike): string {
  const d = toDate(v);
  if (!d) return '—';
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

/** "3 saat önce" / "2 gün sonra" */
export function relativeTime(v: DateLike, now?: Date): string {
  const d = toDate(v);
  if (!d) return '—';
  const base = now ?? new Date();
  const diff = Math.abs(base.getTime() - d.getTime());
  if (diff < 45_000) return 'az önce';
  // `formatDistanceToNowStrict` her zaman gerçek `Date.now()` ile kıyaslar — `now` parametresini
  // yok sayardı (test/gösterim amaçlı sabit bir `now` verildiğinde yanlış sonuç üretiyordu).
  // `formatDistanceStrict(d, base, ...)` iki tarihi açıkça kıyaslar, `now` her zaman dikkate alınır.
  return formatDistanceStrict(d, base, { addSuffix: true, locale: tr });
}

/** Tarihler arası gün farkı (takvim günü, İstanbul) — negatif = geçmiş */
export function daysUntil(v: DateLike, now?: Date): number | null {
  const d = toDate(v);
  if (!d) return null;
  const base = now ?? new Date();
  const dayMs = 86_400_000;
  const toDayIndex = (x: Date) => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(x);
    return Math.floor(Date.UTC(Number(parts.slice(0, 4)), Number(parts.slice(5, 7)) - 1, Number(parts.slice(8, 10))) / dayMs);
  };
  return toDayIndex(d) - toDayIndex(base);
}

/** Baş harfler: "Yasin Türker" → "YT" */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toLocaleUpperCase('tr-TR'))
    .join('');
}

/** URL parçası: "Ayarlar / Kullanıcılar" → "ayarlar-kullanicilar" */
export function slugify(s: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', İ: 'i', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u' };
  return s
    .replace(/[çğıöşüİÇĞÖŞÜ]/g, (c) => map[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
