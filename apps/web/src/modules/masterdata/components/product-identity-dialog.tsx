'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ShieldAlert, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormText, FormTextarea } from '@/components/form/fields';
import { FormActions } from '@/components/form/form-actions';
import { changeProductIdentityAction } from '../actions';

const schema = z.object({
  name: z.string().trim().min(2, 'Ürün adı en az 2 karakter'),
  barcode: z.string().trim().optional().nullable(),
  reason: z.string().trim().min(5, 'Gerekçe en az 5 karakter olmalı'),
});
type FormValues = z.infer<typeof schema>;

/** Ad/barkod kilidi — yalnızca admin.settings izniyle, gerekçe zorunlu. Sayfada bu bileşen yalnızca yetkiliye gösterilir. */
export function ProductIdentityDialog({ productId, name, barcode }: { productId: string; name: string; barcode: string | null }) {
  const [open, setOpen] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name, barcode, reason: '' } });

  async function onSubmit(values: FormValues) {
    const res = await changeProductIdentityAction({ id: productId, ...values });
    if (res.ok) {
      toast.success('Ürün adı/barkodu değiştirildi ve denetim kaydına işlendi');
      setOpen(false);
    } else toast.error(res.error);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Tur 9/10 P1 bulgusu: mobilde 172x32 — aynı başlık satırındaki "Düzenle" (44px'e çıkarılmış)
          ile aynı satırda iki farklı dokunma hedefi yüksekliği. `max-md:h-11` diğer başlık eylemleriyle
          (ör. segments-table.tsx AddSegmentButton) aynı kalıp — ≥md'de görsel yükseklik (h-8) korunur. */}
      <Button variant="ghost" size="sm" className="max-md:h-11 text-muted-foreground" onClick={() => setOpen(true)}>
        <ShieldAlert className="size-3.5" /> Ad/barkod değiştir
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="size-4 text-warning" /> Kilitli alanı değiştir
          </DialogTitle>
          <DialogDescription>
            Ürün adı ve barkod oluşturulduktan sonra normalde kilitlidir. Bu değişiklik denetim kaydına gerekçesiyle işlenir.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <FormText control={form.control} name="name" label="Ürün adı" required />
            <FormText control={form.control} name="barcode" label="Barkod" mono />
            <FormTextarea control={form.control} name="reason" label="Gerekçe" required rows={2} placeholder="Ör. Excel'de yazım hatası tespit edildi" />
            <DialogFooter>
              <FormActions pending={form.formState.isSubmitting} sticky={false} submitLabel="Değiştir">
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
  );
}
