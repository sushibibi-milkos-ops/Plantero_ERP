'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FieldValues } from 'react-hook-form';
import { Check, ChevronDown, Loader2, X } from 'lucide-react';
import { FormControl, FormDescription, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { FieldLabel, type BaseFieldProps } from './fields';

export type ComboboxOption = { value: string; label: string; description?: string; keywords?: string[]; disabled?: boolean };

/**
 * Aranabilir seçim (cari, ürün, lot…). `onSearch` verilirse uzak arama yapılır
 * (250 ms debounce); yoksa `options` içinde yerel süzme (TR duyarsız).
 */
export function Combobox({
  value,
  onChange,
  options,
  onSearch,
  placeholder = 'Seçin…',
  searchPlaceholder = 'Ara…',
  emptyText = 'Sonuç yok',
  disabled,
  clearable = true,
  className,
  mono,
  id,
  'aria-describedby': ariaDescribedBy,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  options: ComboboxOption[];
  onSearch?: (q: string) => Promise<ComboboxOption[]>;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
  mono?: boolean;
  /** Bağımsız (FormField dışı) kullanımda bir `<label htmlFor>` ile eşleştirmek için — tetikleyici
   *  köke iletilir; birlikte kullanılan `FieldLabel`'a aynı id verilmeli. */
  id?: string;
  'aria-describedby'?: string;
  /** Görünür bir `<label>` yoksa erişilebilir ad (ör. bir tablo filtre çubuğundaki arama kutusu). */
  'aria-label'?: string;
  'aria-invalid'?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<ComboboxOption[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!onSearch || !open) return;
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await onSearch(query);
        if (alive) setRemote(res);
      } finally {
        if (alive) setLoading(false);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, onSearch, open]);

  const list = remote ?? options;
  const selected = useMemo(() => list.find((o) => o.value === value) ?? options.find((o) => o.value === value), [list, options, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-describedby={ariaDescribedBy}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          disabled={disabled}
          className={cn(
            // h-11 md:h-9: 390px'te 36px dokunma hedefi WCAG/iOS 44px eşiğinin altındaydı (Tur 2
            // bulgusu) — fields.tsx'teki Input/SelectTrigger ile aynı kalıp.
            'flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left text-[13px] shadow-xs outline-none md:h-9',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
            'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <span className={cn('truncate', mono && selected && 'font-mono')}>{selected ? selected.label : placeholder}</span>
          <span className="flex shrink-0 items-center gap-1">
            {clearable && selected && !disabled ? (
              <X
                className="size-3.5 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
              />
            ) : null}
            {/* Select ile aynı ikon (ChevronDown) — bidirectional ok yalnızca combobox'a özgü ayrı
                bir seçim affordance'ı olduğu izlenimi veriyordu, iki alan da tek tıklamalık açılır
                seçim. */}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command
          shouldFilter={!onSearch}
          filter={(v, s, keywords) => {
            const hay = `${v} ${(keywords ?? []).join(' ')}`.toLocaleLowerCase('tr-TR');
            return hay.includes(s.toLocaleLowerCase('tr-TR')) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} className="h-9 text-[13px]" />
          <CommandList className="max-h-64">
            {loading ? (
              <div className="flex items-center justify-center py-4 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
              </div>
            ) : (
              <CommandEmpty className="py-4 text-[13px]">{emptyText}</CommandEmpty>
            )}
            <CommandGroup>
              {list.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  keywords={[o.value, ...(o.keywords ?? [])]}
                  disabled={o.disabled}
                  onSelect={() => {
                    onChange(o.value === value && clearable ? null : o.value);
                    setOpen(false);
                  }}
                  className="text-[13px]"
                >
                  <Check className={cn('size-3.5', o.value === value ? 'opacity-100' : 'opacity-0')} />
                  <span className={cn('truncate', mono && 'font-mono')}>{o.label}</span>
                  {o.description ? <span className="ml-auto truncate text-xs text-muted-foreground">{o.description}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function FormCombobox<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  ...rest
}: BaseFieldProps<TFieldValues> & Omit<React.ComponentProps<typeof Combobox>, 'value' | 'onChange' | 'disabled' | 'className'>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn('gap-1.5', className)}>
          {label ? <FieldLabel required={required}>{label}</FieldLabel> : null}
          <FormControl>
            <Combobox value={field.value} onChange={field.onChange} disabled={disabled} {...rest} />
          </FormControl>
          {description ? <FormDescription className="text-xs">{description}</FormDescription> : null}
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}
