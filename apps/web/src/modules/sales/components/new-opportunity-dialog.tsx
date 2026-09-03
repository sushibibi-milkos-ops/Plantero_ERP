'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Form, FormText, FormSelect, FieldLabel } from '@/components/form/fields';
import { FormMoney } from '@/components/form/money-qty';
import { FormDate } from '@/components/form/date-field';
import { Combobox } from '@/components/form/combobox';
import { createOpportunityAction } from '../actions';
import type { opportunityStages } from '@plantero/db';

const schema = z.object({
  title: z.string().trim().min(2, 'Başlık gerekli'),
  partnerId: z.string().optional().nullable(),
  channelId: z.string().optional().nullable(),
  stageId: z.string().min(1),
  expectedAmount: z.string().min(1, 'Tutar girin'),
  expectedCloseDate: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
});

export function NewOpportunityDialog({
  stages, customers, channels,
}: {
  stages: Array<typeof opportunityStages.$inferSelect>;
  customers: Array<{ id: string; name: string; code: string }>;
  channels: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', partnerId: null, channelId: null, stageId: stages[0]?.id ?? '', expectedAmount: '', expectedCloseDate: '', source: '' },
  });

  const customerOptions = customers.map((c) => ({ value: c.id, label: c.name, description: c.code }));
  const channelOptions = channels.map((c) => ({ value: c.id, label: c.name }));
  const stageOptions = stages.map((s) => ({ value: s.id, label: s.name }));

  async function onSubmit(values: z.infer<typeof schema>) {
    const res = await createOpportunityAction({ ...values, currency: 'TRY' });
    if (res.ok) {
      toast.success(`Fırsat oluşturuldu: ${res.data.docNo}`);
      setOpen(false);
      form.reset({ title: '', partnerId: null, channelId: null, stageId: stages[0]?.id ?? '', expectedAmount: '', expectedCloseDate: '', source: '' });
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Yeni fırsat
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Yeni fırsat</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <FormText control={form.control} name="title" label="Başlık" required placeholder="ör. Yeni market anlaşması" />
            <div className="space-y-1.5">
              <FieldLabel>Cari (varsa)</FieldLabel>
              <Combobox value={form.watch('partnerId')} onChange={(v) => form.setValue('partnerId', v)} options={customerOptions} placeholder="Müşteri seçin" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormSelect control={form.control} name="stageId" label="Aşama" required options={stageOptions} />
              <div className="space-y-1.5">
                <FieldLabel>Kanal</FieldLabel>
                <Combobox value={form.watch('channelId')} onChange={(v) => form.setValue('channelId', v)} options={channelOptions} placeholder="Kanal seçin" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormMoney control={form.control} name="expectedAmount" label="Beklenen tutar" required />
              <FormDate control={form.control} name="expectedCloseDate" label="Beklenen kapanış" />
            </div>
            <FormText control={form.control} name="source" label="Kaynak" placeholder="web, referans, fuar…" />
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>Oluştur</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
