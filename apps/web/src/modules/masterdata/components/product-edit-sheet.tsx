'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from '@/components/ui/sheet';
import { Form, FormText, FormTextarea, FormSelect, FormSwitch } from '@/components/form/fields';
import { FormMoney, FormQty } from '@/components/form/money-qty';
import { FormActions } from '@/components/form/form-actions';
import { updateProductAction } from '../actions';
import type { getProductById } from '../queries';

const schema = z.object({
  shortCode: z.string().optional().nullable(),
  category1: z.string().optional().nullable(),
  category2: z.string().optional().nullable(),
  category3: z.string().optional().nullable(),
  variant: z.string().optional().nullable(),
  packaging: z.string().optional().nullable(),
  packQty: z.string(),
  caseBarcode: z.string().optional().nullable(),
  costMethod: z.enum(['lot', 'average', 'standard']),
  isLotTracked: z.boolean(),
  isPurchasable: z.boolean(),
  isSellable: z.boolean(),
  isManufactured: z.boolean(),
  requiresIncomingQc: z.boolean(),
  quarantineDays: z.string(),
  shelfLifeDays: z.string().optional().nullable(),
  vatRate: z.string(),
  purchaseVatRate: z.string(),
  listPrice: z.string(),
  minQty: z.string().optional().nullable(),
  maxQty: z.string().optional().nullable(),
  leadTimeDays: z.string().optional().nullable(),
  hsCode: z.string().optional().nullable(),
  status: z.enum(['active', 'cancelled', 'draft']),
  note: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof schema>;

export function ProductEditSheet({ product }: { product: NonNullable<Awaited<ReturnType<typeof getProductById>>> }) {
  const [open, setOpen] = useState(false);
  const p = product.p;
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      shortCode: p.shortCode,
      category1: p.category1,
      category2: p.category2,
      category3: p.category3,
      variant: p.variant,
      packaging: p.packaging,
      packQty: String(p.packQty),
      caseBarcode: p.caseBarcode,
      costMethod: p.costMethod,
      isLotTracked: p.isLotTracked,
      isPurchasable: p.isPurchasable,
      isSellable: p.isSellable,
      isManufactured: p.isManufactured,
      requiresIncomingQc: p.requiresIncomingQc,
      quarantineDays: String(p.quarantineDays),
      shelfLifeDays: p.shelfLifeDays === null ? null : String(p.shelfLifeDays),
      vatRate: p.vatRate,
      purchaseVatRate: p.purchaseVatRate,
      listPrice: p.listPrice,
      minQty: p.minQty,
      maxQty: p.maxQty,
      leadTimeDays: p.leadTimeDays === null ? null : String(p.leadTimeDays),
      hsCode: p.hsCode,
      status: p.status,
      note: p.note,
    },
  });

  async function onSubmit(values: FormValues) {
    const res = await updateProductAction({ id: p.id, ...values });
    if (res.ok) {
      toast.success('Ürün güncellendi');
      setOpen(false);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="size-4" /> Düzenle
      </Button>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{p.sku} — Ürünü düzenle</SheetTitle>
          <SheetDescription>Ad ve barkod kilitlidir; değiştirmek için kimlik değişikliği gerekir.</SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 px-4 pb-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormText control={form.control} name="shortCode" label="Kısa kod" mono />
              <FormText control={form.control} name="packaging" label="Ambalaj etiketi" />
              <FormQty control={form.control} name="packQty" label="Ambalaj içi adet" maxDigits={0} />
              <FormText control={form.control} name="caseBarcode" label="Koli barkodu" mono />
              <FormText control={form.control} name="category1" label="Kategori 1" />
              <FormText control={form.control} name="category2" label="Kategori 2" />
              <FormText control={form.control} name="category3" label="Kategori 3" />
              <FormText control={form.control} name="variant" label="Varyant" />
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 p-3 sm:grid-cols-4">
              <FormSwitch control={form.control} name="isLotTracked" label="Lot takipli" />
              <FormSwitch control={form.control} name="isPurchasable" label="Satın alınabilir" />
              <FormSwitch control={form.control} name="isSellable" label="Satılabilir" />
              <FormSwitch control={form.control} name="isManufactured" label="Üretilebilir" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormSelect
                control={form.control}
                name="costMethod"
                label="Maliyet yöntemi"
                options={[
                  { value: 'lot', label: 'Lot bazlı' },
                  { value: 'average', label: 'Hareketli ortalama' },
                  { value: 'standard', label: 'Standart maliyet' },
                ]}
              />
              <FormSelect
                control={form.control}
                name="status"
                label="Durum"
                options={[
                  { value: 'active', label: 'Aktif' },
                  { value: 'draft', label: 'Taslak' },
                  { value: 'cancelled', label: 'Kullanım dışı' },
                ]}
              />
              <FormQty control={form.control} name="shelfLifeDays" label="Raf ömrü" uom="gün" maxDigits={0} />
              <FormQty control={form.control} name="leadTimeDays" label="Tedarik süresi" uom="gün" maxDigits={0} />
              <FormSwitch control={form.control} name="requiresIncomingQc" label="Girişte kalite kontrol zorunlu" className="sm:col-span-2" />
              <FormQty control={form.control} name="quarantineDays" label="Karantina süresi" uom="gün" maxDigits={0} />
              <FormText control={form.control} name="hsCode" label="GTİP (HS Code)" mono />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormText control={form.control} name="vatRate" label="Satış KDV %" inputMode="decimal" />
              <FormText control={form.control} name="purchaseVatRate" label="Alış KDV %" inputMode="decimal" />
              <FormMoney control={form.control} name="listPrice" label="Liste fiyatı" />
              <FormQty control={form.control} name="minQty" label="Min. stok" />
              <FormQty control={form.control} name="maxQty" label="Maks. stok" />
            </div>

            <FormTextarea control={form.control} name="note" label="Not" rows={3} />

            <FormActions pending={form.formState.isSubmitting} sticky={false}>
              <SheetClose asChild>
                <Button type="button" variant="ghost">
                  Vazgeç
                </Button>
              </SheetClose>
            </FormActions>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
