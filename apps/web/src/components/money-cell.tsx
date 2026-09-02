import { cn } from '@/lib/utils';
import { formatMoney, type NumberLike } from '@/lib/format';

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
  const neg = s.trim().startsWith('-');
  const zero = /^-?0*(\.0*)?$/.test(s.trim());
  const text = formatMoney(s, currency, { digits });
  return (
    <span
      className={cn(
        'num inline-block text-right whitespace-nowrap',
        neg && 'text-destructive',
        (zero || muted) && 'text-muted-foreground/70',
        className,
      )}
    >
      {signed && !neg && !zero ? '+' : ''}
      {text}
    </span>
  );
}
