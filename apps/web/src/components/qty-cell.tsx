import { cn } from '@/lib/utils';
import { formatQty, type NumberLike } from '@/lib/format';

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
  const neg = s.trim().startsWith('-');
  return (
    <span className={cn('num inline-flex items-baseline justify-end gap-1 whitespace-nowrap', neg && 'text-destructive', className)}>
      {formatQty(s, undefined, { maxDigits, minDigits })}
      {uom ? <span className="font-sans text-[11px] text-muted-foreground">{uom}</span> : null}
    </span>
  );
}
