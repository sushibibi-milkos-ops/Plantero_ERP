'use client';

import { useState } from 'react';
import type { FieldValues } from 'react-hook-form';
import { format, parse, isValid } from 'date-fns';
import { tr } from 'date-fns/locale';
import { CalendarIcon, X } from 'lucide-react';
import { FormControl, FormDescription, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FieldLabel, type BaseFieldProps } from './fields';

const ISO = 'yyyy-MM-dd';
const TR = 'dd.MM.yyyy';

function isoToDate(iso: string | null | undefined): Date | undefined {
  if (!iso) return undefined;
  const d = parse(iso, ISO, new Date());
  return isValid(d) ? d : undefined;
}

/**
 * Tarih seçici: yazılabilir (gg.aa.yyyy) + takvim. Form değeri ISO gün string'i ("2026-09-02").
 * Zaman dilimi sorunu yok: yalnızca takvim günü taşınır.
 */
export function DateInput({
  value,
  onChange,
  disabled,
  placeholder = 'gg.aa.yyyy',
  clearable = true,
  className,
  fromDate,
  toDate,
  id,
  'aria-describedby': ariaDescribedBy,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
}: {
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
  fromDate?: Date;
  toDate?: Date;
  /** Bağımsız (FormField dışı) kullanımda bir `<label htmlFor>` ile eşleştirmek için — metin girişine iletilir. */
  id?: string;
  'aria-describedby'?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
}) {
  const date = isoToDate(value);
  const [text, setText] = useState(date ? format(date, TR) : '');
  const [open, setOpen] = useState(false);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(date ? format(date, TR) : '');
  }

  const commitText = () => {
    if (text.trim() === '') {
      onChange(null);
      return;
    }
    const d = parse(text.trim(), TR, new Date());
    if (isValid(d)) {
      onChange(format(d, ISO));
      setText(format(d, TR));
    } else {
      setText(date ? format(date, TR) : '');
    }
  };

  return (
    <div className={cn('relative flex items-center', className)}>
      <Input
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitText();
          }
        }}
        inputMode="numeric"
        placeholder={placeholder}
        disabled={disabled}
        aria-describedby={ariaDescribedBy}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        className="num h-9 pr-16 text-[13px] md:text-[13px]"
      />
      <div className="absolute right-1 flex items-center">
        {clearable && value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground"
            aria-label="Tarihi temizle"
            disabled={disabled}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Takvim"
              disabled={disabled}
            >
              <CalendarIcon className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
            <Calendar
              mode="single"
              locale={tr}
              selected={date}
              defaultMonth={date}
              startMonth={fromDate}
              endMonth={toDate}
              onSelect={(d) => {
                onChange(d ? format(d, ISO) : null);
                setOpen(false);
              }}
              captionLayout="dropdown"
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

export function FormDate<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  fromDate,
  toDate,
}: BaseFieldProps<TFieldValues> & { fromDate?: Date; toDate?: Date }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn('gap-1.5', className)}>
          {label ? <FieldLabel required={required}>{label}</FieldLabel> : null}
          <FormControl>
            <DateInput value={field.value} onChange={field.onChange} disabled={disabled} fromDate={fromDate} toDate={toDate} />
          </FormControl>
          {description ? <FormDescription className="text-xs">{description}</FormDescription> : null}
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}
