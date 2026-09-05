'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from '@/components/ui/sheet';
import { Form, FormSwitch } from '@/components/form/fields';
import { FormQty, FormMoney } from '@/components/form/money-qty';
import { FormCombobox } from '@/components/form/combobox';
import { FormActions } from '@/components/form/form-actions';
import { Button } from '@/components/ui/button';
import { updateReorderRuleAction } from '../actions';
import type { CriticalStockRow } from '../queries';

const schema = z.object({
  minQty: z.string().min(1, 'Min. stok girin'),
  maxQty: z.string().min(1, 'Maks. stok girin'),
  leadTimeDays: z.string().min(1),
  safetyDays: z.string().min(1),
  preferredSupplierId: z.string().uuid().optional().nullable(),
  isAutoOrderWhitelisted: z.boolean(),
  autoOrderMaxAmount: z.string().optional().nullable(),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

/**
 * Kritik stok kuralı düzenleme drawer'ı — `docs/modules/tedarik.md` §1: "Kural düzenleme drawer
 * (min/max/lead/güvenlik/beyaz liste/tedarikçi)". Satır aksiyonundan (`CriticalStockTable`) açılır;
 * dışarıdan kontrol edilen `rule` (null ise kapalı) + `onOpenChange` ile yönetilir.
 */
export function ReorderRuleDrawer({
  rule,
  onOpenChange,
  suppliers,
}: {
  rule: CriticalStockRow | null;
  onOpenChange: (open: boolean) => void;
  suppliers: Array<{ id: string; name: string; code: string }>;
}) {
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      minQty: '0', maxQty: '0', leadTimeDays: '7', safetyDays: '3',
      preferredSupplierId: null, isAutoOrderWhitelisted: false, autoOrderMaxAmount: null, isActive: true,
    },
  });

  useEffect(() => {
    if (!rule) return;
    // Tur 1 P1 bulgusu (kök neden): `autoOrderMaxAmount` her zaman `null`'a resetleniyordu —
    // kullanıcı yalnızca lead time gibi ilgisiz bir alanı değiştirip kaydetse bile mevcut tutar
    // sınırı SESSİZCE kaldırılıp kural "sınırsız otomatik onay"a düşüyordu (beyaz liste + tutar
    // sınırı finansal güvenlik kontrolünü baltalıyordu). `rule.autoOrderMaxAmount` artık gerçekten
    // yükleniyor (bkz. queries.ts `listCriticalStock` — alan CriticalStockRow'a eklendi).
    form.reset({
      minQty: rule.minQty, maxQty: rule.maxQty, leadTimeDays: String(rule.leadTimeDays), safetyDays: String(rule.safetyDays),
      preferredSupplierId: rule.preferredSupplierId, isAutoOrderWhitelisted: rule.isAutoOrderWhitelisted,
      autoOrderMaxAmount: rule.autoOrderMaxAmount, isActive: true,
    });
  }, [rule, form]);

  async function onSubmit(values: FormValues) {
    if (!rule) return;
    const res = await updateReorderRuleAction({
      id: rule.ruleId, minQty: values.minQty, maxQty: values.maxQty,
      leadTimeDays: Number(values.leadTimeDays), safetyDays: Number(values.safetyDays),
      preferredSupplierId: values.preferredSupplierId ?? null, isAutoOrderWhitelisted: values.isAutoOrderWhitelisted,
      autoOrderMaxAmount: values.autoOrderMaxAmount, isActive: values.isActive,
    });
    if (res.ok) {
      toast.success('Kritik stok kuralı güncellendi');
      onOpenChange(false);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  const supplierOptions = suppliers.map((s) => ({ value: s.id, label: s.name, description: s.code }));

  return (
    <Sheet open={rule !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{rule ? `${rule.productName} — kural düzenle` : 'Kural düzenle'}</SheetTitle>
          <SheetDescription>{rule ? `${rule.sku} · ${rule.warehouseCode}` : null}</SheetDescription>
        </SheetHeader>
        {rule ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 px-4 pb-4">
              <div className="grid grid-cols-2 gap-3">
                <FormQty control={form.control} name="minQty" label="Min. stok" required />
                <FormQty control={form.control} name="maxQty" label="Maks. stok" required />
                <FormQty control={form.control} name="leadTimeDays" label="Tedarik süresi" uom="gün" maxDigits={0} required />
                <FormQty control={form.control} name="safetyDays" label="Güvenlik süresi" uom="gün" maxDigits={0} required />
              </div>

              <FormCombobox
                control={form.control}
                name="preferredSupplierId"
                label="Tercihli tedarikçi"
                options={supplierOptions}
                placeholder="Tedarikçi seçin"
                searchPlaceholder="Tedarikçi ara…"
              />

              <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
                <FormSwitch
                  control={form.control}
                  name="isAutoOrderWhitelisted"
                  label="Otomatik siparişe açık (beyaz liste)"
                  description="Tedarikçi de genel beyaz listede olmalı — ikisi de açıksa taslak onaysız gönderilir."
                />
                <FormMoney control={form.control} name="autoOrderMaxAmount" label="Otomatik onay tutar sınırı" description="Boş = sınırsız (yalnızca beyaz liste kontrol eder)." />
                <FormSwitch control={form.control} name="isActive" label="Kural aktif" description="Kapatılırsa kritik stok motoru bu kuralı değerlendirmez." />
              </div>

              <FormActions pending={form.formState.isSubmitting} sticky={false}>
                <SheetClose asChild>
                  <Button type="button" variant="ghost">Vazgeç</Button>
                </SheetClose>
              </FormActions>
            </form>
          </Form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
