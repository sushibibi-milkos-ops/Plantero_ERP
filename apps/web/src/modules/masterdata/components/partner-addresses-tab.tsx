'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, MapPin, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormText, FormSelect, FormCheckbox } from '@/components/form/fields';
import { FormActions } from '@/components/form/form-actions';
import { EmptyState } from '@/components/empty-state';
import { addPartnerAddressAction } from '../actions';

export type AddressRow = { id: string; kind: string; label: string | null; line1: string; line2: string | null; district: string | null; city: string | null; postalCode: string | null; country: string; isDefault: boolean };

const schema = z.object({
  kind: z.enum(['billing', 'shipping', 'both']),
  label: z.string().optional().nullable(),
  line1: z.string().trim().min(2),
  district: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  isDefault: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

const KIND_LABELS: Record<string, string> = { billing: 'Fatura', shipping: 'Sevkiyat', both: 'İkisi' };

export function PartnerAddressesTab({ partnerId, addresses, canManage }: { partnerId: string; addresses: AddressRow[]; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { kind: 'billing', label: '', line1: '', district: '', city: '', postalCode: '', isDefault: addresses.length === 0 } });

  async function onSubmit(values: FormValues) {
    const res = await addPartnerAddressAction({ partnerId, ...values });
    if (res.ok) {
      toast.success('Adres eklendi');
      setOpen(false);
      form.reset({ kind: 'billing', label: '', line1: '', district: '', city: '', postalCode: '', isDefault: false });
    } else toast.error(res.error);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Adresler</div>
        {canManage ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Adres ekle
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adres ekle</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                  <FormSelect
                    control={form.control}
                    name="kind"
                    label="Tür"
                    options={[
                      { value: 'billing', label: 'Fatura' },
                      { value: 'shipping', label: 'Sevkiyat' },
                      { value: 'both', label: 'İkisi' },
                    ]}
                  />
                  <FormText control={form.control} name="label" label="Etiket" placeholder="Ör. Merkez" />
                  <FormText control={form.control} name="line1" label="Adres" required />
                  <div className="grid grid-cols-2 gap-3">
                    <FormText control={form.control} name="district" label="İlçe" />
                    <FormText control={form.control} name="city" label="İl" />
                  </div>
                  <FormText control={form.control} name="postalCode" label="Posta kodu" />
                  <FormCheckbox control={form.control} name="isDefault" label="Varsayılan adres" />
                  <DialogFooter>
                    <FormActions pending={form.formState.isSubmitting} sticky={false} submitLabel="Ekle">
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

      {addresses.length === 0 ? (
        <EmptyState compact title="Adres yok" description="Bu cari için henüz bir adres eklenmedi." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {addresses.map((a) => (
            <div key={a.id} className="rounded-lg border border-border/70 bg-card p-3">
              <div className="flex items-center gap-2 text-[13px] font-medium">
                <MapPin className="size-3.5 text-muted-foreground" />
                {a.label ?? KIND_LABELS[a.kind]}
                {a.isDefault ? <Star className="size-3 fill-primary text-primary" /> : null}
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">
                {a.line1}
                {a.district ? `, ${a.district}` : ''}
                {a.city ? ` / ${a.city}` : ''}
                {a.postalCode ? ` ${a.postalCode}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
