'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Form, FormText } from '@/components/form/fields';
import { FormQty, FormMoney } from '@/components/form/money-qty';
import { FormActions } from '@/components/form/form-actions';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { formatPct } from '@/lib/format';
import type { BomCostLine } from '@plantero/core';
import { BomLinesEditor, type ComponentCandidate } from './bom-lines-editor';
import { updateBomDraftAction } from '../actions';

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
  rollup: { materialCost: string; overheadCost: string; unitCost: string; lines: BomCostLine[] };
  candidates: ComponentCandidate[];
  canManage: boolean;
}) {
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

  const outputQty = form.watch('outputQty');
  const expectedYieldPct = form.watch('expectedYieldPct');
  const overheadPerBatch = form.watch('overheadPerBatch');
  const overheadPerUnit = form.watch('overheadPerUnit');
  // Tümü sıfır/boş olan sütunlar okuma modunda render edilmez.
  const hasScrap = lines.some((l) => Number(l.line.scrapPct) !== 0);
  const hasByproduct = lines.some((l) => l.line.isByproduct);
  const costByLineId = new Map(rollup.lines.map((c) => [c.lineId, c]));
  const materialCostNum = Number(rollup.materialCost);

  return (
    <div className="space-y-4">
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
          {/* Stripe tarzı KPI şeridi: etiket üstte küçük/muted, değer altta büyük/tabular, hücreler arası hairline. */}
          <div className="grid grid-cols-2 divide-x divide-y divide-border/60 rounded-lg border border-border/60 bg-card sm:grid-cols-5 sm:divide-y-0">
            <div className="px-4 py-3">
              <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Çıktı</div>
              <div className="num text-[20px] leading-tight font-medium">
                <QtyCell value={bom.outputQty} uom={bom.outputUomCode ?? undefined} />
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Verim</div>
              <div className="num text-[20px] leading-tight font-medium">{formatPct(bom.expectedYieldPct)}</div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Malzeme</div>
              <div className="num text-[20px] leading-tight font-medium">
                <MoneyCell value={rollup.materialCost} />
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Genel gider</div>
              <div className="num text-[20px] leading-tight font-medium">
                <MoneyCell value={rollup.overheadCost} />
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Birim maliyet</div>
              <div className="num text-[20px] leading-tight font-semibold">
                <MoneyCell value={rollup.unitCost} />
              </div>
            </div>
          </div>

          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40 text-[12px] text-muted-foreground">
                  <th className="h-9 px-3 text-left font-medium">SKU</th>
                  <th className="h-9 px-3 text-left font-medium">Bileşen</th>
                  <th className="h-9 px-3 text-right font-medium">Miktar</th>
                  {hasScrap ? <th className="h-9 px-3 text-right font-medium">Fire %</th> : null}
                  {hasByproduct ? <th className="h-9 px-3 text-center font-medium">Yan Ürün</th> : null}
                  <th className="h-9 px-3 text-right font-medium">Birim Maliyet</th>
                  <th className="h-9 px-3 text-right font-medium">Tutar</th>
                  <th className="h-9 px-3 text-right font-medium">% Pay</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const cost = costByLineId.get(l.line.id);
                  const lineCostNum = cost ? Number(cost.lineCost) : 0;
                  const pct = materialCostNum > 0 ? (lineCostNum / materialCostNum) * 100 : 0;
                  return (
                    <tr key={l.line.id} className="h-9 border-b border-border/50 last:border-0">
                      <td className="px-3 font-mono text-[12px]">{l.sku}</td>
                      <td className="px-3">{l.name}</td>
                      <td className="px-3 text-right">
                        <QtyCell value={l.line.qty} uom={l.uomCode} />
                      </td>
                      {hasScrap ? <td className="px-3 text-right text-muted-foreground">{formatPct(l.line.scrapPct)}</td> : null}
                      {hasByproduct ? <td className="px-3 text-center text-muted-foreground">{l.line.isByproduct ? 'Evet' : ''}</td> : null}
                      <td className="px-3 text-right text-muted-foreground">{cost ? <MoneyCell value={cost.unitCost} muted /> : '—'}</td>
                      <td className="px-3 text-right">{cost ? <MoneyCell value={cost.lineCost} /> : '—'}</td>
                      <td className="num px-3 text-right text-muted-foreground">{formatPct(pct, 1)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="h-9 border-t border-border/60 font-medium">
                  <td className="px-3" colSpan={4 + (hasScrap ? 1 : 0) + (hasByproduct ? 1 : 0)}>
                    Toplam
                  </td>
                  <td className="px-3 text-right">
                    <MoneyCell value={rollup.materialCost} />
                  </td>
                  <td className="num px-3 text-right text-muted-foreground">{materialCostNum > 0 ? formatPct(100, 1) : '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
