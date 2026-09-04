'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form, FormText, FormSelect, FormCheckbox } from '@/components/form/fields';
import { Combobox } from '@/components/form/combobox';
import { FormActions } from '@/components/form/form-actions';
import { FieldLabel } from '@/components/form/fields';
import { createTemplateAction, updateTemplateAction } from '../actions';

const itemSchema = z.object({
  name: z.string().min(1, 'Kalem adı gerekli'),
  kind: z.enum(['numeric', 'boolean', 'text', 'document']),
  minValue: z.string().optional(),
  maxValue: z.string().optional(),
  unit: z.string().optional(),
  isCritical: z.boolean().optional(),
});

const schema = z.object({
  code: z.string().min(2, 'Kod gerekli'),
  name: z.string().min(2, 'Ad gerekli'),
  productId: z.string().uuid().optional().nullable(),
  productType: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  items: z.array(itemSchema).min(1, 'En az bir kalem ekleyin'),
});
type FormValues = z.infer<typeof schema>;

const KIND_OPTIONS = [
  { value: 'numeric', label: 'Sayısal (min/max)' },
  { value: 'boolean', label: 'Evet / Hayır' },
  { value: 'text', label: 'Metin' },
  { value: 'document', label: 'Belge' },
];
const PRODUCT_TYPE_OPTIONS = [
  { value: 'all', label: 'Tümü' },
  { value: 'raw_material', label: 'Hammadde' },
  { value: 'packaging', label: 'Ambalaj' },
  { value: 'semi_finished', label: 'Yarı mamul' },
  { value: 'finished', label: 'Mamul' },
];

export function TemplateForm({
  mode, initial, products,
}: {
  mode: 'create' | 'edit';
  initial?: { id: string } & FormValues;
  products: Array<{ id: string; sku: string; name: string }>;
}) {
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial ?? { code: '', name: '', productId: null, productType: 'all', isActive: true, items: [{ name: '', kind: 'numeric', minValue: '', maxValue: '', unit: '', isCritical: false }] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });
  const productOptions = products.map((p) => ({ value: p.id, label: p.name, description: p.sku }));

  async function onSubmit(values: FormValues) {
    const payload = { ...values, productType: values.productType === 'all' ? null : values.productType };
    const res = mode === 'create' ? await createTemplateAction(payload) : await updateTemplateAction({ id: initial!.id, ...payload });
    if (res.ok) { toast.success(mode === 'create' ? 'Şablon oluşturuldu' : 'Şablon güncellendi'); router.push('/kalite/sablonlar'); router.refresh(); }
    else toast.error(res.error);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormText control={form.control} name="code" label="Kod" required placeholder="ör. KURUYEMIS" mono />
          <FormText control={form.control} name="name" label="Ad" required placeholder="ör. Kuruyemiş Girdi Kontrolü" />
          <div className="space-y-1.5">
            <FieldLabel>Belirli ürün (opsiyonel)</FieldLabel>
            <Combobox value={form.watch('productId') ?? null} onChange={(v) => form.setValue('productId', v)} options={productOptions} placeholder="Tüm ürünler" searchPlaceholder="Ürün ara…" />
          </div>
          <FormSelect control={form.control} name="productType" label="Ürün tipi (opsiyonel)" options={PRODUCT_TYPE_OPTIONS} placeholder="Tümü" />
          <FormCheckbox control={form.control} name="isActive" label="Aktif" />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Kontrol kalemleri</h2>
            <Button type="button" variant="outline" size="sm" onClick={() => append({ name: '', kind: 'numeric', minValue: '', maxValue: '', unit: '', isCritical: false })}>
              <Plus className="size-3.5" /> Kalem ekle
            </Button>
          </div>
          {fields.map((f, i) => {
            const kind = form.watch(`items.${i}.kind`);
            return (
              <div key={f.id} className="grid grid-cols-1 gap-3 rounded-lg border border-border/60 p-3 sm:grid-cols-12 sm:items-end">
                <FormText control={form.control} name={`items.${i}.name`} label="Kalem adı" className="sm:col-span-4" placeholder="ör. Nem %" />
                <FormSelect control={form.control} name={`items.${i}.kind`} label="Tür" options={KIND_OPTIONS} className="sm:col-span-3" />
                {kind === 'numeric' ? (
                  <>
                    <FormText control={form.control} name={`items.${i}.minValue`} label="Min" className="sm:col-span-1" inputMode="decimal" />
                    <FormText control={form.control} name={`items.${i}.maxValue`} label="Max" className="sm:col-span-1" inputMode="decimal" />
                    <FormText control={form.control} name={`items.${i}.unit`} label="Birim" className="sm:col-span-1" placeholder="%" />
                  </>
                ) : (
                  <div className="sm:col-span-3" />
                )}
                <div className="flex items-center justify-between gap-2 sm:col-span-2">
                  <FormCheckbox control={form.control} name={`items.${i}.isCritical`} label="Kritik" />
                  <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => fields.length > 1 && remove(i)} disabled={fields.length <= 1}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <FormActions submitLabel={mode === 'create' ? 'Şablonu Oluştur' : 'Kaydet'} onCancel={() => router.push('/kalite/sablonlar')} pending={form.formState.isSubmitting} />
      </form>
    </Form>
  );
}
