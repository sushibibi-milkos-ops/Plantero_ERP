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
import { Form, FormText, FormCheckbox } from '@/components/form/fields';
import { FormCombobox, type ComboboxOption } from '@/components/form/combobox';
import { FormQty, FormMoney } from '@/components/form/money-qty';
import { FormActions } from '@/components/form/form-actions';
import { BomLinesEditor, type ComponentCandidate } from './bom-lines-editor';
import { createBomVersionAction } from '../actions';

const lineSchema = z.object({ productId: z.string().uuid('Bileşen seçin'), qty: z.string().min(1), scrapPct: z.string(), isByproduct: z.boolean() });
const schema = z.object({
  productId: z.string().uuid('Ürün seçin'),
  name: z.string().optional().nullable(),
  outputQty: z.string(),
  expectedYieldPct: z.string(),
  overheadPerBatch: z.string(),
  overheadPerUnit: z.string(),
  activate: z.boolean(),
  lines: z.array(lineSchema).min(1, 'En az bir satır ekleyin'),
});
type FormValues = z.infer<typeof schema>;

export function BomCreateDialog({ productOptions, candidates }: { productOptions: ComboboxOption[]; candidates: ComponentCandidate[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { productId: '', name: '', outputQty: '1', expectedYieldPct: '100', overheadPerBatch: '0', overheadPerUnit: '0', activate: true, lines: [{ productId: '', qty: '1', scrapPct: '0', isByproduct: false }] },
  });

  async function onSubmit(values: FormValues) {
    const uomById = new Map(candidates.map((c) => [c.id, c.uomId]));
    const res = await createBomVersionAction({
      ...values,
      lines: values.lines.map((l) => ({ ...l, uomId: uomById.get(l.productId) ?? '' })),
    });
    if (res.ok) {
      toast.success(`Reçete oluşturuldu: ${res.data.code}`);
      setOpen(false);
      router.push(`/ana-veri/receteler/${res.data.id}`);
    } else toast.error(res.error);
  }

  const outputQty = form.watch('outputQty');
  const expectedYieldPct = form.watch('expectedYieldPct');
  const overheadPerBatch = form.watch('overheadPerBatch');
  const overheadPerUnit = form.watch('overheadPerUnit');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)} className="max-md:h-11">
        <Plus className="size-4" /> Yeni reçete
      </Button>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Yeni reçete</DialogTitle>
          <DialogDescription>Mamul veya yarı mamul bir ürün için versiyon 1 (veya sıradaki) taslak oluşturur.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormCombobox control={form.control} name="productId" label="Ürün" options={productOptions} placeholder="Mamul/yarı mamul seçin" mono required />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <FormText control={form.control} name="name" label="Reçete adı" className="col-span-2" />
              <FormQty control={form.control} name="outputQty" label="Çıktı miktarı" />
              <FormQty control={form.control} name="expectedYieldPct" label="Verim %" maxDigits={2} />
              <FormMoney control={form.control} name="overheadPerBatch" label="Genel gider (parti)" />
              <FormMoney control={form.control} name="overheadPerUnit" label="Genel gider (birim)" />
            </div>

            <BomLinesEditor name="lines" candidates={candidates} outputQty={outputQty} expectedYieldPct={expectedYieldPct} overheadPerBatch={overheadPerBatch} overheadPerUnit={overheadPerUnit} />

            <FormCheckbox control={form.control} name="activate" label="Oluşturulunca aktifleştir (bu ürünün diğer aktif reçetesi varsa arşivlenir)" />

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
