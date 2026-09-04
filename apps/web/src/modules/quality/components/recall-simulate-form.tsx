'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Form, FormTextarea, FormSelect, FieldLabel } from '@/components/form/fields';
import { Combobox } from '@/components/form/combobox';
import { FormActions } from '@/components/form/form-actions';
import { searchTraceEntitiesAction, simulateRecallAction } from '../actions';

const schema = z.object({ rootLotId: z.string().uuid('Lot seçin'), direction: z.enum(['forward', 'backward', 'both']), reason: z.string().trim().min(3, 'Gerekçe gerekli') });
type FormValues = z.infer<typeof schema>;

const DIRECTION_OPTIONS = [
  { value: 'both', label: 'Her iki yön (kaynak + varış)' },
  { value: 'forward', label: 'Yalnızca ileri (varış — sevkiyat/müşteri)' },
  { value: 'backward', label: 'Yalnızca geri (kaynak — mal kabul/tedarikçi)' },
];

export function RecallSimulateForm() {
  const router = useRouter();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { rootLotId: '', direction: 'both', reason: '' } });

  async function onSearch(q: string) {
    if (q.trim().length < 2) return [];
    const res = await searchTraceEntitiesAction({ q });
    if (!res.ok) return [];
    return res.data.filter((r) => r.kind === 'lot').map((r) => ({ value: r.id, label: r.label, description: r.sub }));
  }

  async function onSubmit(values: FormValues) {
    const res = await simulateRecallAction(values);
    if (res.ok) { toast.success(`Geri çağırma simülasyonu ${res.data.docNo} oluşturuldu`); router.push(`/kalite/geri-cagirma/${res.data.id}`); router.refresh(); }
    else toast.error(res.error);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <FieldLabel required>Kök lot</FieldLabel>
          <Combobox
            value={form.watch('rootLotId') || null}
            onChange={(v) => form.setValue('rootLotId', v ?? '')}
            options={[]}
            onSearch={onSearch}
            placeholder="Lot no ara…"
            searchPlaceholder="Lot no yazın (en az 2 karakter)"
          />
          {form.formState.errors.rootLotId ? <p className="text-xs text-destructive">{form.formState.errors.rootLotId.message}</p> : null}
        </div>
        <FormSelect control={form.control} name="direction" label="Yön" options={DIRECTION_OPTIONS} />
        <FormTextarea control={form.control} name="reason" label="Gerekçe" required placeholder="ör. Aflatoksin şüphesi, yabancı madde bildirimi…" />
        <FormActions submitLabel="Etkiyi Simüle Et" sticky={false} pending={form.formState.isSubmitting} />
      </form>
    </Form>
  );
}
