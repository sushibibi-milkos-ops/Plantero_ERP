'use client';

import { NumberInput } from '@/components/form/number-input';

/**
 * Fatura tahsis tutarı girişi (`/finans/tahsilat/yeni` satır tablosu): 2 ondalık gösterim/saklama.
 *
 * Tur 14'te burada geçici olarak taşınan "odakta görünen metni koru + DOM'u senkron eşitle + tümünü
 * seç" düzeltmesi artık ortak `NumberInput`'ın kendisinde (apps/web/src/components/form/number-input.tsx,
 * `toFocusText` ve `onFocus`) — bu bileşen yalnızca ince bir sarmalayıcıdır; davranış aynıdır.
 */
export function AllocationAmountInput({
  value,
  onChange,
  disabled,
  ariaLabel,
  className,
}: {
  value: string | null | undefined;
  onChange: (canonical: string | null) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <NumberInput
      value={value}
      onChange={onChange}
      maxDigits={2}
      minDigits={2}
      placeholder="0,00"
      disabled={disabled}
      aria-label={ariaLabel}
      className={className}
    />
  );
}
