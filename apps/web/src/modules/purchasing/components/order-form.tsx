'use client';

import { useMemo } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { MoneyCell } from '@/components/money-cell';
import { Form, FormText, FieldLabel } from '@/components/form/fields';
import { FormMoney, FormQty } from '@/components/form/money-qty';
import { FormDate } from '@/components/form/date-field';
import { Combobox } from '@/components/form/combobox';
import { FormActions } from '@/components/form/form-actions';
// Alt-yol içe aktarımı ('@plantero/core/money', barrel değil): kök giriş noktası node:crypto kullanan
// sunucu-yalnızca auth/session.ts'i de dışa aktarıyor — 'use client' bileşeninde barrel'dan import
// tarayıcı paketini kırar (bkz. critical-stock-table.tsx aynı düzeltme).
import { D } from '@plantero/core/money';
import { createPurchaseOrderAction } from '../actions';
import type { PurchaseProductPickerRow } from '../queries';

const lineSchema = z.object({
  productId: z.string().uuid('Ürün seçin'),
  qty: z.string().min(1, 'Miktar girin'),
  uomId: z.string().uuid(),
  unitPrice: z.string().min(1, 'Birim fiyat girin'),
  expectedDate: z.string().optional().nullable(),
});

const schema = z.object({
  partnerId: z.string().uuid('Tedarikçi seçin'),
  warehouseId: z.string().uuid('Depo seçin'),
  expectedDate: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1, 'En az bir satır ekleyin'),
});

type FormValues = z.infer<typeof schema>;

export function PurchaseOrderForm({
  warehouses,
  suppliers,
  products,
}: {
  warehouses: Array<{ id: string; code: string; name: string }>;
  suppliers: Array<{ id: string; name: string; code: string }>;
  products: PurchaseProductPickerRow[];
}) {
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      warehouseId: warehouses.find((w) => w.code === 'TIRE')?.id ?? warehouses[0]?.id ?? '',
      partnerId: '', expectedDate: '', note: '', lines: [],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' });
  const watchedPartnerId = form.watch('partnerId');
  const watchedLines = form.watch('lines');

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const warehouseOptions = useMemo(() => warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })), [warehouses]);
  const supplierOptions = useMemo(() => suppliers.map((s) => ({ value: s.id, label: s.name, description: s.code })), [suppliers]);
  // Seçilen tedarikçinin ürünleri önce (fiyat/lead time tanımlı) — geri kalanı arama ile bulunabilir.
  const productOptions = useMemo(() => {
    const sorted = [...products].sort((a, b) => {
      const aPref = a.preferredSupplierId === watchedPartnerId ? 0 : 1;
      const bPref = b.preferredSupplierId === watchedPartnerId ? 0 : 1;
      return aPref - bPref;
    });
    return sorted.map((p) => ({ value: p.id, label: p.name, description: p.sku, keywords: [p.sku] }));
  }, [products, watchedPartnerId]);

  function addLine(product: PurchaseProductPickerRow) {
    const priced = product.preferredSupplierId === watchedPartnerId ? product.lastPrice : null;
    append({ productId: product.id, qty: '', uomId: product.uomId, unitPrice: priced ?? '0', expectedDate: '' });
  }

  async function onSubmit(values: FormValues) {
    const res = await createPurchaseOrderAction(values);
    if (res.ok) {
      toast.success(`Satın alma siparişi oluşturuldu: ${res.data.docNo}`);
      router.push(`/satin-alma/siparisler/${res.data.id}`);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0">
        <div className="max-w-3xl">
          {/* Tur 1 P1 tedarik-yeni-02 kök neden: bölüm başlığı ve alan etiketi (FieldLabel,
           * fields.tsx) aynı 13px kademedeydi, aralarındaki tek fark font-weight'ti — tarama
           * sırasında bölüm sınırı görünmüyordu. Uygulamanın yerleşik micro-label kalıbına
           * geçildi (bkz. product-wizard.tsx, create-work-order-form.tsx aynı 11px/uppercase). */}
          <h2 className="mb-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Sipariş başlığı</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <FieldLabel required>Tedarikçi</FieldLabel>
              <Controller control={form.control} name="partnerId" render={({ field }) => <Combobox value={field.value} onChange={(v) => field.onChange(v ?? '')} options={supplierOptions} placeholder="Tedarikçi seçin" clearable={false} />} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel required>Depo</FieldLabel>
              <Controller control={form.control} name="warehouseId" render={({ field }) => <Combobox value={field.value} onChange={(v) => field.onChange(v ?? '')} options={warehouseOptions} placeholder="Depo seçin" clearable={false} />} />
            </div>
            <FormDate control={form.control} name="expectedDate" label="Beklenen teslim tarihi" />
            <FormText control={form.control} name="note" label="Not" />
          </div>
        </div>

        {/* Tur 1 P1 tedarik-yeni-03 kök neden: bu bölümün hairline'ı ve altındaki FormActions
         * şeridi max-w vermeden formun (sınırsız genişlikte) tüm konteynerini kat ediyordu; alan
         * ızgarası ise (yukarıdaki blok) max-w-3xl'e sabitti — sayfa iki farklı ölçü sistemine
         * yaslanıyordu. Aynı max-w-3xl burada da uygulanıyor. */}
        <div className="max-w-3xl border-t border-border/60 pt-5">
          <h2 className="mb-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Satırlar</h2>
          <div className="max-w-lg space-y-1.5">
            <FieldLabel>Ürün ekle (arama ile)</FieldLabel>
            <Combobox value={null} onChange={(id) => { const p = id ? productById.get(id) : undefined; if (p) addLine(p); }} options={productOptions} placeholder="Ürün ara ve ekle…" clearable={false} />
          </div>

          {form.formState.errors.lines?.message ? <p className="mt-2 text-xs text-destructive">{form.formState.errors.lines.message}</p> : null}

          <div className="mt-4 space-y-3">
            {fields.map((field, index) => {
              const product = productById.get(watchedLines[index]?.productId ?? '');
              // Tur 1 P1 tedarik-yeni-01 kök neden: `Number(qty) * Number(unitPrice)` float çarpımı +
              // elle yazılmış '₺' öneki — ortak MoneyCell/decimal.js (D) devre dışıydı (CLAUDE.md
              // kural 4). Satır tutarı artık sunucunun `postJournalEntry`/sipariş toplamıyla AYNI
              // decimal.js yolundan (D().mul()) geçiyor ve MoneyCell ile basılıyor.
              const lineTotal = D(watchedLines[index]?.qty || 0).mul(D(watchedLines[index]?.unitPrice || 0));
              return (
                <div key={field.id} className="rounded-lg border border-border/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{product?.name ?? '—'}</div>
                      <div className="font-mono text-xs text-muted-foreground">{product?.sku}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <MoneyCell value={lineTotal.toString()} className="text-[13px] text-muted-foreground" />
                      <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} aria-label="Satırı sil" className="size-8 shrink-0 text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <FormQty control={form.control} name={`lines.${index}.qty`} label="Miktar" required uom={product?.uomCode} />
                    <FormMoney control={form.control} name={`lines.${index}.unitPrice`} label="Birim fiyat" required />
                    <FormDate control={form.control} name={`lines.${index}.expectedDate`} label="Beklenen tarih" />
                  </div>
                </div>
              );
            })}
            {fields.length === 0 ? (
              <EmptyState compact icon={ShoppingBag} title="Henüz satır yok" description="Ürün arayarak satır ekleyin." />
            ) : null}
          </div>
        </div>

        {/* max-w-3xl: aynı tedarik-yeni-03 düzeltmesi — masaüstünde aksiyon şeridinin üst hairline'ı
         * alan ızgarasıyla aynı sağ kenarda bitsin. Mobilde (<768px) sınırsız kalır; FormActions'ın
         * kendi `-mx-4` yapışkan-şerit taşması bu sarmalayıcının GENİŞLİĞİNE göre değil dış sayfa
         * kenar boşluğuna göre çalışmaya devam eder (bu div'in kendi yatay padding'i yok). */}
        <div className="max-w-3xl">
          <FormActions submitLabel="Sipariş oluştur" onCancel={() => router.back()} pending={form.formState.isSubmitting} disabled={fields.length === 0}>
            <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
              <ShoppingBag className="size-3.5" /> {fields.length} satır
            </span>
          </FormActions>
        </div>
      </form>
    </Form>
  );
}
