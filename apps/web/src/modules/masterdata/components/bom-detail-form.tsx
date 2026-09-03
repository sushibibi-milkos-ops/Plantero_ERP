'use client';

import type { CSSProperties } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Form, FormText } from '@/components/form/fields';
import { FormQty, FormMoney } from '@/components/form/money-qty';
import { FormActions } from '@/components/form/form-actions';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { formatPctFixed } from '../format-pct';
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
    // Tur 4 P2: kök sarmalayıcıda max-w yoktu — KPI şeridi ve bileşen tablosu geniş ekranlarda 1400px'e
    // yayılıp sütunlar arası ölü alan bırakıyordu (product-general-tab.tsx / partner-general-tab.tsx ile
    // aynı üst sınır burada da uygulanır).
    <div className="max-w-[1080px] space-y-4">
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
              <div className="num text-[20px] leading-tight font-medium">{formatPctFixed(bom.expectedYieldPct, 1)}</div>
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

          {/* Kök neden (Tur 3 P0, aynı Tur 2'de data-table.tsx:330'da çözülen hata): `w-full` tabloyu
              kapsayıcının %100'üne zorlar, table-layout:auto bu sabit toplam genişliğe uymak için
              hücreleri ezer — yatay kaydırma hiç tetiklenmez. Tur 4 P1: `min-w-full` tek başına yetmedi —
              hücrelerde `whitespace-nowrap` olmadığı için "Hurma Şurubu" gibi uzun bileşen adları yine de
              2 satıra sarıyor, "% Pay" ekran dışında harf ortasından kesiliyordu. `min-w-[360px]` +
              `whitespace-nowrap`: tablo her zaman doğal genişliğine büyür, hiçbir hücre sarmaz — dar
              ekranda gerçek yatay kaydırma (`scroll-fade-x` affordance'ıyla) devreye girer.
              Tur 5 P0 bulgusu: 560px min-w 390px'te reçetenin ASIL bilgisini (Miktar+Tutar) ekran dışına
              itiyordu — kullanıcı yalnızca SKU (ekranın ~%40'ı) ve Bileşen adını görüyordu. SKU ikincil bir
              tanımlayıcı (Bileşen adı zaten birincil kimlik); Birim Maliyet VE % Pay ile aynı sınıfta artık
              yalnızca ≥sm görünür — mobilde Bileşen+Miktar(+Fire%)(+Yan Ürün)+Tutar önceliklidir. */}
          <div
            className="scrollbar-thin scroll-fade-x w-fit max-w-full overflow-x-auto"
            style={{ '--scroll-fade-bg': 'var(--background)' } as CSSProperties}
          >
            <table className="w-full min-w-[360px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40 text-[12px] text-muted-foreground">
                  <th className="hidden h-9 px-3 text-left font-medium whitespace-nowrap sm:table-cell">SKU</th>
                  <th className="h-9 px-3 text-left font-medium whitespace-nowrap">Bileşen</th>
                  <th className="h-9 px-3 text-right font-medium whitespace-nowrap">Miktar</th>
                  {hasScrap ? <th className="h-9 px-3 text-right font-medium whitespace-nowrap">Fire %</th> : null}
                  {hasByproduct ? <th className="h-9 px-3 text-center font-medium whitespace-nowrap">Yan Ürün</th> : null}
                  <th className="hidden h-9 px-3 text-right font-medium whitespace-nowrap sm:table-cell">Birim Maliyet</th>
                  <th className="h-9 px-3 text-right font-medium whitespace-nowrap">Tutar</th>
                  <th className="hidden h-9 px-3 text-right font-medium whitespace-nowrap sm:table-cell">% Pay</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const cost = costByLineId.get(l.line.id);
                  const lineCostNum = cost ? Number(cost.lineCost) : 0;
                  const pct = materialCostNum > 0 ? (lineCostNum / materialCostNum) * 100 : 0;
                  return (
                    <tr key={l.line.id} className="h-9 border-b border-border/50 last:border-0">
                      <td className="hidden px-3 font-mono text-[12px] whitespace-nowrap sm:table-cell">{l.sku}</td>
                      <td className="max-w-[220px] truncate px-3 whitespace-nowrap" title={l.name}>
                        {l.name}
                      </td>
                      <td className="px-3 text-right whitespace-nowrap">
                        <QtyCell value={l.line.qty} uom={l.uomCode} />
                      </td>
                      {hasScrap ? <td className="num px-3 text-right whitespace-nowrap text-muted-foreground">{formatPctFixed(l.line.scrapPct, 1)}</td> : null}
                      {hasByproduct ? <td className="px-3 text-center whitespace-nowrap text-muted-foreground">{l.line.isByproduct ? 'Evet' : ''}</td> : null}
                      <td className="hidden px-3 text-right whitespace-nowrap text-muted-foreground sm:table-cell">{cost ? <MoneyCell value={cost.unitCost} muted /> : '—'}</td>
                      <td className="px-3 text-right whitespace-nowrap">{cost ? <MoneyCell value={cost.lineCost} /> : '—'}</td>
                      <td className="num hidden px-3 text-right whitespace-nowrap text-muted-foreground sm:table-cell">{formatPctFixed(pct, 1)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {/* SKU artık mobilde `hidden` (bkz. thead/tbody) — sabit bir `colSpan` her iki kırılım
                    noktasında da aynı anda doğru olamaz (gizli hücreler tablo sütun modelinden tamamen
                    çıkar). Çözüm Birim Maliyet ile zaten kullanılan desenin aynısı: "Toplam" etiketi
                    yalnızca her zaman görünür sütunları (Bileşen+Miktar+opsiyonel) kapsar, SKU için ayrı
                    bir `hidden … sm:table-cell` yer tutucu hücre eklenir. */}
                <tr className="h-9 border-t border-border/60 font-medium">
                  <td className="hidden px-3 sm:table-cell" />
                  <td className="px-3 whitespace-nowrap" colSpan={2 + (hasScrap ? 1 : 0) + (hasByproduct ? 1 : 0)}>
                    Toplam
                  </td>
                  <td className="hidden px-3 sm:table-cell" />
                  <td className="px-3 text-right whitespace-nowrap">
                    <MoneyCell value={rollup.materialCost} />
                  </td>
                  <td className="num hidden px-3 text-right whitespace-nowrap text-muted-foreground sm:table-cell">{materialCostNum > 0 ? formatPctFixed(100, 1) : '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
