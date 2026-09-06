import { cn } from '@/lib/utils';
import { formatMoney, getMoneyTone, type NumberLike } from '@/lib/format';

/**
 * Para hücresi: sağa yaslı, tablo rakamlı, mono. Negatif kırmızı, sıfır soluk.
 * `showCurrency=false` ile yalnızca sayı (aynı para biriminde sütunlar için).
 */
export function MoneyCell({
  value,
  currency = 'TRY',
  digits = 2,
  muted,
  signed = false,
  className,
}: {
  value: NumberLike;
  currency?: string;
  digits?: number;
  /** Sıfır ve boş değerleri soluk göster */
  muted?: boolean;
  /** Pozitifte + işareti */
  signed?: boolean;
  className?: string;
}) {
  const s = value === null || value === undefined || value === '' ? '0' : String(value);
  // Negatif/sıfır kararı artık `getMoneyTone` (lib/format.ts) üzerinden — KpiCard (format='money')
  // ile paylaşılan TEK kaynak (bkz. shell-kpicard-neg-money-color-01).
  const tone = getMoneyTone(value);
  const neg = tone === 'negative';
  const zero = tone === 'zero';
  // `signed` yalnızca sayım farkı gibi İSTİSNA bir değeri gösterirken kullanılır — işaret ne
  // olursa olsun bu bir normal para hücresi değildir. Önceden yalnızca negatif kırmızıydı; pozitif
  // fark ("+₺360,00") tamamen nötr siyahtı, oysa fazlalık da eksiklik kadar bir uyarı sinyali
  // taşımalı (Tur 4 P2 bulgusu). Eksik = destructive (kırmızı), fazla = warning (amber), sıfır nötr.
  const positiveSigned = signed && !neg && !zero;
  const text = formatMoney(s, currency, { digits });
  return (
    <span
      className={cn(
        'num inline-block text-right whitespace-nowrap',
        neg && 'text-destructive',
        positiveSigned && 'text-warning',
        (zero || muted) && 'text-muted-foreground/70',
        className,
      )}
    >
      {positiveSigned ? '+' : ''}
      {text}
    </span>
  );
}
