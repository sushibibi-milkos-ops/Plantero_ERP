'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Trash2, Loader2, Save, Send, Rocket, FlaskConical, Wand2 } from 'lucide-react';
import { D } from '@plantero/core/money';
import { computeTrialCost } from '@plantero/core/rnd/costFormula';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/form/combobox';
import { MoneyCell } from '@/components/money-cell';
import { StatusBadge } from '@/components/status-badge';
import { cn } from '@/lib/utils';
import { updateVersionDraftAction, submitForApprovalAction, releaseToBomAction, resolveLineCostAction, linkProductToProjectAction } from '../actions';
import { TRIAL_STATUS_LABELS, COST_SOURCE_OPTIONS, COST_SOURCE_LABELS } from '../labels';
import type { CostSource, ProductOption, VersionDetail } from '../queries';

// `resolvedUnitCost`: sunucudan çözülen ortalama/son-alış maliyeti — forma AİTTİR (RHF ile birlikte
// satır kaldırılıp eklenirken kayar), dışarıda ayrı bir index/id anahtarlı map tutmaya gerek kalmaz.
type LineForm = { productId: string; qty: string; uomId: string; costSource: CostSource; manualUnitCost: string; resolvedUnitCost: string; scrapPct: string };
type FormValues = { batchQty: string; batchUomId: string; expectedYieldPct: string; overheadPerBatch: string; overheadPerUnit: string; changeNote: string; lines: LineForm[] };

const EDITABLE_STATUSES = new Set(['draft', 'testing']);

export function CostSimulator({
  detail, projectId, productOptions, uomOptions, canManage, canRelease,
}: {
  detail: VersionDetail;
  projectId: string;
  productOptions: ProductOption[];
  uomOptions: Array<{ id: string; code: string; name: string }>;
  canManage: boolean;
  canRelease: boolean;
}) {
  const router = useRouter();
  const editable = canManage && EDITABLE_STATUSES.has(detail.version.status);
  const [pending, setPending] = useState(false);

  const toLineForm = (l: VersionDetail['lines'][number]): LineForm => ({
    productId: l.productId, qty: l.qty, uomId: l.uomId, costSource: l.costSource as CostSource,
    manualUnitCost: l.costSource === 'manual' ? l.unitCost : '0', resolvedUnitCost: l.unitCost, scrapPct: l.scrapPct,
  });

  const form = useForm<FormValues>({
    defaultValues: {
      batchQty: detail.version.batchQty,
      batchUomId: detail.version.batchUomId ?? '',
      expectedYieldPct: detail.version.expectedYieldPct,
      overheadPerBatch: detail.version.overheadPerBatch,
      overheadPerUnit: detail.version.overheadPerUnit,
      changeNote: detail.version.changeNote ?? '',
      lines: detail.lines.map(toLineForm),
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' });
  const watched = form.watch();

  // Versiyon değişince formu sıfırla.
  useEffect(() => {
    form.reset({
      batchQty: detail.version.batchQty, batchUomId: detail.version.batchUomId ?? '', expectedYieldPct: detail.version.expectedYieldPct,
      overheadPerBatch: detail.version.overheadPerBatch, overheadPerUnit: detail.version.overheadPerUnit, changeNote: detail.version.changeNote ?? '',
      lines: detail.lines.map(toLineForm),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.version.id]);

  const productById = useMemo(() => new Map(productOptions.map((p) => [p.id, p])), [productOptions]);
  const productPickerOptions = useMemo(() => productOptions.map((p) => ({ value: p.id, label: p.name, description: p.sku, keywords: [p.sku] })), [productOptions]);

  function unitCostFor(index: number): string {
    const line = watched.lines[index];
    if (!line) return '0';
    return line.costSource === 'manual' ? (line.manualUnitCost || '0') : (line.resolvedUnitCost || '0');
  }

  // Canlı toplam — SUNUCUYA GİTMEDEN saf formülle anında hesaplanır (docs/modules/arge.md §Kabul).
  const computation = useMemo(() => {
    return computeTrialCost({
      batchQty: D(watched.batchQty || '0'),
      expectedYieldPct: D(watched.expectedYieldPct || '0'),
      overheadPerBatch: D(watched.overheadPerBatch || '0'),
      overheadPerUnit: D(watched.overheadPerUnit || '0'),
      lines: (watched.lines ?? []).map((l, i) => ({ qty: D(l?.qty || '0'), unitCost: D(unitCostFor(i)), scrapPct: D(l?.scrapPct || '0') })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watched]);

  async function addLine(product: ProductOption) {
    const index = fields.length; // append hedefi her zaman sona eklenir — bu, yeni satırın indeksidir
    append({ productId: product.id, qty: '', uomId: product.uomId, costSource: 'average', manualUnitCost: '0', resolvedUnitCost: '0', scrapPct: '0' });
    const resolved = await resolveLineCostAction({ productId: product.id, costSource: 'average' });
    if (resolved.ok) form.setValue(`lines.${index}.resolvedUnitCost`, resolved.data.unitCost);
  }

  async function onCostSourceChange(index: number, source: CostSource) {
    form.setValue(`lines.${index}.costSource`, source);
    if (source === 'manual') return;
    const productId = watched.lines[index]?.productId;
    if (!productId) return;
    const res = await resolveLineCostAction({ productId, costSource: source });
    if (res.ok) form.setValue(`lines.${index}.resolvedUnitCost`, res.data.unitCost);
  }

  async function onProductChange(index: number, productId: string) {
    const product = productById.get(productId);
    form.setValue(`lines.${index}.productId`, productId);
    if (product) form.setValue(`lines.${index}.uomId`, product.uomId);
    const source = watched.lines[index]?.costSource ?? 'average';
    if (source !== 'manual') {
      const res = await resolveLineCostAction({ productId, costSource: source });
      if (res.ok) form.setValue(`lines.${index}.resolvedUnitCost`, res.data.unitCost);
    }
  }

  async function save() {
    const values = form.getValues();
    if (values.lines.length === 0) { toast.error('En az bir satır ekleyin'); return; }
    setPending(true);
    const res = await updateVersionDraftAction({
      versionId: detail.version.id, projectId,
      batchQty: values.batchQty, batchUomId: values.batchUomId || null, expectedYieldPct: values.expectedYieldPct,
      overheadPerBatch: values.overheadPerBatch, overheadPerUnit: values.overheadPerUnit, changeNote: values.changeNote || null,
      lines: values.lines.map((l) => ({ productId: l.productId, qty: l.qty, uomId: l.uomId, costSource: l.costSource, manualUnitCost: l.manualUnitCost, scrapPct: l.scrapPct })),
    });
    setPending(false);
    if (res.ok) { toast.success('Versiyon kaydedildi — maliyet yeniden hesaplandı'); router.refresh(); } else toast.error(res.error);
  }

  async function submitApproval() {
    setPending(true);
    const res = await submitForApprovalAction({ versionId: detail.version.id, projectId });
    setPending(false);
    if (res.ok) { toast.success('Onaya gönderildi'); router.refresh(); } else toast.error(res.error);
  }

  const [showLinkProduct, setShowLinkProduct] = useState(false);
  const [linkProductId, setLinkProductId] = useState<string | null>(null);
  const manufacturableOptions = useMemo(
    () => productOptions.filter((p) => p.type === 'finished' || p.type === 'semi_finished').map((p) => ({ value: p.id, label: p.name, description: p.sku, keywords: [p.sku] })),
    [productOptions],
  );

  async function release() {
    setPending(true);
    const res = await releaseToBomAction({ versionId: detail.version.id, projectId });
    setPending(false);
    if (!res.ok) { toast.error(res.error); return; }
    if (res.data.released) { toast.success(`Üretim BOM'una devredildi: ${res.data.bomCode}`); router.refresh(); }
    else if (res.data.reason === 'no_product') setShowLinkProduct(true);
  }

  async function linkProduct() {
    if (!linkProductId) return;
    setPending(true);
    const res = await linkProductToProjectAction({ projectId, productId: linkProductId });
    setPending(false);
    if (res.ok) { toast.success('Ürün projeye bağlandı — tekrar devretmeyi deneyin'); setShowLinkProduct(false); router.refresh(); } else toast.error(res.error);
  }

  const status = TRIAL_STATUS_LABELS[detail.version.status] ?? { label: detail.version.status, tone: 'muted' as const };
  const targetCost = detail.targetUnitCost ? D(detail.targetUnitCost) : null;
  const overTarget = targetCost && computation.unitCost.gt(targetCost);
  const barPct = targetCost && targetCost.gt(0) ? Math.min(150, computation.unitCost.div(targetCost).mul(100).toNumber()) : null;
  const deltaVsPrev = detail.previousVersion ? computation.unitCost.minus(D(detail.previousVersion.unitCost)) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold">v{detail.version.version}</h2>
          <StatusBadge status={detail.version.status} label={status.label} tone={status.tone} />
          {detail.hasPendingApproval ? <StatusBadge status="pending" label="Onay bekliyor" tone="warning" /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable ? (
            <Button size="sm" variant="outline" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Kaydet
            </Button>
          ) : null}
          {editable && !detail.hasPendingApproval ? (
            <Button size="sm" onClick={submitApproval} disabled={pending}>
              <Send className="size-3.5" /> Onaya gönder
            </Button>
          ) : null}
          {canRelease && detail.version.status === 'approved' ? (
            <Button size="sm" onClick={release} disabled={pending} className="bg-primary">
              <Rocket className="size-3.5" /> Üretim BOM&apos;una devret
            </Button>
          ) : null}
        </div>
      </div>

      {detail.version.status === 'released' ? (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-[13px] text-primary">
          <FlaskConical className="size-4" /> Bu versiyon üretim BOM&apos;una devredildi{detail.version.releasedAt ? ` — aktif reçete olarak kullanılıyor` : ''}.
        </div>
      ) : null}

      {showLinkProduct ? (
        <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <p className="text-[13px] font-medium">Proje bir ürüne bağlı değil</p>
          <p className="text-[12px] text-muted-foreground">Devretmeden önce mevcut bir SKU seçin ya da Ana Veri sihirbazından yeni bir SKU oluşturun.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Combobox value={linkProductId} onChange={setLinkProductId} options={manufacturableOptions} placeholder="Mevcut ürün seçin…" clearable={false} className="h-8 min-w-56" />
            <Button size="sm" onClick={linkProduct} disabled={!linkProductId || pending}>Bağla</Button>
            <Button size="sm" variant="outline" asChild><Link href="/ana-veri/urunler/yeni"><Wand2 className="size-3.5" /> Yeni SKU oluştur</Link></Button>
          </div>
        </div>
      ) : null}

      {/* Hedef maliyet karşılaştırma çubuğu */}
      {targetCost ? (
        <div className="space-y-1.5 rounded-lg border border-border/60 p-3">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-muted-foreground">Hedef maliyete göre</span>
            <span className={cn('font-mono font-medium tabular-nums', overTarget ? 'text-destructive' : 'text-success')}>
              <MoneyCell value={computation.unitCost.toFixed(4)} digits={2} /> / <MoneyCell value={targetCost.toFixed(4)} digits={2} muted />
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className={cn('h-full transition-[width] duration-200 ease-out', overTarget ? 'bg-destructive' : 'bg-success')} style={{ width: `${Math.min(100, barPct ?? 0)}%` }} />
          </div>
        </div>
      ) : null}

      {deltaVsPrev ? (
        <p className="text-[12px] text-muted-foreground">
          v{detail.previousVersion!.version}&apos;e göre fark:{' '}
          <span className={cn('font-medium tabular-nums', deltaVsPrev.gt(0) ? 'text-warning' : deltaVsPrev.lt(0) ? 'text-success' : '')}>
            {deltaVsPrev.gt(0) ? '+' : ''}<MoneyCell value={deltaVsPrev.toFixed(4)} digits={2} signed />
          </span>
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Parti miktarı">
          <Controller control={form.control} name="batchQty" render={({ field }) => <Input {...field} disabled={!editable} className="h-8 text-[13px] tabular-nums" />} />
        </Field>
        <Field label="Birim">
          <Controller control={form.control} name="batchUomId" render={({ field }) => (
            <Select value={field.value || undefined} onValueChange={field.onChange} disabled={!editable}>
              <SelectTrigger className="h-8 w-full text-[13px]"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{uomOptions.map((u) => (<SelectItem key={u.id} value={u.id}>{u.code}</SelectItem>))}</SelectContent>
            </Select>
          )} />
        </Field>
        <Field label="Verim %">
          <Controller control={form.control} name="expectedYieldPct" render={({ field }) => <Input {...field} disabled={!editable} className="h-8 text-[13px] tabular-nums" />} />
        </Field>
        <Field label="Genel gider (parti)">
          <Controller control={form.control} name="overheadPerBatch" render={({ field }) => <Input {...field} disabled={!editable} className="h-8 text-[13px] tabular-nums" />} />
        </Field>
      </div>

      {editable ? (
        <div className="space-y-1.5">
          <span className="text-[11px] text-muted-foreground">Satır ekle</span>
          <Combobox id="recipe-product-picker" value={null} onChange={(id) => { const p = id ? productById.get(id) : undefined; if (p) void addLine(p); }} options={productPickerOptions} placeholder="Ürün ara ve ekle…" clearable={false} />
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-left text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              <th className="px-2.5 py-2">Ürün</th>
              <th className="w-24 px-2 py-2 text-right">Miktar</th>
              <th className="w-36 px-2 py-2">Maliyet kaynağı</th>
              <th className="w-28 px-2 py-2 text-right">Birim maliyet</th>
              <th className="w-20 px-2 py-2 text-right">Fire %</th>
              <th className="w-28 px-2 py-2 text-right">Satır maliyeti</th>
              {editable ? <th className="w-9" /> : null}
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => {
              const product = productById.get(watched.lines[i]?.productId ?? '');
              const source = watched.lines[i]?.costSource ?? 'average';
              const uCost = unitCostFor(i);
              return (
                <tr key={f.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                  <td className="px-2.5 py-1.5">
                    {editable ? (
                      <Combobox value={watched.lines[i]?.productId ?? null} onChange={(v) => v && onProductChange(i, v)} options={productPickerOptions} placeholder="Ürün seçin" clearable={false} className="h-8" />
                    ) : (
                      <div><div className="font-medium">{product?.name}</div><div className="font-mono text-[11px] text-muted-foreground">{product?.sku}</div></div>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <Controller control={form.control} name={`lines.${i}.qty`} render={({ field }) => <Input {...field} disabled={!editable} className="h-8 text-right text-[13px] tabular-nums" />} />
                  </td>
                  <td className="px-2 py-1.5">
                    {editable ? (
                      <Select value={source} onValueChange={(v) => onCostSourceChange(i, v as CostSource)}>
                        <SelectTrigger className="h-8 w-full text-[13px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{COST_SOURCE_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent>
                      </Select>
                    ) : (
                      <span className="text-muted-foreground">{COST_SOURCE_LABELS[source]}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {editable && source === 'manual' ? (
                      <Controller control={form.control} name={`lines.${i}.manualUnitCost`} render={({ field }) => <Input {...field} className="h-8 text-right text-[13px] tabular-nums" />} />
                    ) : (
                      <MoneyCell value={uCost} digits={2} />
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <Controller control={form.control} name={`lines.${i}.scrapPct`} render={({ field }) => <Input {...field} disabled={!editable} className="h-8 text-right text-[13px] tabular-nums" />} />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <MoneyCell value={computation.lineCosts[i]?.toFixed(4) ?? '0'} digits={2} />
                  </td>
                  {editable ? (
                    <td className="px-1 py-1.5">
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive" aria-label="Satırı sil"><Trash2 className="size-3.5" /></Button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-border/60 pt-3 text-[13px]">
        <span className="text-muted-foreground">Malzeme maliyeti <MoneyCell value={computation.materialCost.toFixed(4)} digits={2} /></span>
        <span className="text-muted-foreground">Etkin çıktı <span className="font-mono tabular-nums">{computation.effectiveOutputQty.toFixed(2)}</span></span>
        <span className="font-medium">Birim maliyet <MoneyCell value={computation.unitCost.toFixed(4)} digits={2} className="text-[15px] font-semibold" /></span>
      </div>

      {editable ? (
        <Controller control={form.control} name="changeNote" render={({ field }) => <Textarea {...field} placeholder="Değişiklik notu…" rows={2} className="text-[13px]" />} />
      ) : detail.version.changeNote ? (
        <p className="text-[12px] text-muted-foreground">Not: {detail.version.changeNote}</p>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
