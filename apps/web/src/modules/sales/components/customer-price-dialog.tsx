'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Form, FieldLabel } from '@/components/form/fields';
import { FormMoney, FormQty } from '@/components/form/money-qty';
import { Combobox } from '@/components/form/combobox';
import { upsertCustomerPriceAction } from '../actions';

const schema = z.object({ partnerId: z.string().uuid('Cari seçin'), productId: z.string().uuid('Ürün seçin'), minQty: z.string(), price: z.string().min(1, 'Fiyat girin'), currency: z.string() });

export function CustomerPriceDialog({ customers, products }: { customers: Array<{ id: string; name: string; code: string }>; products: Array<{ id: string; name: string; sku: string }> }) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { partnerId: '', productId: '', minQty: '0', price: '', currency: 'TRY' } });

  const customerOptions = customers.map((c) => ({ value: c.id, label: c.name, description: c.code }));
  const productOptions = products.map((p) => ({ value: p.id, label: p.name, description: p.sku }));

  async function onSubmit(values: z.infer<typeof schema>) {
    const res = await upsertCustomerPriceAction(values);
    if (res.ok) {
      toast.success('Müşteri özel fiyat kaydedildi');
      setOpen(false);
      form.reset({ partnerId: '', productId: '', minQty: '0', price: '', currency: 'TRY' });
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8">
          <Plus className="size-3.5" /> Yeni özel fiyat
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Müşteriye özel fiyat</DialogTitle>
          <DialogDescription>Fiyat listesini ezer; sipariş satırında kaynak &quot;Müşteri özel&quot; olarak görünür.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div className="space-y-1.5">
              <FieldLabel required>Cari</FieldLabel>
              <Combobox value={form.watch('partnerId') || null} onChange={(v) => form.setValue('partnerId', v ?? '', { shouldValidate: true })} options={customerOptions} placeholder="Müşteri seçin" />
            </div>
            <div className="space-y-1.5">
              <FieldLabel required>Ürün</FieldLabel>
              <Combobox value={form.watch('productId') || null} onChange={(v) => form.setValue('productId', v ?? '', { shouldValidate: true })} options={productOptions} placeholder="Ürün seçin" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormQty control={form.control} name="minQty" label="Min. miktar" />
              <FormMoney control={form.control} name="price" label="Fiyat" required />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>Kaydet</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
