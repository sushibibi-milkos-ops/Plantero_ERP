'use client';

import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export { Form };

/** Tüm alan sarmalayıcılarının ortak props'u */
export type BaseFieldProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label?: React.ReactNode;
  description?: React.ReactNode;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

export function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <FormLabel className="text-[13px]">
      {children}
      {/* text-destructive değil: kırmızı bu bağlamda hata anlamı taşımıyor (zorunlu alan ≠ hata) —
          renk enflasyonundan kaçınma, aynı sayfada gerçek kırmızı yalnızca doğrulama hatasına ayrılır. */}
      {required ? <span className="ml-0.5 text-muted-foreground">*</span> : null}
    </FormLabel>
  );
}

/** Metin / e-posta / sayı girişi */
export function FormText<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  placeholder,
  type = 'text',
  autoComplete,
  inputMode,
  mono,
}: BaseFieldProps<TFieldValues> & {
  placeholder?: string;
  type?: React.HTMLInputTypeAttribute;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  mono?: boolean;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn('gap-1.5', className)}>
          {label ? <FieldLabel required={required}>{label}</FieldLabel> : null}
          <FormControl>
            <Input
              {...field}
              value={field.value ?? ''}
              type={type}
              placeholder={placeholder}
              autoComplete={autoComplete}
              inputMode={inputMode}
              disabled={disabled}
              className={cn('h-9 text-[13px] md:text-[13px]', mono && 'font-mono')}
            />
          </FormControl>
          {description ? <FormDescription className="text-xs">{description}</FormDescription> : null}
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

export function FormTextarea<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  placeholder,
  rows = 3,
}: BaseFieldProps<TFieldValues> & { placeholder?: string; rows?: number }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn('gap-1.5', className)}>
          {label ? <FieldLabel required={required}>{label}</FieldLabel> : null}
          <FormControl>
            <Textarea {...field} value={field.value ?? ''} placeholder={placeholder} rows={rows} disabled={disabled} className="text-[13px] md:text-[13px]" />
          </FormControl>
          {description ? <FormDescription className="text-xs">{description}</FormDescription> : null}
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

export type SelectOption = { value: string; label: string; disabled?: boolean };

export function FormSelect<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  placeholder = 'Seçin…',
  options,
}: BaseFieldProps<TFieldValues> & { placeholder?: string; options: SelectOption[] }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn('gap-1.5', className)}>
          {label ? <FieldLabel required={required}>{label}</FieldLabel> : null}
          <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={disabled}>
            <FormControl>
              <SelectTrigger className="h-9 w-full text-[13px]">
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value} disabled={o.disabled} className="text-[13px]">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description ? <FormDescription className="text-xs">{description}</FormDescription> : null}
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

export function FormCheckbox<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  disabled,
  className,
}: BaseFieldProps<TFieldValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn('flex flex-row items-start gap-2.5 space-y-0', className)}>
          <FormControl>
            <Checkbox checked={Boolean(field.value)} onCheckedChange={field.onChange} disabled={disabled} className="mt-0.5" />
          </FormControl>
          <div className="space-y-0.5 leading-none">
            {label ? <FormLabel className="text-[13px] font-normal">{label}</FormLabel> : null}
            {description ? <FormDescription className="text-xs">{description}</FormDescription> : null}
            <FormMessage className="text-xs" />
          </div>
        </FormItem>
      )}
    />
  );
}

export function FormSwitch<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  disabled,
  className,
}: BaseFieldProps<TFieldValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn('flex flex-row items-center justify-between gap-3 rounded-lg border px-3 py-2.5', className)}>
          <div className="space-y-0.5">
            {label ? <FormLabel className="text-[13px]">{label}</FormLabel> : null}
            {description ? <FormDescription className="text-xs">{description}</FormDescription> : null}
          </div>
          <FormControl>
            <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} disabled={disabled} />
          </FormControl>
        </FormItem>
      )}
    />
  );
}
