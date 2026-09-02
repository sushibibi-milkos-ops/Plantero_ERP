'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormText, FormSelect } from '@/components/form/fields';
import { FormActions } from '@/components/form/form-actions';
import { createPartnerAction } from '../actions';

const schema = z.object({
  name: z.string().trim().min(2, 'Ad en az 2 karakter'),
  kind: z.enum(['customer', 'supplier', 'both', 'bank', 'other']),
  taxNumber: z.string().trim().optional().nullable(),
  taxOffice: z.string().trim().optional().nullable(),
  email: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  paymentTermKind: z.enum(['cash', 'days', 'marketplace_cycle']),
  paymentTermDays: z.string(),
});
type FormValues = z.infer<typeof schema>;

export function PartnerCreateDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', kind: 'customer', taxNumber: '', taxOffice: '', email: '', phone: '', paymentTermKind: 'cash', paymentTermDays: '0' },
  });

  async function onSubmit(values: FormValues) {
    const res = await createPartnerAction(values);
    if (res.ok) {
      toast.success(`Cari oluşturuldu: ${res.data.code}`);
      setOpen(false);
      router.push(`/ana-veri/cariler/${res.data.id}`);
    } else toast.error(res.error);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Yeni cari
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yeni cari</DialogTitle>
          <DialogDescription>Kod otomatik üretilir (müşteri C-000001, tedarikçi S-000001 biçiminde).</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <FormText control={form.control} name="name" label="Ad / Unvan" required />
            <div className="grid grid-cols-2 gap-3">
              <FormSelect
                control={form.control}
                name="kind"
                label="Tip"
                options={[
                  { value: 'customer', label: 'Müşteri' },
                  { value: 'supplier', label: 'Tedarikçi' },
                  { value: 'both', label: 'Müşteri + Tedarikçi' },
                  { value: 'bank', label: 'Banka' },
                  { value: 'other', label: 'Diğer' },
                ]}
              />
              <FormSelect
                control={form.control}
                name="paymentTermKind"
                label="Vade türü"
                options={[
                  { value: 'cash', label: 'Peşin' },
                  { value: 'days', label: 'Vadeli (gün)' },
                  { value: 'marketplace_cycle', label: 'Pazaryeri hakediş' },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormText control={form.control} name="taxNumber" label="VKN / TCKN" inputMode="numeric" />
              <FormText control={form.control} name="paymentTermDays" label="Vade (gün)" inputMode="numeric" />
            </div>
            <FormText control={form.control} name="taxOffice" label="Vergi dairesi" />
            <div className="grid grid-cols-2 gap-3">
              <FormText control={form.control} name="email" label="E-posta" type="email" />
              <FormText control={form.control} name="phone" label="Telefon" />
            </div>
            <DialogFooter>
              <FormActions pending={form.formState.isSubmitting} sticky={false} submitLabel="Oluştur">
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
