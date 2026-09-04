'use client';

import { useEffect, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

/**
 * Türkçe sayı girişi. Form değeri kanonik string ("1234.56") — Decimal'e doğrudan geçer.
 * Odaktayken ham (virgül ondalıklı, binlik ayraçsız) metin, odak dışında biçimli (1.234,56).
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

/**
 * Odaktaki ham metin: ekranda GÖRÜNEN hassasiyet (maxDigits'e yuvarlanmış, minDigits'e kadar sıfır
 * kırpılmış), binlik ayraçsız, virgül ondalıklı. `value` prop'unun tam hassasiyeti (numeric(18,4) →
 * "919.9999") DEĞİL — odak dışında "920,00" gören kullanıcı odaklanınca da "920,00" görür.
 *
 * Kök neden (tur 14, P0): eski sürüm odakta `value`'nun 4 ondalığını yazıyordu ("920,00" → "919,9999");
 * metin değiştiği ve seçili bırakılmadığı için hemen ardından yazılan rakamlar bu metnin SONUNA
 * ekleniyor ("919,99991020,00"), `parseTrNumber` null döndürüyor ve değer sessizce düşüyordu.
 */
export function toFocusText(canonical: string | null | undefined, maxDigits: number, minDigits = 0): string {
  if (canonical === null || canonical === undefined || canonical === '') return '';
  try {
    const d = new Decimal(canonical);
    if (!d.isFinite()) return '';
    let fixed = d.toFixed(maxDigits, Decimal.ROUND_HALF_UP);
    if (maxDigits > minDigits && fixed.includes('.')) {
      // Sondaki gereksiz sıfırları minDigits'e kadar kırp ("1.500" → "1.5", "920.00" → "920" [min 0])
      const [int, frac = ''] = fixed.split('.');
      const trimmed = frac.replace(/0+$/, '');
      const kept = trimmed.length < minDigits ? frac.slice(0, minDigits) : trimmed;
      fixed = kept ? `${int}.${kept}` : int!;
    }
    return fixed.replace('.', ',');
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
  inputClassName,
  id,
  name,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedby,
  'aria-label': ariaLabel,
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
  /** Sarmalayıcı (`div`) sınıfı — genişlik/hizalama için */
  className?: string;
  /** İç `<input>` sınıfı */
  inputClassName?: string;
  id?: string;
  name?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
  'aria-label'?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => formatTrNumber(value, maxDigits, minDigits));
  // Fareyle odaklanmada tarayıcı mouseup'ta seçimi imlece indirger — ilk mouseup'ı bir kez yutarız
  // ki odakta yapılan tümünü-seç korunsun (sonraki tıklamalar imleci normal konumlandırır).
  const selectOnMouseUp = useRef(false);

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
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
        aria-label={ariaLabel}
        onFocus={(e) => {
          setFocused(true);
          // Görünen hassasiyeti koru; `value` yoksa (kullanıcı yazarken ara metin) mevcut metin kalır.
          const raw = value ? toFocusText(value, maxDigits, minDigits) : text;
          setText(raw);
          // DOM değerini React'in re-render'ını BEKLEMEDEN nihai metne eşitle ve ONDAN SONRA tümünü
          // seç: böylece hemen ardından yazılan/yapıştırılan/otomasyonla doldurulan metin her zaman
          // seçili olanın YERİNE geçer, asla eski metnin sonuna eklenmez. (React bir sonraki render'da
          // aynı değeri yazacağından çakışma yok — idempotent.)
          e.currentTarget.value = raw;
          e.currentTarget.select();
          selectOnMouseUp.current = true;
        }}
        onMouseUp={(e) => {
          if (selectOnMouseUp.current) {
            selectOnMouseUp.current = false;
            e.preventDefault();
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
          selectOnMouseUp.current = false;
          const parsed = parseTrNumber(text);
          const rounded = parsed === null ? null : new Decimal(parsed).toFixed(maxDigits, Decimal.ROUND_HALF_UP);
          onChange(rounded);
          setText(formatTrNumber(rounded, maxDigits, minDigits));
          onBlur?.();
        }}
        // h-11 md:h-9: Input primitive'inin kendi varsayılanı yeterliydi ama burada satır içi
        // `className` ile override edilip sabit h-9'a düşürülüyordu — Combobox/DateInput ile aynı
        // 44px mobil dokunma hedefi deseni burada da uygulanır (Tur 3 bulgusu, P1).
        className={cn('num h-11 text-right text-[13px] md:h-9 md:text-[13px]', prefix && 'pl-7', suffix && 'pr-12', inputClassName)}
      />
      {suffix ? <span className="pointer-events-none absolute right-2.5 text-[12px] text-muted-foreground">{suffix}</span> : null}
    </div>
  );
}
