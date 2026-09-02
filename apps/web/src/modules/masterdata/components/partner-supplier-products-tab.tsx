'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormCheckbox } from '@/components/form/fields';
import { FormCombobox, type ComboboxOption } from '@/components/form/combobox';
import { FormMoney } from '@/components/form/money-qty';
import { FormActions } from '@/components/form/form-actions';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { upsertSupplierProductAction } from '../actions';

export type PartnerSupplierProductRow = { sp: { id: string; price: string; currency: string; leadTimeDays: number; isPreferred: boolean }; sku: string; name: string };

const schema = z.object({ productId: z.string().uuid('Ürün seçin'), price: z.string().min(1), isPreferred: z.boolean() });
type FormValues = z.infer<typeof schema>;

export function PartnerSupplierProductsTab({ partnerId, rows, productOptions, canManage }: { partnerId: string; rows: PartnerSupplierProductRow[]; productOptions: ComboboxOption[]; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { productId: '', price: '', isPreferred: false } });

  async function onSubmit(values: FormValues) {
    const res = await upsertSupplierProductAction({ partnerId, ...values });
    if (res.ok) {
      toast.success('Ürün fiyatı kaydedildi');
      setOpen(false);
      form.reset({ productId: '', price: '', isPreferred: false });
    } else toast.error(res.error);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Tedarikçi ürünleri</div>
        {canManage ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Ürün ekle
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tedarikçi ürünü ekle</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                  <FormCombobox control={form.control} name="productId" label="Ürün" options={productOptions} placeholder="Ürün seçin" mono required />
                  <FormMoney control={form.control} name="price" label="Fiyat" />
                  <FormCheckbox control={form.control} name="isPreferred" label="Bu ürün için tercih edilen tedarikçi" />
                  <DialogFooter>
                    <FormActions pending={form.formState.isSubmitting} sticky={false} submitLabel="Kaydet">
                      <DialogClose asChild>
                        <Button type="button" variant="ghost">
                          Vazgeç
                        </Button>
                      </DialogClose>
                    </FormActions>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState compact title="Ürün yok" description="Bu tedarikçiden henüz satın alınan bir ürün tanımlı değil." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40 text-[12px] text-muted-foreground">
                <th className="h-9 px-3 text-left font-medium">SKU</th>
                <th className="h-9 px-3 text-left font-medium">Ürün</th>
                <th className="h-9 px-3 text-right font-medium">Fiyat</th>
                <th className="h-9 px-3 text-right font-medium">Tedarik Süresi</th>
                <th className="h-9 px-3 text-center font-medium">Tercih</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sp.id} className="h-9 border-b border-border/50 last:border-0">
                  <td className="px-3 font-mono text-[12px]">{r.sku}</td>
                  <td className="px-3">{r.name}</td>
                  <td className="px-3 text-right">
                    <MoneyCell value={r.sp.price} currency={r.sp.currency} />
                  </td>
                  <td className="px-3 text-right text-muted-foreground">{r.sp.leadTimeDays} gün</td>
                  <td className="px-3 text-center">{r.sp.isPreferred ? <Star className="mx-auto size-3.5 fill-primary text-primary" /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
