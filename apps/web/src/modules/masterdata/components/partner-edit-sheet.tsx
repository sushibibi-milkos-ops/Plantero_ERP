'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from '@/components/ui/sheet';
import { Form, FormText, FormSelect, FormSwitch, FormTextarea } from '@/components/form/fields';
import { FormMoney } from '@/components/form/money-qty';
import { FormActions } from '@/components/form/form-actions';
import { updatePartnerAction } from '../actions';
import type { getPartnerById } from '../queries';

const schema = z.object({
  name: z.string().trim().min(2),
  taxNumber: z.string().optional().nullable(),
  taxOffice: z.string().optional().nullable(),
  isEInvoiceRegistered: z.boolean(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  paymentTermKind: z.enum(['cash', 'days', 'marketplace_cycle']),
  paymentTermDays: z.string(),
  creditLimit: z.string().optional().nullable(),
  supplierLeadTimeDays: z.string().optional().nullable(),
  isPurchaseWhitelisted: z.boolean(),
  isActive: z.boolean(),
  note: z.string().optional().nullable(),
});
type FormValues = z.infer<typeof schema>;

export function PartnerEditSheet({ partner }: { partner: NonNullable<Awaited<ReturnType<typeof getPartnerById>>> }) {
  const [open, setOpen] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: partner.name,
      taxNumber: partner.taxNumber,
      taxOffice: partner.taxOffice,
      isEInvoiceRegistered: partner.isEInvoiceRegistered,
      email: partner.email,
      phone: partner.phone,
      whatsapp: partner.whatsapp,
      paymentTermKind: partner.paymentTermKind,
      paymentTermDays: String(partner.paymentTermDays),
      creditLimit: partner.creditLimit,
      supplierLeadTimeDays: partner.supplierLeadTimeDays === null ? null : String(partner.supplierLeadTimeDays),
      isPurchaseWhitelisted: partner.isPurchaseWhitelisted,
      isActive: partner.isActive,
      note: partner.note,
    },
  });

  async function onSubmit(values: FormValues) {
    const res = await updatePartnerAction({ id: partner.id, ...values });
    if (res.ok) {
      toast.success('Cari güncellendi');
      setOpen(false);
    } else toast.error(res.error);
  }

  const showSupplierFields = partner.kind === 'supplier' || partner.kind === 'both';

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="size-4" /> Düzenle
      </Button>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{partner.code} — Cariyi düzenle</SheetTitle>
          <SheetDescription>Kod ve cari tipi değiştirilemez.</SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3 px-4 pb-4">
            <FormText control={form.control} name="name" label="Ad / Unvan" required />
            <div className="grid grid-cols-2 gap-3">
              <FormText control={form.control} name="taxNumber" label="VKN / TCKN" inputMode="numeric" />
              <FormText control={form.control} name="taxOffice" label="Vergi dairesi" />
            </div>
            <FormSwitch control={form.control} name="isEInvoiceRegistered" label="e-Fatura mükellefi" />
            <div className="grid grid-cols-2 gap-3">
              <FormText control={form.control} name="email" label="E-posta" type="email" />
              <FormText control={form.control} name="phone" label="Telefon" />
            </div>
            <FormText control={form.control} name="whatsapp" label="WhatsApp" />
            <div className="grid grid-cols-2 gap-3">
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
              <FormText control={form.control} name="paymentTermDays" label="Vade (gün)" inputMode="numeric" />
            </div>
            <FormMoney control={form.control} name="creditLimit" label="Kredi limiti" />
            {showSupplierFields ? (
              <>
                <FormText control={form.control} name="supplierLeadTimeDays" label="Tedarik süresi (gün)" inputMode="numeric" />
                <FormSwitch control={form.control} name="isPurchaseWhitelisted" label="Satın almaya onaylı tedarikçi" />
              </>
            ) : null}
            <FormSwitch control={form.control} name="isActive" label="Aktif" />
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
