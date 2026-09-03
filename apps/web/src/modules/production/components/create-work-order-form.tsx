'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Form, FormSelect, FieldLabel } from '@/components/form/fields';
import { FormQty } from '@/components/form/money-qty';
import { FormDate } from '@/components/form/date-field';
import { Combobox } from '@/components/form/combobox';
import { FormActions } from '@/components/form/form-actions';
import { QtyCell } from '@/components/qty-cell';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { cn } from '@/lib/utils';
import { createWorkOrderAction, previewMaterialsAction, type MaterialPreviewLine } from '../actions';
import type { ManufacturableProductRow, LineOption } from '../queries';

const schema = z.object({
  productId: z.string().uuid('Ürün seçin'),
  bomId: z.string().uuid(),
  plannedQty: z.string().min(1, 'Miktar girin'),
  lineId: z.string().uuid('Hat seçin'),
  warehouseId: z.string().uuid('Depo seçin'),
  plannedStart: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});
type FormValues = z.infer<typeof schema>;

export function CreateWorkOrderForm({
  products,
  lines,
  warehouses,
}: {
  products: ManufacturableProductRow[];
  lines: LineOption[];
  warehouses: Array<{ id: string; code: string; name: string }>;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<MaterialPreviewLine[] | null>(null);
  const [previewPending, startPreview] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      productId: '', bomId: '', plannedQty: '', lineId: '',
      warehouseId: warehouses.find((w) => w.code === 'TIRE')?.id ?? warehouses[0]?.id ?? '',
      plannedStart: '', note: '',
    },
  });

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const productOptions = useMemo(() => products.map((p) => ({ value: p.id, label: p.name, description: p.sku, keywords: [p.sku] })), [products]);
  const lineOptions = useMemo(() => lines.map((l) => ({ value: l.id, label: `${l.code} — ${l.name}` })), [lines]);
  const warehouseOptions = useMemo(() => warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })), [warehouses]);

  const productId = form.watch('productId');
  const bomId = form.watch('bomId');
  const plannedQty = form.watch('plannedQty');
  const warehouseId = form.watch('warehouseId');

  useEffect(() => {
    const p = productId ? productById.get(productId) : undefined;
    if (p) {
      form.setValue('bomId', p.activeBomId ?? '');
      if (p.defaultLineId) form.setValue('lineId', p.defaultLineId);
    }
    setPreview(null);
  }, [productId, productById, form]);

  useEffect(() => {
    setPreview(null);
    if (!bomId || !plannedQty || !warehouseId || Number(plannedQty) <= 0) return;
    const t = setTimeout(() => {
      startPreview(async () => {
        const res = await previewMaterialsAction({ bomId, plannedQty, warehouseId });
        if (res.ok) setPreview(res.data);
      });
    }, 350);
    return () => clearTimeout(t);
  }, [bomId, plannedQty, warehouseId]);

  const hasShortage = preview?.some((l) => Number(l.shortQty) > 0) ?? false;

  async function onSubmit(values: FormValues) {
    const res = await createWorkOrderAction(values);
    if (res.ok) {
      toast.success(`İş emri oluşturuldu: ${res.data.docNo}`);
      router.push(`/uretim/is-emirleri/${res.data.id}`);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="rounded-xl border border-border/70 bg-card p-4">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Ürün ve miktar</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5 lg:col-span-2">
              <FieldLabel required>Mamul / yarı mamul</FieldLabel>
              <Controller control={form.control} name="productId" render={({ field }) => <Combobox value={field.value} onChange={(v) => field.onChange(v ?? '')} options={productOptions} placeholder="Ürün seçin (aktif reçetesi olanlar)" clearable={false} />} />
              {form.formState.errors.productId ? <p className="text-xs text-destructive">{form.formState.errors.productId.message}</p> : null}
            </div>
            <FormQty control={form.control} name="plannedQty" label="Planlanan miktar" required uom={productId ? productById.get(productId)?.uomCode : undefined} />
            <FormDate control={form.control} name="plannedStart" label="Planlanan başlangıç" />
            <FormSelect control={form.control} name="warehouseId" label="Depo" required options={warehouseOptions} />
            <FormSelect control={form.control} name="lineId" label="Hat" required options={lineOptions} />
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">Malzeme önizleme (reçete)</h2>
            {previewPending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
          </div>
          {!bomId || !plannedQty ? (
            <EmptyState compact title="Önizleme için ürün ve miktar girin" />
          ) : !preview ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Hesaplanıyor…</div>
          ) : preview.length === 0 ? (
            <EmptyState compact title="Bu reçetede satır yok" />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Malzeme</TableHead>
                    <TableHead className="text-right">Gerekli</TableHead>
                    <TableHead className="text-right">Eldeki serbest</TableHead>
                    <TableHead className="text-right">Eksik</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((l) => {
                    const short = Number(l.shortQty) > 0;
                    return (
                      <TableRow key={l.productId} className={cn(short && 'bg-destructive/5')}>
                        <TableCell>
                          <div>{l.name}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">{l.sku}</div>
                        </TableCell>
                        <TableCell className="text-right"><QtyCell value={l.requiredQty} uom={l.uomCode} /></TableCell>
                        <TableCell className="text-right"><QtyCell value={l.availableQty} uom={l.uomCode} /></TableCell>
                        <TableCell className="text-right">
                          {short ? <QtyCell value={l.shortQty} uom={l.uomCode} className="text-destructive font-medium" /> : <CheckCircle2 className="ml-auto size-4 text-success" />}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {hasShortage ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-[oklch(0.5_0.14_70)] dark:text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              Bazı malzemelerde eldeki serbest stok yetersiz. İş emri yine de oluşturulabilir; malzeme mal kabul veya transferle tamamlanmalı.
            </div>
          ) : null}
        </div>

        <FormActions submitLabel="İş emrini oluştur" onCancel={() => router.back()} pending={form.formState.isSubmitting} />
      </form>
    </Form>
  );
}
