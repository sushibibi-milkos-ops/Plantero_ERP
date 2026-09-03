'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { CheckCircle2, Archive, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form, FormText } from '@/components/form/fields';
import { FormQty, FormMoney } from '@/components/form/money-qty';
import { FormActions } from '@/components/form/form-actions';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { formatPct } from '@/lib/format';
import { BomLinesEditor, type ComponentCandidate } from './bom-lines-editor';
import { updateBomDraftAction, activateBomAction, archiveBomAction, createBomVersionAction } from '../actions';
import { BOM_STATUS_LABELS } from '../product-labels';

const lineSchema = z.object({ productId: z.string().uuid('Bileşen seçin'), qty: z.string().min(1), scrapPct: z.string(), isByproduct: z.boolean() });
const schema = z.object({
  name: z.string().optional().nullable(),
  outputQty: z.string(),
  expectedYieldPct: z.string(),
  cycleMinutes: z.string().optional().nullable(),
  defaultLineId: z.string().optional().nullable(),
  overheadPerBatch: z.string(),
  overheadPerUnit: z.string(),
  note: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1, 'En az bir satır gerekli'),
});
type FormValues = z.infer<typeof schema>;

export type BomHeader = {
  id: string;
  code: string;
  status: string;
  productId: string;
  sku: string;
  name: string | null;
  outputQty: string;
  outputUomCode: string | null;
  expectedYieldPct: string;
  cycleMinutes: number | null;
  overheadPerBatch: string;
  overheadPerUnit: string;
  note: string | null;
};

export type BomLineRow = { line: { id: string; productId: string; qty: string; scrapPct: string; isByproduct: boolean; sequence: number }; sku: string; name: string; uomCode: string };

export function BomDetailForm({
  bom,
  lines,
  rollup,
  candidates,
  canManage,
}: {
  bom: BomHeader;
  lines: BomLineRow[];
  rollup: { materialCost: string; overheadCost: string; unitCost: string };
  candidates: ComponentCandidate[];
  canManage: boolean;
}) {
  const router = useRouter();
  const isDraft = bom.status === 'draft';

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: bom.name,
      outputQty: bom.outputQty,
      expectedYieldPct: bom.expectedYieldPct,
      cycleMinutes: bom.cycleMinutes === null ? null : String(bom.cycleMinutes),
      overheadPerBatch: bom.overheadPerBatch,
      overheadPerUnit: bom.overheadPerUnit,
      note: bom.note,
      lines: lines.map((l) => ({ productId: l.line.productId, qty: l.line.qty, scrapPct: l.line.scrapPct, isByproduct: l.line.isByproduct })),
    },
  });

  const uomById = new Map(candidates.map((c) => [c.id, c.uomId]));
  const withUom = (ls: FormValues['lines']) => ls.map((l) => ({ ...l, uomId: uomById.get(l.productId) ?? '' }));

  async function onSave(values: FormValues) {
    const res = await updateBomDraftAction({ id: bom.id, ...values, lines: withUom(values.lines) });
    if (res.ok) toast.success('Reçete taslağı kaydedildi');
    else toast.error(res.error);
  }

  async function onActivate() {
    const res = await activateBomAction({ id: bom.id });
    if (res.ok) toast.success(`Reçete aktifleştirildi: ${res.data.code}`);
    else toast.error(res.error);
  }

  async function onArchive() {
    const res = await archiveBomAction({ id: bom.id });
    if (res.ok) toast.success('Reçete arşivlendi');
    else toast.error(res.error);
  }

  async function onNewVersion() {
    const values = form.getValues();
    const res = await createBomVersionAction({
      productId: bom.productId,
      name: values.name,
      outputQty: values.outputQty,
      expectedYieldPct: values.expectedYieldPct,
      overheadPerBatch: values.overheadPerBatch,
      overheadPerUnit: values.overheadPerUnit,
      note: values.note,
      lines: withUom(values.lines),
    });
    if (res.ok) {
      toast.success(`Yeni versiyon oluşturuldu: ${res.data.code}`);
      router.push(`/ana-veri/receteler/${res.data.id}`);
    } else toast.error(res.error);
  }

  const outputQty = form.watch('outputQty');
  const expectedYieldPct = form.watch('expectedYieldPct');
  const overheadPerBatch = form.watch('overheadPerBatch');
  const overheadPerUnit = form.watch('overheadPerUnit');
  // Tümü sıfır/boş olan sütunlar okuma modunda render edilmez.
  const hasScrap = lines.some((l) => Number(l.line.scrapPct) !== 0);
  const hasByproduct = lines.some((l) => l.line.isByproduct);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{bom.code}</span>
          <StatusBadge status={bom.status} label={BOM_STATUS_LABELS[bom.status] ?? bom.status} kind="bom" />
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            {isDraft ? (
              <Button onClick={onActivate} size="sm">
                <CheckCircle2 className="size-4" /> Aktifleştir
              </Button>
            ) : (
              <>
                <Button onClick={onNewVersion} variant="outline" size="sm">
                  <Copy className="size-4" /> Yeni versiyon
                </Button>
                {bom.status === 'active' ? (
                  <Button onClick={onArchive} variant="outline" size="sm">
                    <Archive className="size-4" /> Arşivle
                  </Button>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>

      {isDraft && canManage ? (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormText control={form.control} name="name" label="Reçete adı" />
              <FormQty control={form.control} name="outputQty" label="Çıktı miktarı" uom={bom.outputUomCode ?? undefined} />
              <FormQty control={form.control} name="expectedYieldPct" label="Beklenen verim %" maxDigits={2} />
              <FormQty control={form.control} name="cycleMinutes" label="Parti süresi" uom="dk" maxDigits={0} />
              <FormMoney control={form.control} name="overheadPerBatch" label="Genel gider (parti)" />
              <FormMoney control={form.control} name="overheadPerUnit" label="Genel gider (birim)" />
            </div>

            <BomLinesEditor
              name="lines"
              candidates={candidates}
              outputQty={outputQty}
              expectedYieldPct={expectedYieldPct}
              overheadPerBatch={overheadPerBatch}
              overheadPerUnit={overheadPerUnit}
            />

            <FormActions pending={form.formState.isSubmitting} sticky={false} submitLabel="Taslağı kaydet" />
          </form>
        </Form>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-6 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-[13px]">
            <div>
              <span className="text-muted-foreground">Çıktı: </span>
              <QtyCell value={bom.outputQty} uom={bom.outputUomCode ?? undefined} />
            </div>
            <div>
              <span className="text-muted-foreground">Verim: </span>{formatPct(bom.expectedYieldPct)}
            </div>
            <div>
              <span className="text-muted-foreground">Malzeme: </span>
              <MoneyCell value={rollup.materialCost} />
            </div>
            <div>
              <span className="text-muted-foreground">Genel gider: </span>
              <MoneyCell value={rollup.overheadCost} />
            </div>
            <div>
              <span className="text-muted-foreground">Birim maliyet: </span>
              <MoneyCell value={rollup.unitCost} className="font-semibold" />
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40 text-[12px] text-muted-foreground">
                    <th className="h-9 px-3 text-left font-medium">SKU</th>
                    <th className="h-9 px-3 text-left font-medium">Bileşen</th>
                    <th className="h-9 px-3 text-right font-medium">Miktar</th>
                    {hasScrap ? <th className="h-9 px-3 text-right font-medium">Fire %</th> : null}
                    {hasByproduct ? <th className="h-9 px-3 text-center font-medium">Yan Ürün</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.line.id} className="h-9 border-b border-border/50 last:border-0">
                      <td className="px-3 font-mono text-[12px]">{l.sku}</td>
                      <td className="px-3">{l.name}</td>
                      <td className="px-3 text-right">
                        <QtyCell value={l.line.qty} uom={l.uomCode} />
                      </td>
                      {hasScrap ? <td className="px-3 text-right text-muted-foreground">{formatPct(l.line.scrapPct)}</td> : null}
                      {hasByproduct ? <td className="px-3 text-center text-muted-foreground">{l.line.isByproduct ? 'Evet' : ''}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
