'use client';

import type { FieldValues } from 'react-hook-form';
import { FormControl, FormDescription, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import { FieldLabel, type BaseFieldProps } from './fields';
import { NumberInput } from './number-input';

const CURRENCY_SYMBOL: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };

/** Para alanı: 2 ondalık gösterim, 4 ondalık saklama (numeric(18,4)) */
export function FormMoney<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  currency = 'TRY',
  placeholder = '0,00',
}: BaseFieldProps<TFieldValues> & { currency?: string; placeholder?: string }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn('gap-1.5', className)}>
          {label ? <FieldLabel required={required}>{label}</FieldLabel> : null}
          <FormControl>
            <NumberInput
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              maxDigits={2}
              minDigits={2}
              prefix={CURRENCY_SYMBOL[currency] ?? currency}
              placeholder={placeholder}
              disabled={disabled}
            />
          </FormControl>
          {description ? <FormDescription className="text-xs">{description}</FormDescription> : null}
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

/** Miktar alanı: birim son ek, en fazla 3 ondalık */
export function FormQty<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  uom,
  maxDigits = 3,
  placeholder = '0',
}: BaseFieldProps<TFieldValues> & { uom?: string | null; maxDigits?: number; placeholder?: string }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn('gap-1.5', className)}>
          {label ? <FieldLabel required={required}>{label}</FieldLabel> : null}
          <FormControl>
            <NumberInput
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              maxDigits={maxDigits}
              suffix={uom ?? undefined}
              placeholder={placeholder}
              disabled={disabled}
            />
          </FormControl>
          {description ? <FormDescription className="text-xs">{description}</FormDescription> : null}
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}
