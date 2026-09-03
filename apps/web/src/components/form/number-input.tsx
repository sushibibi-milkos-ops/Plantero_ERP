'use client';

import { useEffect, useState } from 'react';
import Decimal from 'decimal.js';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

/**
 * Türkçe sayı girişi. Form değeri kanonik string ("1234.56") — Decimal'e doğrudan geçer.
 * Odaktayken ham (virgül ondalıklı) metin, odak dışında biçimli (1.234,56).
 * Kural: virgül ondalık, nokta binlik ayracıdır.
 */
export function parseTrNumber(raw: string): string | null {
  const s = raw.replace(/[\s₺€$%]/g, '').trim();
  if (s === '' || s === '-') return null;
  const normalized = s.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d*(\.\d*)?$/.test(normalized)) return null;
  try {
    const d = new Decimal(normalized === '.' || normalized === '-.' ? '0' : normalized);
    return d.isFinite() ? d.toFixed() : null;
  } catch {
    return null;
  }
}

export function formatTrNumber(canonical: string | null | undefined, maxDigits: number, minDigits = 0): string {
  if (canonical === null || canonical === undefined || canonical === '') return '';
  try {
    const d = new Decimal(canonical);
    if (!d.isFinite()) return '';
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: minDigits, maximumFractionDigits: maxDigits }).format(
      d.toFixed(maxDigits, Decimal.ROUND_HALF_UP) as unknown as number,
    );
  } catch {
    return '';
  }
}

export function NumberInput({
  value,
  onChange,
  onBlur,
  maxDigits = 4,
  minDigits = 0,
  prefix,
  suffix,
  placeholder = '0',
  disabled,
  className,
  id,
  name,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedby,
}: {
  value: string | null | undefined;
  onChange: (canonical: string | null) => void;
  onBlur?: () => void;
  maxDigits?: number;
  minDigits?: number;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => formatTrNumber(value, maxDigits, minDigits));

  // Dış değer değişince (form reset vb.) metni eşle — odak dışındayken
  useEffect(() => {
    if (!focused) setText(formatTrNumber(value, maxDigits, minDigits));
  }, [value, focused, maxDigits, minDigits]);

  return (
    <div className={cn('relative flex items-center', className)}>
      {prefix ? <span className="pointer-events-none absolute left-2.5 text-[13px] text-muted-foreground">{prefix}</span> : null}
      <Input
        id={id}
        name={name}
        inputMode="decimal"
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
        onFocus={() => {
          setFocused(true);
          // Ham metin: binlik ayraçsız, virgül ondalık
          if (value) {
            const d = new Decimal(value);
            setText(d.toFixed().replace('.', ','));
          }
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const parsed = parseTrNumber(raw);
          onChange(parsed);
        }}
        onBlur={() => {
          setFocused(false);
          const parsed = parseTrNumber(text);
          const rounded = parsed === null ? null : new Decimal(parsed).toFixed(maxDigits, Decimal.ROUND_HALF_UP);
          onChange(rounded);
          setText(formatTrNumber(rounded, maxDigits, minDigits));
          onBlur?.();
        }}
        // h-11 md:h-9: Input primitive'inin kendi varsayılanı yeterliydi ama burada satır içi
        // `className` ile override edilip sabit h-9'a düşürülüyordu — Combobox/DateInput ile aynı
        // 44px mobil dokunma hedefi deseni burada da uygulanır (Tur 3 bulgusu, P1).
        className={cn('num h-11 text-right text-[13px] md:h-9 md:text-[13px]', prefix && 'pl-7', suffix && 'pr-12')}
      />
      {suffix ? <span className="pointer-events-none absolute right-2.5 text-[12px] text-muted-foreground">{suffix}</span> : null}
    </div>
  );
}
