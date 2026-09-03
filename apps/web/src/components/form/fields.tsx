'use client';

import { useContext, useId } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { Form, FormControl, FormDescription, FormField, FormFieldContext, FormItem, FormItemContext, FormLabel, FormMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
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

/**
 * Alan etiketi. `<FormField>` içinde kullanılırsa (ör. `FormText`) otomatik olarak o alana bağlanır.
 * `<FormField>` dışında (bir `Combobox`/`DateInput`'u elle bir `<Controller>` ile eşleyen ekranlarda)
 * kullanılıyorsa `htmlFor` ile eşleştirilen bileşenin `id`'sini açıkça vermek gerekir — verilmezse
 * kendi ürettiği kararlı bir id'yi kullanır (önceki davranış: `ui/form.tsx`'in `useFormField()`'i,
 * varsayılan context nesnesi `{}` her zaman doğru (truthy) kabul edildiği için sessizce
 * `"undefined-form-item"` gibi hiçbir kontrole karşılık gelmeyen kırık bir id üretiyordu).
 */
export function FieldLabel({ children, required, htmlFor, className }: { children: React.ReactNode; required?: boolean; htmlFor?: string; className?: string }) {
  const autoId = useId();
  const fieldCtx = useContext(FormFieldContext);
  const itemCtx = useContext(FormItemContext);
  const inFormField = Boolean(fieldCtx && 'name' in fieldCtx && itemCtx && 'id' in itemCtx);

  // Kök neden (Tur 5 P2): `ui/label.tsx`/`ui/form.tsx`'teki taban Label sınıfı `flex items-center
  // gap-2` taşıyor — bu gap TÜM çocuklar arasına (etiket metni ↔ asteriks span'ı) 8px koyuyordu,
  // span'daki `ml-0.5` (2px) hiçbir zaman baskın olmuyordu; sonuç "Depo   *" gibi kopuk görünen bir
  // boşluk hatası izlenimiydi. Burada yerel `gap-0.5` override'ı (aynı tw-merge grubu, `gap-*`) taban
  // bileşeni değiştirmeden yalnızca FieldLabel'ın kendi kullanım noktasında düzeltir.
  if (inFormField && !htmlFor) {
    // FormField/FormItem bağlamı gerçekten var — mevcut `FormLabel` doğrulama hatasını da kırmızıyla vurgular.
    return (
      <FormLabel className={cn('gap-0.5 text-[13px]', className)}>
        {children}
        {/* text-destructive değil: kırmızı bu bağlamda hata anlamı taşımıyor (zorunlu alan ≠ hata) —
            renk enflasyonundan kaçınma, aynı sayfada gerçek kırmızı yalnızca doğrulama hatasına ayrılır. */}
        {required ? <span className="text-muted-foreground">*</span> : null}
      </FormLabel>
    );
  }

  return (
    <Label htmlFor={htmlFor ?? autoId} className={cn('gap-0.5 text-[13px]', className)}>
      {children}
      {required ? <span className="text-muted-foreground">*</span> : null}
    </Label>
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
              className={cn('h-11 text-[13px] md:h-9 md:text-[13px]', mono && 'font-mono')}
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
              {/* Kök neden (Tur 5 P1): SelectTrigger'ın taban sınıfı `data-[size=default]:h-9` bir
                  ATTRIBUTE selector taşıdığı için düz `h-11`/`md:h-9` override'ından daha yüksek
                  özgüllüğe sahipti — bu alan 390px'te GERÇEKTE her zaman 36px kalıyordu (mal-kabul/yeni
                  "Depo" gibi FormSelect kullanan tüm alanlar). Override artık AYNI `data-[size=default]:`
                  zincirini hedefliyor.
                  ACİL DÜZELTME (masterdata agent, Tur 5): yukarıdaki yorum küme parantezli JSX yorumu
                  YERİNE çıplak `//` ile bırakılmıştı — JSX'te bu bir yorum değil, `<FormControl>`'ün metin çocuğu haline
                  gelip `<SelectTrigger>` ile birlikte İKİ çocuk oluşturuyordu: FormControl (Radix Slot)
                  tam olarak tek bir React element çocuğu bekler, ikinci (metin) çocuk "Slot failed to
                  slot onto its children" hatasıyla FormSelect kullanan HER sayfayı çökertiyordu (bu
                  modülde /ana-veri/urunler/yeni). Ortak dosya kuralına rağmen düzeltildi çünkü bu bir
                  tasarım kararı değil, bozuk sözdizimiydi — uygulama genelinde her FormSelect'i kırıyordu. */}
              <SelectTrigger className="w-full text-[13px] data-[size=default]:h-11 md:data-[size=default]:h-9">
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
