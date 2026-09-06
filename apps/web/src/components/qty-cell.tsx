import { cn } from '@/lib/utils';
import { formatQty, getMoneyTone, type NumberLike } from '@/lib/format';

/**
 * Miktar hücresi: sayı mono + birim soluk, sağa yaslı.
 * `minDigits` verilirse (ör. bir sütunun tamamında sabit hane için) ondalık basamak sayısı sabitlenir
 * ki aynı sütundaki tüm değerlerin ondalık ayracı aynı x koordinatına düşsün.
 */
export function QtyCell({
  value,
  uom,
  maxDigits = 3,
  minDigits,
  className,
}: {
  value: NumberLike;
  uom?: string | null;
  maxDigits?: number;
  minDigits?: number;
  className?: string;
}) {
  const s = value === null || value === undefined || value === '' ? '0' : String(value);
  // Ton kararı `getMoneyTone` (lib/format.ts) üzerinden — MoneyCell/KpiCard ile PAYLAŞILAN TEK kaynak
  // (bkz. shell-qtycell-zero-tone-01): önceden sıfır miktar dolu değerle birebir aynı tam kontrastta
  // basılıyordu (ör. henüz üretilmemiş iş emri "0 ADET" ile bitmiş iş emri "196 ADET" aynı ağırlıkta).
  const tone = getMoneyTone(value);
  const neg = tone === 'negative';
  const zero = tone === 'zero';
  return (
    <span
      className={cn(
        'num inline-flex items-baseline justify-end whitespace-nowrap',
        neg && 'text-destructive',
        zero && 'text-muted-foreground/70',
        className,
      )}
    >
      {formatQty(s, undefined, { maxDigits, minDigits })}
      {/* `ml-1` yerine `gap-1`'e güvenmiyoruz: çağıran taraf className ile `inline` (flex olmayan)
          bir görüntüleme moduna geçerse gap sıfıra düşer ve birim sayının üstüne yapışır. */}
      {uom ? <span className="ml-1 font-sans text-[11px] text-muted-foreground">{uom}</span> : null}
    </span>
  );
}
