'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormCheckbox } from '@/components/form/fields';
import { FormCombobox, type ComboboxOption } from '@/components/form/combobox';
import { FormMoney, FormQty } from '@/components/form/money-qty';
import { FormActions } from '@/components/form/form-actions';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { formatQty } from '@/lib/format';
import { upsertSupplierProductAction } from '../actions';

export type SupplierProductRow = { sp: { id: string; price: string; currency: string; leadTimeDays: number; minOrderQty: string; isPreferred: boolean }; partnerCode: string; partnerName: string; leadTimeDays: number | null };

const schema = z.object({ partnerId: z.string().uuid('Tedarikçi seçin'), price: z.string().min(1), leadTimeDays: z.string(), minOrderQty: z.string(), isPreferred: z.boolean() });
type FormValues = z.infer<typeof schema>;

export function ProductSuppliersTab({ productId, suppliers, supplierOptions, canManage }: { productId: string; suppliers: SupplierProductRow[]; supplierOptions: ComboboxOption[]; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { partnerId: '', price: '', leadTimeDays: '7', minOrderQty: '0', isPreferred: suppliers.length === 0 } });

  async function onSubmit(values: FormValues) {
    const res = await upsertSupplierProductAction({ productId, ...values });
    if (res.ok) {
      toast.success('Tedarikçi fiyatı kaydedildi');
      setOpen(false);
      form.reset({ partnerId: '', price: '', leadTimeDays: '7', minOrderQty: '0', isPreferred: false });
    } else toast.error(res.error);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Tedarikçiler</div>
        {canManage ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Tedarikçi ekle
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tedarikçi ürünü ekle/güncelle</DialogTitle>
                <DialogDescription>Aynı tedarikçi tekrar seçilirse fiyatı güncellenir.</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                  <FormCombobox control={form.control} name="partnerId" label="Tedarikçi" options={supplierOptions} placeholder="Tedarikçi seçin" required />
                  <div className="grid grid-cols-2 gap-3">
                    <FormMoney control={form.control} name="price" label="Fiyat" />
                    <FormQty control={form.control} name="leadTimeDays" label="Tedarik süresi" uom="gün" maxDigits={0} />
                  </div>
                  <FormQty control={form.control} name="minOrderQty" label="Min. sipariş miktarı" />
                  <FormCheckbox control={form.control} name="isPreferred" label="Tercih edilen tedarikçi (maliyet hesabında kullanılır)" />
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

      {suppliers.length === 0 ? (
        <EmptyState compact title="Tedarikçi yok" description="Bu ürün için henüz bir tedarikçi tanımlı değil." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40 text-[12px] text-muted-foreground">
                  <th className="h-9 px-3 text-left font-medium">Tedarikçi</th>
                  <th className="h-9 px-3 text-right font-medium">Fiyat</th>
                  <th className="h-9 px-3 text-right font-medium">Tedarik Süresi</th>
                  <th className="h-9 px-3 text-right font-medium">Min. Sipariş</th>
                  <th className="h-9 px-3 text-center font-medium">Tercih</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.sp.id} className="h-9 border-b border-border/50 last:border-0">
                    <td className="px-3">
                      {s.partnerName} <span className="font-mono text-[11px] text-muted-foreground">({s.partnerCode})</span>
                    </td>
                    <td className="px-3 text-right">
                      <MoneyCell value={s.sp.price} currency={s.sp.currency} />
                    </td>
                    <td className="px-3 text-right text-muted-foreground">{s.sp.leadTimeDays} gün</td>
                    <td className="px-3 text-right text-muted-foreground">{formatQty(s.sp.minOrderQty)}</td>
                    <td className="px-3 text-center">{s.sp.isPreferred ? <Star className="mx-auto size-3.5 fill-primary text-primary" /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
