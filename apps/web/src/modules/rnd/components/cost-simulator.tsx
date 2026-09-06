'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Trash2, Loader2, Save, Send, Rocket, FlaskConical, Wand2 } from 'lucide-react';
import { D } from '@plantero/core/money';
import { computeTrialCost } from '@plantero/core/rnd/costFormula';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/form/combobox';
import { NumberInput } from '@/components/form/number-input';
import { MoneyCell } from '@/components/money-cell';
import { StatusBadge } from '@/components/status-badge';
import { formatQty } from '@/lib/format';
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
  // Onaya gönderilmiş (pending) bir versiyon onaylanana/reddedilene kadar KİLİTLİDİR — aksi halde
  // onaylayan kişi X'i onaylarken arka planda Y'ye değiştirilebilir (bkz. "Onaya gönder" akışı).
  const editable = canManage && EDITABLE_STATUSES.has(detail.version.status) && !detail.hasPendingApproval;
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
  // uomById: satırdaki miktarın yanında birim kodunu göstermek için (Tur 2 P1 arge-recete-12 —
  // birim hiç gösterilmiyordu, "Kavanoz 500ml → 1" (ADET) ile "Yulaf → 0,2" (KG) ayırt edilemiyordu).
  const uomById = useMemo(() => new Map(uomOptions.map((u) => [u.id, u])), [uomOptions]);

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
  // targetRatio: hedefe göre YÜZDE (100 = tam hedefte) — UNCAPPED, sapma rozetinde gerçek değeri gösterir.
  const targetRatio = targetCost && targetCost.gt(0) ? computation.unitCost.div(targetCost).mul(100) : null;
  const overTarget = targetCost && computation.unitCost.gt(targetCost);
  // Çubuk 0–150% hedef aralığını temsil eder (150 = hedefin %50 üstü) — 100 noktası işaretçiyle
  // gösterilir, dolgu bu ölçeğe göre orantılanır (Tur 1 P1 arge-recete-04: eskiden barPct 100'de
  // tavanlanıp dolgu HER ZAMAN konteynerin %100'ünü kaplıyordu, sapma miktarı görünmüyordu).
  const barScaleMax = 150;
  const barFillPct = targetRatio ? Math.min(100, Math.max(0, (targetRatio.toNumber() / barScaleMax) * 100)) : 0;
  const barTargetMarkerPct = (100 / barScaleMax) * 100;
  const deltaVsPrev = detail.previousVersion ? computation.unitCost.minus(D(detail.previousVersion.unitCost)) : null;
  const dirty = editable && form.formState.isDirty;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold">v{detail.version.version}</h2>
          <StatusBadge status={detail.version.status} label={status.label} tone={status.tone} />
          {detail.hasPendingApproval ? <StatusBadge status="pending" label="Onay bekliyor" tone="warning" /> : null}
          {/* Kaydedilmemiş değişiklik göstergesi — eskiden yalnızca kaydettikten sonra toast vardı,
              form kirliyken hiçbir görsel ipucu yoktu (Tur 1 P1 arge-recete-08). */}
          {dirty ? <StatusBadge status="dirty" label="Kaydedilmemiş değişiklik" tone="warning" dot /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable ? (
            <Button size="sm" variant="outline" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Kaydet
            </Button>
          ) : null}
          {editable && !detail.hasPendingApproval ? (
            <Button size="sm" onClick={submitApproval} disabled={pending}>
              <Send className="size-4" /> Onaya gönder
            </Button>
          ) : null}
          {canRelease && detail.version.status === 'approved' ? (
            <Button size="sm" onClick={release} disabled={pending} className="bg-primary">
              <Rocket className="size-4" /> Üretim BOM&apos;una devret
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
          <p className="text-[11px] text-muted-foreground">Devretmeden önce mevcut bir SKU seçin ya da Ana Veri sihirbazından yeni bir SKU oluşturun.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Combobox value={linkProductId} onChange={setLinkProductId} options={manufacturableOptions} placeholder="Mevcut ürün seçin…" clearable={false} className="h-8 min-w-56" />
            <Button size="sm" onClick={linkProduct} disabled={!linkProductId || pending}>Bağla</Button>
            <Button size="sm" variant="outline" asChild><Link href="/ana-veri/urunler/yeni"><Wand2 className="size-4" /> Yeni SKU oluştur</Link></Button>
          </div>
        </div>
      ) : null}

      {/* Hedef maliyet karşılaştırma çubuğu — kök neden düzeltmesi (Tur 1 P1 arge-recete-04): 8px
          tam-doygun kırmızı çubuk ekranın en baskın öğesiydi ve tek taşıdığı bilgi (üstünde/altında)
          zaten metinle de anlatılabiliyordu. Artık 4px, yarı saydam dolgu, hedef noktasında işaretçi
          + "%N hedef üstü/altında" rozetiyle sapma sayısallaştırılıyor. */}
      {targetCost ? (
        <div className="space-y-2 rounded-lg border border-border/60 p-4">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Hedef maliyete göre</span>
            <span className={cn('font-mono font-medium tabular-nums', overTarget ? 'text-destructive' : 'text-success')}>
              <MoneyCell value={computation.unitCost.toFixed(4)} digits={2} /> / <MoneyCell value={targetCost.toFixed(4)} digits={2} muted />
            </span>
          </div>
          <div className="relative">
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full transition-[width] duration-200 ease-out', overTarget ? 'bg-destructive/70' : 'bg-success/70')}
                style={{ width: `${barFillPct}%` }}
              />
            </div>
            {/* Hedef noktası işaretçisi: 150% ölçekte hedefin (100%) konumu, sabit ~%66,7 */}
            <div className="absolute -top-0.5 -bottom-0.5 w-px bg-foreground/40" style={{ left: `${barTargetMarkerPct}%` }} />
          </div>
          {targetRatio ? (
            <p className="text-[11px] text-muted-foreground">
              <span className={cn('font-medium tabular-nums', overTarget ? 'text-destructive' : 'text-success')}>
                %{Math.abs(targetRatio.minus(100).toNumber()).toFixed(0)}
              </span>{' '}
              {overTarget ? 'hedef üstü' : targetRatio.lt(100) ? 'hedef altında' : 'tam hedefte'}
            </p>
          ) : null}
        </div>
      ) : null}

      {deltaVsPrev ? (
        // Kök neden (Tur 2 P1 arge-recete-11): dıştaki span text-success/text-warning veriyordu AMA
        // MoneyCell'in `signed` modu kendi text-destructive/text-warning sınıfını uyguluyor ve
        // kazanıyordu — maliyet DÜŞÜŞÜ (iyi haber) kırmızı basılıyordu. `signed` KULLANILMIYOR artık;
        // işaret + ton tamamen burada (çağrı yerinde) belirlenir, MoneyCell salt biçimlendirici.
        <p className="text-[11px] text-muted-foreground">
          v{detail.previousVersion!.version}&apos;e göre fark:{' '}
          <span className={cn('inline-flex items-baseline font-medium tabular-nums', deltaVsPrev.gt(0) ? 'text-warning' : deltaVsPrev.lt(0) ? 'text-success' : 'text-muted-foreground')}>
            {deltaVsPrev.gt(0) ? '+' : deltaVsPrev.lt(0) ? '−' : ''}
            <MoneyCell value={deltaVsPrev.abs().toFixed(4)} digits={2} className="text-inherit" />
          </span>
        </p>
      ) : null}

      {/* h-11 md:h-8 (kontroller) / data-[size=sm]:h-11 md:data-[size=sm]:h-8 (SelectTrigger): 390px'te
          gerçek 44px dokunma hedefi, masaüstünde eski 32px kompakt satır korunur (Tur 2 P1
          arge-recete-09) — depoda kabul edilen desen (data-table/pagination.tsx, finance/cashflow-
          toolbar.tsx vb.). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Parti miktarı">
          <Controller control={form.control} name="batchQty" render={({ field }) => (
            <NumberInput value={field.value} onChange={(v) => field.onChange(v ?? '')} onBlur={field.onBlur} maxDigits={4} disabled={!editable} className="w-full" inputClassName="h-11 md:h-8" />
          )} />
        </Field>
        <Field label="Birim">
          <Controller control={form.control} name="batchUomId" render={({ field }) => (
            <Select value={field.value || undefined} onValueChange={field.onChange} disabled={!editable}>
              <SelectTrigger size="sm" className="w-full text-[13px] data-[size=sm]:h-11 md:data-[size=sm]:h-8"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{uomOptions.map((u) => (<SelectItem key={u.id} value={u.id}>{u.code}</SelectItem>))}</SelectContent>
            </Select>
          )} />
        </Field>
        <Field label="Verim %">
          <Controller control={form.control} name="expectedYieldPct" render={({ field }) => (
            <NumberInput value={field.value} onChange={(v) => field.onChange(v ?? '')} onBlur={field.onBlur} maxDigits={4} disabled={!editable} className="w-full" inputClassName="h-11 md:h-8" />
          )} />
        </Field>
        <Field label="Genel gider (parti)">
          <Controller control={form.control} name="overheadPerBatch" render={({ field }) => (
            <NumberInput value={field.value} onChange={(v) => field.onChange(v ?? '')} onBlur={field.onBlur} maxDigits={4} minDigits={2} prefix="₺" disabled={!editable} className="w-full" inputClassName="h-11 md:h-8" />
          )} />
        </Field>
      </div>

      {editable ? (
        <div className="space-y-1.5">
          <span className="text-[11px] text-muted-foreground">Satır ekle</span>
          <Combobox id="recipe-product-picker" value={null} onChange={(id) => { const p = id ? productById.get(id) : undefined; if (p) void addLine(p); }} options={productPickerOptions} placeholder="Ürün ara ve ekle…" clearable={false} />
        </div>
      ) : null}

      {/* min-w-[760px]: sütun genişlik ipuçlarının toplamı (~630px) + Ürün sütununa gerçekçi bir
          taban — tablo bu genişliğin altına SIKIŞTIRILAMAZ, dar viewport'ta sarmalayıcı div kaydırır
          (Tur 1 P0 arge-recete-01: eskiden `table-auto` konteynerin genişliğine göre sütunları
          orantılı küçültüyordu, Miktar/Fire % input'ları görünür genişlikten daha uzun metin taşıyıp
          kırpılıyordu — 390px'te '0.1500' → '0.1'). */}
      <div className="scrollbar-thin scroll-fade-x overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full min-w-[800px] text-[13px]">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-left text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              <th className="px-2.5 py-2">Ürün</th>
              <th className="w-36 px-2 py-2 text-right">Miktar</th>
              <th className="w-36 px-2 py-2">Maliyet kaynağı</th>
              <th className="w-32 px-2 py-2 text-right">Birim maliyet</th>
              <th className="w-24 px-2 py-2 text-right">Fire %</th>
              <th className="w-28 px-2 py-2 text-right">Satır maliyeti</th>
              {editable ? <th className="w-9" /> : null}
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => {
              const product = productById.get(watched.lines[i]?.productId ?? '');
              const source = watched.lines[i]?.costSource ?? 'average';
              const uCost = unitCostFor(i);
              // Satır bazlı doğrulama: miktar boş/0 ise satır altına hata metni (eskiden yalnızca
              // kayıt sırasında genel bir toast vardı — Tur 1 P1 arge-recete-08).
              const qtyMissing = editable && !(watched.lines[i]?.qty ?? '').trim();
              return (
                <Fragment key={f.id}>
                  <tr className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                    <td className="px-2.5 py-[3px]">
                      {editable ? (
                        // Dinlenmede kenarlıksız/saydam, yalnızca hover/focus'ta kenarlık — "çerçeve
                        // çorbası" kök neden düzeltmesi (Tur 1 P1 arge-recete-03). `[@media(hover:none)]`
                        // taban affordance'ı: proje genelindeki `hover:` custom variant `(hover:hover)
                        // and (pointer:fine)` ile sınırlı — dokunmatikte hover ASLA tetiklenmiyor, bu
                        // satırın düzenlenebilir olduğu hiç görünmüyordu (Tur 2 P1 arge-recete-10);
                        // row-actions.tsx'teki aynı `[@media(hover:none)]:` deseni.
                        <Combobox
                          value={watched.lines[i]?.productId ?? null}
                          onChange={(v) => v && onProductChange(i, v)}
                          options={productPickerOptions}
                          placeholder="Ürün seçin"
                          clearable={false}
                          className="h-11 border-transparent bg-transparent hover:border-input md:h-8 [@media(hover:none)]:border-input/50"
                        />
                      ) : (
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-medium">{product?.name}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">{product?.sku}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-[3px] text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Controller control={form.control} name={`lines.${i}.qty`} render={({ field }) => (
                          <NumberInput
                            value={field.value}
                            onChange={(v) => field.onChange(v ?? '')}
                            onBlur={field.onBlur}
                            maxDigits={4}
                            minDigits={4}
                            disabled={!editable}
                            aria-invalid={qtyMissing}
                            className="min-w-0 flex-1"
                            inputClassName="h-11 min-w-16 border-transparent bg-transparent text-right hover:border-input md:h-8 [@media(hover:none)]:border-input/50"
                          />
                        )} />
                        {/* Birim kodu (11px muted): "0,2 KG" / "1 ADET" — birimsiz miktar hücresi
                            "Kavanoz 500ml → 1" ile "Yulaf → 0,2"yi ayırt edilemez kılıyordu
                            (Tur 2 P1 arge-recete-12). minDigits=4=maxDigits: ondalık basamak sayısı
                            satırdan satıra değişmiyor artık, ondalık ayırıcı aynı x'te hizalanır
                            (Tur 2 P2 arge-recete-13). */}
                        <span className="shrink-0 text-[11px] text-muted-foreground">{uomById.get(watched.lines[i]?.uomId ?? '')?.code ?? ''}</span>
                      </div>
                    </td>
                    <td className="px-2 py-[3px]">
                      {editable ? (
                        <Select value={source} onValueChange={(v) => onCostSourceChange(i, v as CostSource)}>
                          <SelectTrigger size="sm" className="w-full border-transparent bg-transparent text-[13px] hover:border-input data-[size=sm]:h-11 md:data-[size=sm]:h-8 [@media(hover:none)]:border-input/50"><SelectValue /></SelectTrigger>
                          <SelectContent>{COST_SOURCE_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent>
                        </Select>
                      ) : (
                        <span className="text-muted-foreground">{COST_SOURCE_LABELS[source]}</span>
                      )}
                    </td>
                    <td className="px-2 py-[3px] text-right">
                      {editable && source === 'manual' ? (
                        <Controller control={form.control} name={`lines.${i}.manualUnitCost`} render={({ field }) => (
                          <NumberInput
                            value={field.value}
                            onChange={(v) => field.onChange(v ?? '')}
                            onBlur={field.onBlur}
                            maxDigits={4}
                            minDigits={2}
                            prefix="₺"
                            className="w-full"
                            inputClassName="h-11 min-w-16 border-transparent bg-transparent hover:border-input md:h-8 [@media(hover:none)]:border-input/50"
                          />
                        )} />
                      ) : (
                        <MoneyCell value={uCost} digits={2} />
                      )}
                    </td>
                    <td className="px-2 py-[3px]">
                      <Controller control={form.control} name={`lines.${i}.scrapPct`} render={({ field }) => (
                        <NumberInput
                          value={field.value}
                          onChange={(v) => field.onChange(v ?? '')}
                          onBlur={field.onBlur}
                          maxDigits={4}
                          disabled={!editable}
                          className="w-full"
                          inputClassName="h-11 min-w-16 border-transparent bg-transparent hover:border-input md:h-8 [@media(hover:none)]:border-input/50"
                        />
                      )} />
                    </td>
                    <td className="px-2 py-[3px] text-right">
                      <MoneyCell value={computation.lineCosts[i]?.toFixed(4) ?? '0'} digits={2} />
                    </td>
                    {editable ? (
                      <td className="px-1 py-[3px]">
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(i)} className="size-11 text-muted-foreground hover:text-destructive md:size-8" aria-label="Satırı sil"><Trash2 className="size-4" /></Button>
                      </td>
                    ) : null}
                  </tr>
                  {qtyMissing ? (
                    <tr className="border-b border-border/40 last:border-0">
                      <td colSpan={editable ? 7 : 6} className="px-2.5 pb-1.5 text-[11px] text-destructive">Miktar gerekli</td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-border/60 pt-3 text-[13px]">
        <span className="text-muted-foreground">Malzeme maliyeti <MoneyCell value={computation.materialCost.toFixed(4)} digits={2} /></span>
        {/* formatQty: tr-TR virgül ondalık — eskiden .toFixed(2) nokta ondalık basıyordu, hemen
            yanındaki ₺ tutarı virgüllüydü (Tur 1 P1 arge-recete-02). */}
        <span className="text-muted-foreground">Etkin çıktı <span className="tabular-nums">{formatQty(computation.effectiveOutputQty.toFixed(4), undefined, { maxDigits: 2 })}</span></span>
        <span className="font-medium">Birim maliyet <MoneyCell value={computation.unitCost.toFixed(4)} digits={2} className="text-[15px] font-semibold" /></span>
      </div>

      {editable ? (
        <Controller control={form.control} name="changeNote" render={({ field }) => <Textarea {...field} placeholder="Değişiklik notu…" rows={2} className="text-[13px]" />} />
      ) : detail.version.changeNote ? (
        <p className="text-[11px] text-muted-foreground">Not: {detail.version.changeNote}</p>
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
