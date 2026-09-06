'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormText, FormSelect } from '@/components/form/fields';
import { FormActions } from '@/components/form/form-actions';
import { createPlanAction } from '../actions';
import type { AssigneeOption } from '../queries';

const schema = z.object({
  machineId: z.string().uuid('Makine seçin'),
  name: z.string().trim().min(1, 'Plan adı gerekli'),
  intervalValue: z.string().min(1, 'Aralık gerekli'),
  intervalUnit: z.enum(['day', 'week', 'month', 'runtime_hours']),
  estimatedMinutes: z.string().min(1),
  assigneeId: z.string().uuid().optional().nullable(),
  checklist: z.array(z.object({ value: z.string().trim().min(1, 'Boş bırakılamaz') })),
});
type FormValues = z.infer<typeof schema>;

const UNIT_OPTIONS = [
  { value: 'day', label: 'Gün' },
  { value: 'week', label: 'Hafta' },
  { value: 'month', label: 'Ay' },
  { value: 'runtime_hours', label: 'Çalışma saati (elle üretilir)' },
];

export function PlanForm({ machines, assignees }: { machines: Array<{ id: string; code: string; name: string }>; assignees: AssigneeOption[] }) {
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { machineId: '', name: '', intervalValue: '30', intervalUnit: 'day', estimatedMinutes: '60', assigneeId: null, checklist: [{ value: '' }] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'checklist' });

  const machineOptions = machines.map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` }));
  const assigneeOptions = [{ value: '', label: 'Atanmamış' }, ...assignees.map((a) => ({ value: a.id, label: a.fullName }))];

  async function onSubmit(values: FormValues) {
    const res = await createPlanAction({
      machineId: values.machineId, name: values.name, intervalValue: Number(values.intervalValue), intervalUnit: values.intervalUnit,
      estimatedMinutes: Number(values.estimatedMinutes), assigneeId: values.assigneeId || null,
      checklist: values.checklist.map((c) => c.value).filter(Boolean),
    });
    if (res.ok) {
      toast.success('Bakım planı oluşturuldu');
      router.push('/bakim/planlar');
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-[calc(9rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="rounded-xl border border-border/70 bg-card p-4">
          <h2 className="mb-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Plan</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormSelect control={form.control} name="machineId" label="Makine" required options={machineOptions} className="sm:col-span-2" />
            <FormText control={form.control} name="name" label="Plan adı" required placeholder="Haftalık yağlama" className="sm:col-span-2" />
            <FormText control={form.control} name="intervalValue" label="Aralık" required type="number" inputMode="numeric" />
            <FormSelect control={form.control} name="intervalUnit" label="Birim" required options={UNIT_OPTIONS} />
            <FormText control={form.control} name="estimatedMinutes" label="Tahmini süre (dk)" required type="number" inputMode="numeric" />
            <FormSelect control={form.control} name="assigneeId" label="Sorumlu" options={assigneeOptions} />
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Kontrol listesi</h2>
            <Button type="button" variant="outline" size="sm" onClick={() => append({ value: '' })}>
              <Plus className="size-4" /> Kalem ekle
            </Button>
          </div>
          <div className="space-y-2">
            {fields.map((field, i) => (
              <div key={field.id} className="flex items-center gap-2">
                <Input {...form.register(`checklist.${i}.value`)} placeholder={`Kontrol kalemi ${i + 1}`} className="h-11 text-[13px] md:h-9" />
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} disabled={fields.length <= 1} aria-label="Kaldır">
                  <Trash2 className="size-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
          {form.formState.errors.checklist ? <p className="mt-2 text-xs text-destructive">Boş kontrol kalemi bırakmayın.</p> : null}
        </div>

        <FormActions submitLabel="Planı oluştur" onCancel={() => router.back()} pending={form.formState.isSubmitting} />
      </form>
    </Form>
  );
}
