'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form, FormText, FormSelect, FieldLabel } from '@/components/form/fields';
import { FormQty } from '@/components/form/money-qty';
import { FormDate } from '@/components/form/date-field';
import { Combobox } from '@/components/form/combobox';
import { FormActions } from '@/components/form/form-actions';
import { createTransferAction, getLocationStockAction } from '../actions';
import type { LocationStockRow } from '../queries';

const lineSchema = z.object({ productId: z.string().uuid('Ürün seçin'), lotId: z.string().uuid().optional().nullable(), qty: z.string().min(1, 'Miktar girin'), uomId: z.string().uuid() });

const schema = z.object({
  fromWarehouseId: z.string().uuid('Kaynak depo seçin'),
  toWarehouseId: z.string().uuid('Hedef depo seçin'),
  fromLocationId: z.string().uuid('Kaynak lokasyon seçin'),
  toLocationId: z.string().uuid('Hedef lokasyon seçin'),
  scheduledDate: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1, 'En az bir satır ekleyin'),
});

type FormValues = z.infer<typeof schema>;
type LocationOption = { id: string; code: string; usage: string; warehouseId: string | null; isPickable: boolean };

export function TransferForm({ warehouses, locations }: { warehouses: Array<{ id: string; code: string; name: string }>; locations: LocationOption[] }) {
  const router = useRouter();
  const [stockAtSource, setStockAtSource] = useState<LocationStockRow[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fromWarehouseId: warehouses[0]?.id ?? '', toWarehouseId: warehouses[0]?.id ?? '', fromLocationId: '', toLocationId: '', scheduledDate: '', reason: '', note: '', lines: [] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' });
  const fromWarehouseId = form.watch('fromWarehouseId');
  const toWarehouseId = form.watch('toWarehouseId');
  const fromLocationId = form.watch('fromLocationId');

  const warehouseOptions = useMemo(() => warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })), [warehouses]);
  const fromLocationOptions = useMemo(() => locations.filter((l) => l.warehouseId === fromWarehouseId && l.usage === 'internal' && l.isPickable).map((l) => ({ value: l.id, label: l.code })), [locations, fromWarehouseId]);
  const toLocationOptions = useMemo(() => locations.filter((l) => l.warehouseId === toWarehouseId && l.usage === 'internal' && l.isPickable).map((l) => ({ value: l.id, label: l.code })), [locations, toWarehouseId]);

  useEffect(() => {
    form.setValue('fromLocationId', '');
    setStockAtSource([]);
  }, [fromWarehouseId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    form.setValue('toLocationId', '');
  }, [toWarehouseId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!fromLocationId) {
      setStockAtSource([]);
      return;
    }
    getLocationStockAction({ locationId: fromLocationId }).then((res) => {
      if (res.ok) setStockAtSource(res.data);
      else toast.error(res.error);
    });
  }, [fromLocationId]);

  const stockOptions = useMemo(
    () => stockAtSource.map((s) => ({ value: `${s.productId}:${s.lotId ?? 'nolot'}`, label: s.lotNo ? `${s.productName} · ${s.lotNo}` : s.productName, description: `${s.sku} · kullanılabilir ${s.available}` })),
    [stockAtSource],
  );

  function addLine(key: string) {
    const [productId, lotKey] = key.split(':');
    const stock = stockAtSource.find((s) => s.productId === productId && (s.lotId ?? 'nolot') === lotKey);
    if (!stock) return;
    append({ productId: stock.productId, lotId: stock.lotId, qty: '', uomId: stock.uomId });
  }

  async function onSubmit(values: FormValues) {
    const res = await createTransferAction({ ...values, lines: values.lines.map((l) => ({ ...l, fromLocationId: values.fromLocationId, toLocationId: values.toLocationId })) });
    if (res.ok) {
      toast.success(`Transfer oluşturuldu: ${res.data.docNo}`);
      router.push(`/depo/transfer/${res.data.id}`);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="rounded-xl border border-border/70 bg-card p-4">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Güzergah</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FormSelect control={form.control} name="fromWarehouseId" label="Kaynak depo" required options={warehouseOptions} />
            <div className="space-y-1.5">
              <FieldLabel required>Kaynak lokasyon</FieldLabel>
              <Controller control={form.control} name="fromLocationId" render={({ field }) => <Combobox value={field.value} onChange={field.onChange} options={fromLocationOptions} mono placeholder="Lokasyon seçin" />} />
            </div>
            <FormSelect control={form.control} name="toWarehouseId" label="Hedef depo" required options={warehouseOptions} />
            <div className="space-y-1.5">
              <FieldLabel required>Hedef lokasyon</FieldLabel>
              <Controller control={form.control} name="toLocationId" render={({ field }) => <Combobox value={field.value} onChange={field.onChange} options={toLocationOptions} mono placeholder="Lokasyon seçin" />} />
            </div>
            <FormDate control={form.control} name="scheduledDate" label="Planlanan tarih" />
            <FormText control={form.control} name="reason" label="Sebep" />
          </div>
          {fromWarehouseId !== toWarehouseId ? <p className="mt-3 text-xs text-muted-foreground">Depolar arası transfer: önce kaynak deponun transit lokasyonuna geçer, &quot;Teslim al&quot; ile hedefe ulaşır.</p> : null}
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">Satırlar</h2>
            <div className="flex items-center gap-1 text-xs text-muted-foreground"><Plus className="size-3.5" /> kaynak lokasyondaki stoktan seçin</div>
          </div>
          {!fromLocationId ? (
            <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">Önce kaynak lokasyon seçin.</p>
          ) : (
            <div className="space-y-1.5">
              <Combobox value={null} onChange={(k) => k && addLine(k)} options={stockOptions} placeholder="Ürün/lot ekle…" clearable={false} emptyText="Bu lokasyonda stok yok" />
            </div>
          )}

          <div className="mt-4 space-y-2">
            {fields.map((field, index) => {
              const stock = stockAtSource.find((s) => s.productId === form.watch(`lines.${index}.productId`) && (s.lotId ?? 'nolot') === (form.watch(`lines.${index}.lotId`) ?? 'nolot'));
              return (
                <div key={field.id} className="flex items-center gap-3 rounded-lg border border-border/60 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{stock?.productName}</div>
                    <div className="font-mono text-xs text-muted-foreground">{stock?.lotNo ?? stock?.sku}</div>
                  </div>
                  <FormQty control={form.control} name={`lines.${index}.qty`} uom={stock?.uomCode} className="w-32" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="size-8 shrink-0 text-muted-foreground hover:text-destructive">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              );
            })}
            {fields.length === 0 ? <p className="text-center text-sm text-muted-foreground">Henüz satır eklenmedi.</p> : null}
          </div>
        </div>

        <FormActions submitLabel="Transferi oluştur" onCancel={() => router.back()} pending={form.formState.isSubmitting} disabled={fields.length === 0} />
      </form>
    </Form>
  );
}
