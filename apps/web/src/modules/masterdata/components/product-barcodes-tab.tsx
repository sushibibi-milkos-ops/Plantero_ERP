'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormText, FormSelect } from '@/components/form/fields';
import { FormActions } from '@/components/form/form-actions';
import { EmptyState } from '@/components/empty-state';
import { cn } from '@/lib/utils';
import { isValidEan13 } from '@/lib/ean13';
import { addProductBarcodeAction, removeProductBarcodeAction } from '../actions';

export type BarcodeRow = { id: string; barcode: string; kind: string; note: string | null };

const schema = z.object({
  barcode: z.string().trim().min(3, 'Barkod en az 3 karakter'),
  kind: z.enum(['unit', 'case', 'pallet', 'extra']),
  note: z.string().optional().nullable(),
});
type FormValues = z.infer<typeof schema>;

const KIND_LABELS: Record<string, string> = { unit: 'Birim', case: 'Koli', pallet: 'Palet', extra: 'Ek' };

function BarcodeStatus({ code }: { code: string }) {
  if (code.length !== 13 || !/^\d+$/.test(code)) return <span className="text-[11px] text-muted-foreground">EAN-13 değil</span>;
  return isValidEan13(code) ? (
    <span className="inline-flex items-center gap-1 text-[11px] text-success">
      <CheckCircle2 className="size-3" /> Checksum geçerli
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
      <AlertTriangle className="size-3" /> Checksum hatalı
    </span>
  );
}

export function ProductBarcodesTab({
  productId,
  mainBarcode,
  caseBarcode,
  extra,
  conflicts,
  canManage,
}: {
  productId: string;
  mainBarcode: string | null;
  caseBarcode: string | null;
  extra: BarcodeRow[];
  conflicts: Array<{ sku: string; name: string }>;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { barcode: '', kind: 'extra', note: '' } });

  async function onSubmit(values: FormValues) {
    const res = await addProductBarcodeAction({ productId, ...values });
    if (res.ok) {
      toast.success('Barkod eklendi');
      setOpen(false);
      form.reset({ barcode: '', kind: 'extra', note: '' });
    } else toast.error(res.error);
  }

  async function onRemove(id: string) {
    const res = await removeProductBarcodeAction({ id, productId });
    if (res.ok) toast.success('Barkod silindi');
    else toast.error(res.error);
  }

  const rows: Array<{ id: string; barcode: string; kind: string; note: string | null; removable: boolean }> = [
    ...(mainBarcode ? [{ id: 'main', barcode: mainBarcode, kind: 'unit', note: 'Ana barkod (kilitli)', removable: false }] : []),
    ...(caseBarcode ? [{ id: 'case', barcode: caseBarcode, kind: 'case', note: 'Koli barkodu', removable: false }] : []),
    ...extra.map((e) => ({ ...e, removable: true })),
  ];

  return (
    <div className="space-y-4">
      {conflicts.length ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-[13px] text-[oklch(0.45_0.13_70)] dark:text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="font-medium">GS1 uyarısı: bu barkod başka SKU&apos;larda da kullanılıyor</div>
            <div className="mt-0.5 text-muted-foreground">
              {conflicts.map((c) => `${c.sku} (${c.name})`).join(', ')} — her ambalaj boyutuna ayrı EAN-13 atanması önerilir.
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Barkodlar</div>
        {canManage ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Barkod ekle
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ek barkod ekle</DialogTitle>
                <DialogDescription>Palet, alternatif ambalaj ya da eski barkod gibi ek kodlar.</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                  <FormText control={form.control} name="barcode" label="Barkod" mono required />
                  <FormSelect
                    control={form.control}
                    name="kind"
                    label="Tür"
                    options={[
                      { value: 'extra', label: 'Ek' },
                      { value: 'case', label: 'Koli' },
                      { value: 'pallet', label: 'Palet' },
                      { value: 'unit', label: 'Birim' },
                    ]}
                  />
                  <FormText control={form.control} name="note" label="Not" />
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

      {rows.length === 0 ? (
        <EmptyState compact title="Barkod yok" description="Bu ürünün ana barkodu tanımlı değil." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40 text-[12px] text-muted-foreground">
                  <th className="h-9 px-3 text-left font-medium">Barkod</th>
                  <th className="h-9 px-3 text-left font-medium">Tür</th>
                  <th className="h-9 px-3 text-left font-medium">Doğrulama</th>
                  <th className="h-9 px-3 text-left font-medium">Not</th>
                  <th className="h-9 px-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={cn('h-9 border-b border-border/50 last:border-0')}>
                    <td className="px-3 font-mono text-[12px]">{r.barcode}</td>
                    <td className="px-3 text-muted-foreground">{KIND_LABELS[r.kind] ?? r.kind}</td>
                    <td className="px-3">
                      <BarcodeStatus code={r.barcode} />
                    </td>
                    <td className="px-3 text-muted-foreground">{r.note ?? '—'}</td>
                    <td className="px-3 text-right">
                      {r.removable && canManage ? (
                        <Button size="icon" variant="ghost" className="size-7" onClick={() => onRemove(r.id)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
