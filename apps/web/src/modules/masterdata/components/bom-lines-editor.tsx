'use client';

import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormCombobox, type ComboboxOption } from '@/components/form/combobox';
import { FormQty } from '@/components/form/money-qty';
import { FormCheckbox } from '@/components/form/fields';
import { formatMoney, formatQty } from '@/lib/format';

export type ComponentCandidate = { id: string; sku: string; name: string; uomId: string; uomCode: string; estimatedUnitCost: string };

/**
 * Reçete satırları düzenleyicisi — satır ekle/sil, canlı toplam önizlemesi (istemci tahmini;
 * kaydederken sunucu `rollupBomCost` ile lot ortalamalı gerçek maliyeti yeniden hesaplar).
 */
export function BomLinesEditor({
  name,
  candidates,
  outputQty,
  expectedYieldPct,
  overheadPerBatch,
  overheadPerUnit,
}: {
  name: string;
  candidates: ComponentCandidate[];
  outputQty: string;
  expectedYieldPct: string;
  overheadPerBatch: string;
  overheadPerUnit: string;
}) {
  const { control } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name });
  const lines = useWatch({ control, name }) as Array<{ productId: string; qty: string; scrapPct: string; isByproduct: boolean }> | undefined;

  const byId = new Map(candidates.map((c) => [c.id, c]));
  let materialCost = 0;
  const lineCosts = (lines ?? []).map((l) => {
    const c = l?.productId ? byId.get(l.productId) : undefined;
    if (!c) return 0;
    const qty = Number(l.qty || 0) * (1 + Number(l.scrapPct || 0) / 100);
    const cost = qty * Number(c.estimatedUnitCost || 0);
    materialCost += l.isByproduct ? -Number(l.qty || 0) * Number(c.estimatedUnitCost || 0) : cost;
    return l.isByproduct ? -Number(l.qty || 0) * Number(c.estimatedUnitCost || 0) : cost;
  });

  const out = Number(outputQty || 1);
  const yieldRatio = Number(expectedYieldPct || 100) / 100;
  const effectiveOutput = out * (yieldRatio || 1);
  const overheadTotal = Number(overheadPerBatch || 0) + Number(overheadPerUnit || 0) * effectiveOutput;
  const estimatedUnitCost = effectiveOutput > 0 ? (materialCost + Number(overheadPerBatch || 0)) / effectiveOutput + Number(overheadPerUnit || 0) : 0;

  const options: ComboboxOption[] = candidates.map((c) => ({ value: c.id, label: `${c.sku} — ${c.name}`, keywords: [c.sku], description: `${formatMoney(c.estimatedUnitCost)}/${c.uomCode}` }));

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-border/70">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40 text-[12px] text-muted-foreground">
                <th className="h-9 px-2 text-left font-medium">Bileşen</th>
                <th className="h-9 px-2 text-right font-medium">Miktar</th>
                <th className="h-9 px-2 text-right font-medium">Fire %</th>
                <th className="h-9 px-2 text-center font-medium">Yan Ürün</th>
                <th className="h-9 px-2 text-right font-medium">Satır Maliyeti</th>
                <th className="h-9 px-2" />
              </tr>
            </thead>
            <tbody>
              {fields.map((field, i) => (
                <tr key={field.id} className="h-11 border-b border-border/50 last:border-0">
                  <td className="px-2 py-1 align-middle">
                    <FormCombobox control={control} name={`${name}.${i}.productId`} options={options} placeholder="Bileşen seçin" mono className="w-64" />
                  </td>
                  <td className="px-2 py-1 align-middle">
                    <FormQty control={control} name={`${name}.${i}.qty`} maxDigits={4} className="w-28" />
                  </td>
                  <td className="px-2 py-1 align-middle">
                    <FormQty control={control} name={`${name}.${i}.scrapPct`} maxDigits={2} className="w-20" />
                  </td>
                  <td className="px-2 py-1 text-center align-middle">
                    <FormCheckbox control={control} name={`${name}.${i}.isByproduct`} className="justify-center" />
                  </td>
                  <td className="num px-2 py-1 text-right align-middle whitespace-nowrap">{formatMoney(String(lineCosts[i] ?? 0))}</td>
                  <td className="px-2 py-1 text-right align-middle">
                    <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => remove(i)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={() => append({ productId: '', qty: '1', scrapPct: '0', isByproduct: false })}>
        <Plus className="size-4" /> Satır ekle
      </Button>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-[13px]">
        <div>
          <span className="text-muted-foreground">Malzeme maliyeti: </span>
          <span className="num font-medium">{formatMoney(String(materialCost))}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Genel gider: </span>
          <span className="num font-medium">{formatMoney(String(overheadTotal))}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Efektif çıktı: </span>
          <span className="num font-medium">{formatQty(String(effectiveOutput))}</span>
        </div>
        <div className="ml-auto">
          <span className="text-muted-foreground">Tahmini birim maliyet: </span>
          <span className="num text-base font-semibold">{formatMoney(String(estimatedUnitCost))}</span>
        </div>
      </div>
    </div>
  );
}
