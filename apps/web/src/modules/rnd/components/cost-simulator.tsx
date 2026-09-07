'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Trash2, Loader2, Save, Send, Rocket, FlaskConical, Wand2, Copy } from 'lucide-react';
import { D } from '@plantero/core/money';
import { computeTrialCost } from '@plantero/core/rnd/costFormula';
// `status.js`'ten (DB'siz/saf dosya) içe aktarılır, `trials.js`'ten DEĞİL: trials.ts sunucuya özgü
// `@plantero/db` (postgres sürücüsü) içe aktarır — bu, 'use client' bileşenine sızarsa derleme
// `net`/`tls` (Node-only) modülleri bulamaz diye patlar (bkz. status.ts dosya başı yorumu).
import { EDITABLE_STATUSES } from '@plantero/core/rnd/status';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/form/combobox';
import { NumberInput } from '@/components/form/number-input';
import { MoneyCell } from '@/components/money-cell';
import { StatusBadge } from '@/components/status-badge';
import { formatQty } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NewRecipeDialog } from './new-recipe-dialog';
import { updateVersionDraftAction, submitForApprovalAction, releaseToBomAction, resolveLineCostAction, linkProductToProjectAction } from '../actions';
import { TRIAL_STATUS_LABELS, COST_SOURCE_OPTIONS, COST_SOURCE_LABELS } from '../labels';
import type { CostSource, ProductOption, VersionDetail, VersionListItem } from '../queries';

// `resolvedUnitCost`: sunucudan çözülen ortalama/son-alış maliyeti — forma AİTTİR (RHF ile birlikte
// satır kaldırılıp eklenirken kayar), dışarıda ayrı bir index/id anahtarlı map tutmaya gerek kalmaz.
type LineForm = { productId: string; qty: string; uomId: string; costSource: CostSource; manualUnitCost: string; resolvedUnitCost: string; scrapPct: string };
type FormValues = { batchQty: string; batchUomId: string; expectedYieldPct: string; overheadPerBatch: string; overheadPerUnit: string; changeNote: string; lines: LineForm[] };

// Satır tablosunun (aşağıda) `md:` grid sütun genişlikleri — eski `<table>`'ın `w-36/w-32/w-24/w-28/
// w-9` ipuçlarıyla BİREBİR aynı (9/9/8/6/7/2.25rem), CSS DEĞİŞKENİ olarak taşınır: Tailwind arbitrary
// sınıfı (`md:[grid-template-columns:var(--line-cols)]`) SABİT/literal kalır (JIT taraması güvenli),
// yalnızca değişkenin çalışma zamanı değeri satır bazında ayarlanır. Sütun sayısı hep 7 — `editable`
// false iken son (aksiyon) sütun boş kalır, tabloyu her seferinde yeniden şablonlamaya gerek kalmaz.
const LINE_COLS_STYLE = { '--line-cols': 'minmax(0,1fr) 9rem 9rem 8rem 6rem 7rem 2.25rem' } as React.CSSProperties;

/** Mobil (< md) malzeme kartının kontrol şeridi sütun genişlikleri — kök neden düzeltmesi (Tur 5 P1
 *  arge-recete-27): eskiden 4 ayrı satır (ürün+sil / miktar+kaynak / birim maliyet+fire / satır
 *  maliyeti) 194,5px'e ulaşıyordu. Artık 2 satır: (1) ürün + satır maliyeti + sil, (2) Miktar/
 *  Kaynak/Birim maliyet/Fire % TEK 44px şeritte, etiketler ÜSTTE (dar sütunlarda inline etiket+değer
 *  sığmaz — Tur 4 P1 arge-recete-21'in "aynı satırda" ilkesi burada SÜTUN başına bir kez uygulanır,
 *  alan başına değil). Kaynak'a en geniş pay (Select metni en uzun: "Ortalama"/"Son alış").
 */
const MOBILE_LINE_COLS_STYLE = { '--mobile-line-cols': '1.25fr 1.2fr 0.9fr 0.65fr' } as React.CSSProperties;

/** Hücre kontrolleri (Combobox/NumberInput/Select) için ORTAK dinlenme/etkileşim sınıfı — kök neden
 *  düzeltmesi (Tur 5 P1 arge-recete-29): önceki `border-transparent` yaklaşımı REST'te GÖRÜNMEZ ama
 *  hâlâ `border-width:1px` taşıyordu (Input/SelectTrigger'ın kendi frozen taban sınıfı) — "dört tarafı
 *  kenarlıklı dikdörtgen" sayısı buna göre ölçüldüğünde (1440'ta 26, 390'da 27) HİÇ değişmiyordu; sıfır
 *  genişlikte gerçek "kenarlıksız" olmak için `border-0` gerekir. Görsel geri bildirim artık `border`
 *  DEĞİL bir iç `ring` (box-shadow) — bu, layout'u etkilemediği için önceki `border-transparent`
 *  seçiminin asıl amacını (hover'da 1px'lik içerik kayması olmaması) da korur, üstelik kenarlık genişliği
 *  hiç sayılmaz. Dokunmatik cihazlarda (`hover` hiç tetiklenmez) taban ipucu olarak hep-açık soluk ring.
 *  `shadow-none` EKLENDİ — kök neden düzeltmesi (Tur 6 P1 arge-recete-33): `border-0` yalnızca
 *  kenarlığı sıfırlıyordu, Input/SelectTrigger'ın taban sınıfındaki `shadow-xs` (rgba(0,0,0,.05) 0 1px
 *  2px) DURUYORDU — saydam zeminde bu gölge ekranda hâlâ yuvarlak bir kutu ÇİZİYORDU (dinlenmede kart
 *  içinde border VEYA saydam-olmayan gölge taşıyan dikdörtgen sayısı 1440'ta 19, 390'da 20 idi). Artık
 *  hem kenarlık hem gölge sıfır; affordans SADECE hover/dokunmatik ring'den geliyor. */
const CELL_CONTROL_CLS =
  'border-0 shadow-none hover:ring-1 hover:ring-inset hover:ring-input [@media(hover:none)]:ring-1 [@media(hover:none)]:ring-inset [@media(hover:none)]:ring-input/50';

/** Mobil (< md) satır etiketleri: md+ üstünde başlık satırı zaten aynı bilgiyi taşıdığı için gizlenir.
 *  Etiket-değer çifti TEK SATIRDA (etiket solda, değer sağda) — üst üste yığılmış label+control ikilisi
 *  satır yüksekliğini ikiye katlıyordu (kök neden düzeltmesi, Tur 4 P1 arge-recete-21). */
function FieldLabel({ children }: { children: React.ReactNode; align?: 'right' }) {
  // sr-only (önceden `block leading-4`): kök neden düzeltmesi (Tur 6 P1 arge-recete-35) — bu etiket
  // yalnızca DÜZENLENEBİLİR mobil kartta görünür kalıyordu (salt-okunurda üst bandın tamamı gizli,
  // bkz. çağrı yeri) ve tek başına 16px görsel yükseklik tüketiyordu; kart 129px'ten referans
  // bandının (56-72px) çok üstünde kalıyordu. Erişilebilir isim (screen reader) KORUNUR, görsel alan
  // sıfırlanır — dar sütunda kontrolün (Select/NumberInput) kendi değeri (ör. "Ortalama", "0,20")
  // anlamı zaten taşır, mobil düzenleyen kullanıcı için görsel etiket olmadan da okunabilir.
  return <span className="sr-only">{children}</span>;
}

export function CostSimulator({
  detail, projectId, productOptions, uomOptions, canManage, canRelease,
  recipeGroups, selectedRecipeId, onSelectRecipe, versions, selectedVersionId, onSelectVersion, onNewVersion, newVersionPending,
}: {
  detail: VersionDetail;
  projectId: string;
  productOptions: ProductOption[];
  uomOptions: Array<{ id: string; code: string; name: string }>;
  canManage: boolean;
  canRelease: boolean;
  /** Mobil (< lg) TEK SATIRLIK reçete/versiyon seçici + Kaydet/Onaya gönder — kök neden düzeltmesi
   *  (Tur 4 P1 arge-recete-18): RecipeWorkspace'in AYRI bir araç çubuğu satırı KALDIRILDI, seçim
   *  buraya (başlık şeridine) taşındı ki hedef maliyet paneline kadar tek bir 44px satır kalsın,
   *  iki değil. Masaüstünde (md+) kullanılmaz — dikey sidebar (recipe-workspace.tsx) zaten var. */
  recipeGroups: Array<{ id: string; name: string }>;
  selectedRecipeId: string | null;
  onSelectRecipe: (id: string) => void;
  versions: VersionListItem[];
  selectedVersionId: string | null;
  onSelectVersion: (id: string) => void;
  onNewVersion: () => void;
  newVersionPending: boolean;
}) {
  const router = useRouter();
  // Yalnızca 'draft' düzenlenebilir — core'daki `EDITABLE_STATUSES` (packages/core/src/rnd/status.ts,
  // I54) TEK doğruluk kaynağı: 'testing' (onaya gönderilmiş) kasıtlı olarak KÜMEDE DEĞİL, çünkü onay
  // o andaki maliyeti dondurur (`approvals.payload.unitCost`) ve düzenleme onaylanan rakamla üretime
  // giden rakamı sessizce ayrıştırabilirdi. `!detail.hasPendingApproval` ek bir savunma katmanı.
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
    // space-y-2 (mobil) / md:space-y-3: kök neden düzeltmesi (Tur 4+5 P1 arge-recete-18, GENİŞLETİLDİ
    // Tur 6 P1 arge-recete-34) — masaüstünde md:space-y-6 (24px) 5 bölüm arasında 5×24=120px krom
    // tüketiyordu; kartın üst kenarı ile ilk malzeme satırı arasında 329px açık kalıyor, 900px'lik
    // ekranda 6 malzemenin ancak 4'ü görünüyordu. 12px hâlâ 8pt ölçeğinde (4/8/12/16/24) — yalnızca bir
    // basamak küçük.
    <div className="space-y-2 md:space-y-3">
      {/* flex-nowrap + overflow-x-auto: kök neden düzeltmesi (Tur 4 P1 arge-recete-18) — 390px'te
          önceki `flex-wrap` v1/Taslak rozetini Kaydet/Onaya gönder'den AYRI bir SATIRA düşürüyordu
          (dar genişlikte sığmadığı için), hedef maliyet panelinin üstündeki bütçeyi ~35px fazladan
          tüketiyordu. Artık her zaman TEK satır — gerekirse yatay kaydırma (nadiren, çok dar
          ekranlarda "Onaya gönder" metniyle). */}
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto md:justify-between md:gap-3">
        {/* Masaüstü (md+): v1 + durum rozetleri — değişmedi. */}
        <div className="hidden shrink-0 items-center gap-2 md:flex">
          {/* text-[13px] (eskiden 15px): kök neden düzeltmesi (Tur 5 P1 arge-recete-26) — tek kullanımlık
              bir kademe eleniyor, tablonun tabanıyla (13px) eşitleniyor; ekrandaki tek "büyük" rakam
              artık yukarıdaki hedef bandı hero metriği (24px). */}
          <h2 className="text-[13px] font-semibold">v{detail.version.version}</h2>
          <StatusBadge status={detail.version.status} label={status.label} tone={status.tone} />
          {detail.hasPendingApproval ? <StatusBadge status="pending" label="Onay bekliyor" tone="warning" /> : null}
          {/* Kaydedilmemiş değişiklik göstergesi — eskiden yalnızca kaydettikten sonra toast vardı,
              form kirliyken hiçbir görsel ipucu yoktu (Tur 1 P1 arge-recete-08). */}
          {dirty ? <StatusBadge status="dirty" label="Kaydedilmemiş değişiklik" tone="warning" dot /> : null}
        </div>
        {/* Mobil (< md): reçete/versiyon seçici + yeni-reçete/yeni-versiyon — AYNI satırda Kaydet/
            Onaya gönder ile (kök neden düzeltmesi, Tur 4 P1 arge-recete-18): RecipeWorkspace'in ayrı
            araç çubuğu satırı ortadan kalktı, hedef maliyet paneline kadar TEK bir 44px satır kaldı.
            Seçili versiyonun metni ("v1 · Taslak") masaüstündeki h2+rozet ikilisinin yerini alır —
            aynı bilgi iki kez gösterilmez. */}
        {/* w-24/w-28 SABİT (flex-1 DEĞİL): satır dar olduğunda flex-shrink bu seçicileri kullanılamaz
            genişliğe (ör. 18px) sıkıştırmasın — satırın kendi `overflow-x-auto`'su zaten güvenlik ağı. */}
        <div className="flex shrink-0 items-center gap-1.5 md:hidden">
          {recipeGroups.length > 1 ? (
            // Native `<select>` → paylaşılan Select bileşeni: kök neden düzeltmesi (Tur 5 P1
            // arge-recete-28) — tarayıcının kendi `appearance:auto` oku, kendi metin metrikleri ve
            // odak halkası hemen altındaki "Birim" alanıyla (shadcn Select) görsel olarak çelişiyordu.
            <Select value={selectedRecipeId ?? undefined} onValueChange={onSelectRecipe}>
              <SelectTrigger size="sm" aria-label="Reçete" className="w-24 shrink-0 text-[13px] data-[size=sm]:h-11 md:data-[size=sm]:h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>{recipeGroups.map((g) => (<SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>))}</SelectContent>
            </Select>
          ) : null}
          {versions.length > 0 ? (
            <Select value={selectedVersionId ?? undefined} onValueChange={onSelectVersion}>
              <SelectTrigger size="sm" aria-label="Versiyon" className="w-28 shrink-0 text-[13px] data-[size=sm]:h-11 md:data-[size=sm]:h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => {
                  const s = TRIAL_STATUS_LABELS[v.status] ?? { label: v.status, tone: 'muted' as const };
                  return <SelectItem key={v.id} value={v.id}>{`v${v.version} · ${s.label}`}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          ) : null}
          {canManage ? (
            <>
              <NewRecipeDialog projectId={projectId} productOptions={productOptions} compact triggerClassName="shrink-0" />
              <Button variant="outline" size="icon" className="size-11 shrink-0" onClick={onNewVersion} disabled={newVersionPending} aria-label="Yeni versiyon">
                {newVersionPending ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
              </Button>
            </>
          ) : null}
        </div>
        {/* sr-only md:not-sr-only: mobilde ikon-yalnız (yeni birleşik satırda "Onaya gönder" metni
            genişliği taşmaya + yatay kaydırmayla gizli birincil eyleme yol açıyordu), md+ üstünde
            metin geri döner — aynı buton, aynı tıklanabilir alan, yalnızca etiket görünürlüğü
            değişir (erişilebilirlik ağacında her zaman VAR, ekran okuyucu her koşulda okur). */}
        <div className="flex shrink-0 flex-nowrap items-center gap-2">
          {editable ? (
            // h-11 md:h-8: 390px'te gerçek 44px dokunma hedefi — sayfadaki diğer TÜM kontrollerle
            // aynı desen (Tur 4 P1 arge-recete-20; önceden yalnız bu iki başlık şeridi butonu atlanmıştı).
            <Button size="sm" variant="outline" onClick={save} disabled={pending} className="h-11 min-w-11 md:h-8 md:min-w-0">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} <span className="sr-only md:not-sr-only">Kaydet</span>
            </Button>
          ) : null}
          {editable && !detail.hasPendingApproval ? (
            <Button size="sm" onClick={submitApproval} disabled={pending} className="h-11 min-w-11 md:h-8 md:min-w-0">
              <Send className="size-4" /> <span className="sr-only md:not-sr-only">Onaya gönder</span>
            </Button>
          ) : null}
          {canRelease && detail.version.status === 'approved' ? (
            <Button size="sm" onClick={release} disabled={pending} className="h-11 min-w-11 bg-primary md:h-8 md:min-w-0">
              <Rocket className="size-4" /> <span className="sr-only md:not-sr-only">Üretim BOM&apos;una devret</span>
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
      {/* Kenarlıksız blok (kök neden düzeltmesi, Tur 4 P1 arge-recete-24): tam kenarlıklı kutu-içinde-
          kutu üç kattaydı (kart + bu panel + satır tablosu); ana kartla arasındaki ayrım artık ince bir
          zemin tonuyla ("nefes alan" — anti-erp), ayrı bir çerçeve DEĞİL. */}
      {targetCost ? (
        // p-3 + space-y-1.5 (önceden p-4 + space-y-2) + bar/oran satırının BİRLEŞTİRİLMESİ — kök
        // neden düzeltmesi (Tur 6 P1 arge-recete-34): bant 115px'e ulaşıyordu (kart üstü ile ilk
        // malzeme satırı arasındaki 329px kromun en büyük kalemi), hedef ≤96px. Ana metrik (24px hero,
        // Tur 5 arge-recete-26'da kazanılmıştı) KÜÇÜLTÜLMEDİ — kazanım yalnızca dolgu/boşluk ve
        // çubuk+oran metninin TEK satıra inmesinden geliyor.
        <div className="space-y-1.5 rounded-lg bg-muted/30 p-3">
          {/* Ana metrik ≥24px/600 tabular-nums (kök neden düzeltmesi, Tur 5 P1 arge-recete-26):
              eskiden bu bant TEK tipografik kademe taşıyordu — birim maliyet, kendi etiketiyle
              ("Hedef maliyete göre") AYNI 11px'te basılıyordu, ekranın birincil çıktısı hiçbir
              yerde bir "hero" rakam olmuyordu (Stripe referansında ana metrik her zaman büyük ve
              tabular). Hedef değeri artık 12px muted ikincil etiket — karşılaştırma hâlâ mümkün
              ama görsel ağırlık ana metrikte. `font-mono` KALDIRILDI (Tur 5 P1 arge-recete-25):
              MoneyCell'in tek tipografisi (Inter tabular-nums) tablodaki/özetteki para
              değerleriyle birebir eşleşir — aynı tutar ekranda iki farklı yazı tipiyle basılmaz. */}
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">Hedef maliyete göre</p>
              <MoneyCell
                value={computation.unitCost.toFixed(4)}
                digits={2}
                className={cn('text-2xl leading-tight font-semibold tabular-nums', overTarget ? 'text-warning' : 'text-success')}
              />
            </div>
            {/* overTarget → text-warning/bg-warning (renk disiplini, Tur 3 P1): hedef aşımı bir UYARI,
                gerçek hata/yıkıcı eylem tonu (destructive) değil — /arge/projeler kart listesindeki
                aynı olgu (project-list.tsx) zaten warning basıyor, buradaki destructive'i eşitliyoruz. */}
            <div className="shrink-0 text-right">
              <p className="text-[11px] text-muted-foreground">Hedef</p>
              <MoneyCell value={targetCost.toFixed(4)} digits={2} className="text-[12px] font-medium" muted />
            </div>
          </div>
          {/* Çubuk + sapma metni TEK satırda (önceden 2 ayrı satır + aralarında space-y-2 boşluğu) —
              kök neden düzeltmesi (Tur 6 P1 arge-recete-34): oranın kendi satırı ~14px + bir 8px'lik
              boşluk tüketiyordu, bilgi kaybı olmadan tek satıra sığar. */}
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full transition-[width] duration-200 ease-out', overTarget ? 'bg-warning/70' : 'bg-success/70')}
                  style={{ width: `${barFillPct}%` }}
                />
              </div>
              {/* Hedef noktası işaretçisi: 150% ölçekte hedefin (100%) konumu, sabit ~%66,7 */}
              <div className="absolute -top-0.5 -bottom-0.5 w-px bg-foreground/40" style={{ left: `${barTargetMarkerPct}%` }} />
            </div>
            {targetRatio ? (
              <p className="shrink-0 text-[11px] whitespace-nowrap text-muted-foreground">
                <span className={cn('font-medium tabular-nums', overTarget ? 'text-warning' : 'text-success')}>
                  %{Math.abs(targetRatio.minus(100).toNumber()).toFixed(0)}
                </span>{' '}
                {overTarget ? 'hedef üstü' : targetRatio.lt(100) ? 'hedef altında' : 'tam hedefte'}
              </p>
            ) : null}
          </div>
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
          toolbar.tsx vb.). Mobil: 2 sütunlu ızgara, etiket kontrolün ÜSTÜNDE (değişmedi). Masaüstü
          (md+): TEK 32px'lik yatay şerit (kök neden düzeltmesi, Tur 6 P1 arge-recete-34) — eskiden 4
          alan yığılı etiket+kontrol ile ~56px yükseklik tüketiyordu (kart üstü ile ilk malzeme
          satırı arasındaki 329px kromun bir kalemi); `Field` artık md+ üstünde etiketi kontrolün
          SOLUNA alır (bkz. `Field` tanımı), satır yüksekliği kontrolün kendi h-8'ine iner. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:flex md:flex-nowrap md:items-center md:gap-4">
        <Field label="Parti miktarı">
          {/* minDigits=4 (kök neden düzeltmesi, Tur 5 P1 arge-recete-25): satır tablosundaki "Miktar"
              kolonu da minDigits=4 kullanıyor (Tur 2 P2 arge-recete-13 — ondalık ayırıcı hizası için);
              aynı boyuttaki (miktar) alan burada 0 ondalıkla ("1") FARKLI bir politika sergiliyordu.
              Tek politika: TÜM miktar alanları minDigits=maxDigits=4. */}
          <Controller control={form.control} name="batchQty" render={({ field }) => (
            <NumberInput value={field.value} onChange={(v) => field.onChange(v ?? '')} onBlur={field.onBlur} maxDigits={4} minDigits={4} disabled={!editable} className="w-full" inputClassName="h-11 md:h-8" />
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

      {/* Kök neden düzeltmesi (Tur 3 P1 criterion-5/9): eskiden gerçek bir `<table min-w-[800px]>`
          idi — 390px'te 478px yatay taşma üretiyor, "Maliyet kaynağı/Birim maliyet/Fire %/Satır
          maliyeti" sütunları görünür alanın dışında kalıyordu. Artık gerçek bir `<table>` DEĞİL,
          `role="table"` taşıyan bir CSS Grid: `md:` altında (767px ve altı) her satır 2 sütuna
          YIĞILIR, her alanın ETİKETİ görünür kalır (`labelClassName` yalnızca `md:hidden`); `md:` ve
          üstünde AYNI grid, sütun sayısı `gridTemplateColumns` ile masaüstündeki eski sütun
          genişlikleriyle (9/9/8/6/7rem) birebir eşleşen sabit bir şablona döner — TEK bir DOM ağacı,
          form alanları hiçbir yerde ikiye katlanmaz (React Hook Form `Controller`'ları tek mount). */}
      {/* text-[13px] tabana: MoneyCell/etiket dışı hiçbir hücrede kendi font-size'ı yoktu, kapsayıcı
          `role="table"` gövdenin (body) 16px tabanını miras bırakıyordu — kök neden düzeltmesi (Tur 4
          P1 arge-recete-19). Başlık şeridi DataTable'ın kendi diliyle eşitlendi: 12px, normal-case,
          letter-spacing yok, zemin yok — yalnız alt hairline (Tur 4 P1 arge-recete-23; iskeletteki
          başlık şeridi de aynı düzeltmeyi görür, bkz. recipe-workspace.tsx CostSimulatorSkeleton). */}
      <div className="rounded-lg border border-border/60 text-[13px]" role="table" aria-label="Reçete satırları">
        {/* py-2 (yatay dolgu YOK): kök neden düzeltmesi (Tur 5 P2 arge-recete-30) — başlık şeridi
            eskiden TEK bir dış `px-3` ile döşeliydi, aşağıdaki veri hücreleri ise HER SÜTUN kendi
            `md:px-2`/`md:px-2.5` dolgusunu taşıyordu (12px vs 8/10px) — sağa hizalı sayı sütunlarında
            başlık ile değer 4px kaymalı duruyordu. Artık başlık HER sütunda veri hücresiyle BİREBİR
            aynı dolguyu kullanır (aynı grid şablonu zaten paylaşılıyordu) — optik eksen tam örtüşür. */}
        <div
          className="hidden border-b border-border/60 py-2 text-left text-[12px] font-medium text-muted-foreground md:grid md:gap-2 md:[grid-template-columns:var(--line-cols)]"
          style={LINE_COLS_STYLE}
          role="row"
        >
          <span role="columnheader" className="px-2.5">Ürün</span>
          <span role="columnheader" className="px-2 text-right">Miktar</span>
          <span role="columnheader" className="px-2">Maliyet kaynağı</span>
          <span role="columnheader" className="px-2 text-right">Birim maliyet</span>
          <span role="columnheader" className="px-2 text-right">Fire %</span>
          <span role="columnheader" className="px-2 text-right">Satır maliyeti</span>
          {editable ? <span role="columnheader" className="px-1" aria-hidden /> : null}
        </div>
        <div role="rowgroup">
          {fields.map((f, i) => {
              const product = productById.get(watched.lines[i]?.productId ?? '');
              const source = watched.lines[i]?.costSource ?? 'average';
              const uCost = unitCostFor(i);
              // Satır bazlı doğrulama: miktar boş/0 ise satır altına hata metni (eskiden yalnızca
              // kayıt sırasında genel bir toast vardı — Tur 1 P1 arge-recete-08).
              const qtyMissing = editable && !(watched.lines[i]?.qty ?? '').trim();
              // Soluk-sıfır kuralı (Tur 4 P1 arge-recete-22): Fire % 0 iken tam foreground yerine
              // muted — accounting modülündeki `MoneyCell muted`/`isZero()` deseniyle aynı ilke,
              // burada düzenlenebilir bir NumberInput olduğu için sınıf düzeyinde uygulanır.
              const scrapZero = !D(watched.lines[i]?.scrapPct || '0').gt(0);
              return (
                <div
                  key={f.id}
                  role="row"
                  // p-2 + gap-y YOK (önceden p-2.5 + gap-y-1): kök neden düzeltmesi (Tur 6 P1
                  // arge-recete-35) — mobil kart referans bandının (56-72px) çok üstündeydi
                  // (düzenlenebilir 129px, salt-okunur 104,5px); FieldLabel artık `sr-only` (aşağısı)
                  // ve salt-okunur modda Miktar/Kaynak/Fire % bandı TAMAMEN gizlenip yerine tek satırlık
                  // özet metni geçtiği için dolgu/boşluk da sıkılaştırılır.
                  className="grid grid-cols-2 gap-x-3 border-b border-border/40 p-1.5 last:border-0 hover:bg-muted/20 md:items-center md:gap-2 md:p-0 md:py-[3px] md:[grid-template-columns:var(--line-cols)]"
                  style={LINE_COLS_STYLE}
                >
                  {/* Ürün + Satır maliyeti + Sil — TEK 44px satır (kök neden düzeltmesi, Tur 5 P1
                      arge-recete-27): "Satır maliyeti" mobilde artık ayrı bir satır TÜKETMİYOR, ürün
                      adının sağında görünür (öneri metniyle birebir). Not: aşağıdaki mobil "Satır
                      maliyeti" MoneyCell'i, masaüstündeki (asıl/tek) hücrenin `md:hidden` bir
                      KOPYASIDIR — RHF Controller'ı OLMAYAN salt-okunur türetilmiş bir değerdir
                      (computation.lineCosts[i]), bu yüzden ikisinin aynı anda DOM'da bulunması form
                      durumunu ikiye katlamaz (Sil butonunun mobil/masaüstü kopyalarıyla aynı ilke). */}
                  <div className="col-span-2 flex items-center gap-2 md:col-span-1 md:block md:px-2.5" role="cell">
                    <div className="min-w-0 flex-1">
                      {editable ? (
                          // Dinlenmede kenarlıksız, yalnızca hover/focus'ta ring — "çerçeve çorbası" kök
                          // neden düzeltmesi (Tur 1 P1 arge-recete-03, genişletildi Tur 5 P1 arge-recete-29).
                          <Combobox
                            value={watched.lines[i]?.productId ?? null}
                            onChange={(v) => v && onProductChange(i, v)}
                            options={productPickerOptions}
                            placeholder="Ürün seçin"
                            clearable={false}
                            className={cn('h-11 bg-transparent md:h-8', CELL_CONTROL_CLS)}
                          />
                        ) : (
                          // min-w-0 + truncate + title — kök neden düzeltmesi (Tur 6 P1 arge-recete-32):
                          // salt-okunur (devredilmiş) görünüm sayfanın VARSAYILAN açılışı; ad+SKU eskiden
                          // sarma korumasız basılıyordu, 172px'lik "Ürün" sütununa sığmayan satırlarda
                          // ("Hurma Şurubu", "Kavanoz 500ml") İKİNCİ SATIRA taşıyor, satır yüksekliğini
                          // 39'dan 46'ya çıkarıp tablo ritmini bozuyordu (39/46/39/46/39/38, %18 oynama).
                          // Düzenlenebilir görünümdeki Combobox zaten truncate ediyordu (Combobox.tsx
                          // `<span className="truncate">`) — aynı davranış burada da uygulanır: ad
                          // kırpılır (SKU sabit genişlikte kalır), tam metin `title` ile hover'da görünür.
                          <div className="flex min-w-0 items-baseline gap-1.5" title={product ? `${product.name} · ${product.sku}` : undefined}>
                            <span className="min-w-0 flex-1 truncate font-medium">{product?.name}</span>
                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{product?.sku}</span>
                          </div>
                        )}
                      {/* Mobil özet satırı (yalnızca salt-okunur) — kök neden düzeltmesi (Tur 6 P1
                          arge-recete-35): eskiden Miktar/Kaynak/Birim maliyet/Fire % bandı salt-okunur
                          modda da TAM boyutuyla (44px dokunma yüksekliğindeki NumberInput'lar dahil)
                          render ediliyordu, kart 104,5px'e çıkıyordu (referans 56-72px). Bant artık
                          aşağıda `!editable` iken mobilde TAMAMEN gizli (`hidden md:contents`); aynı
                          bilgi (miktar·birim, kaynak, fire) burada TEK muted satırda özetlenir. */}
                      {!editable ? (
                        <p className="truncate text-[11px] text-muted-foreground md:hidden">
                          {formatQty(watched.lines[i]?.qty ?? '0', undefined, { maxDigits: 4 })} {uomById.get(watched.lines[i]?.uomId ?? '')?.code ?? ''}
                          {' · '}
                          {COST_SOURCE_LABELS[source]}
                          {scrapZero ? '' : ` · Fire %${formatQty(watched.lines[i]?.scrapPct ?? '0', undefined, { maxDigits: 2 })}`}
                        </p>
                      ) : null}
                    </div>
                    <MoneyCell value={computation.lineCosts[i]?.toFixed(4) ?? '0'} digits={2} className="shrink-0 font-medium md:hidden" />
                    {/* Sil ikonu — mobilde Ürün satırının sağ ucunda (kök neden düzeltmesi, Tur 4 P1
                        arge-recete-21); masaüstünde aşağıdaki ayrı aksiyon hücresi kullanılır. */}
                    {editable ? (
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(i)} className="size-11 shrink-0 text-muted-foreground hover:text-destructive md:hidden" aria-label="Satırı sil"><Trash2 className="size-4" /></Button>
                    ) : null}
                  </div>
                  {/* Miktar/Kaynak/Birim maliyet/Fire % — masaüstünde HER ZAMAN görünür (`md:contents`
                      ile 7 sütunlu ızgaraya yayılır). Mobilde YALNIZCA düzenlenebilir modda görünür —
                      kök neden düzeltmesi (Tur 6 P1 arge-recete-35): salt-okunur modda bu bant hâlâ
                      44px'lik (disabled) NumberInput'ları render ediyordu, kartı gereksiz büyütüyordu;
                      aynı bilgi artık yukarıdaki tek satırlık mobil özette. `hidden` (mobil, !editable)
                      + `md:contents` (masaüstü, her zaman) — Controller'lar DOM'dan kalkmaz (yalnızca
                      `display:none`), form durumu bozulmaz. Editable modda TEK ~44px bant (kök neden
                      düzeltmesi, Tur 5 P1 arge-recete-27); etiketler artık `sr-only` (aşağısı, FieldLabel)
                      — erişilebilir isim korunur ama görsel yükseklik tüketmez (Tur 6 P1 arge-recete-35,
                      düzenlenebilir kart 129px'ten ≤104px'e). */}
                  <div className={cn('col-span-2 grid gap-x-1 [grid-template-columns:var(--mobile-line-cols)] md:contents', !editable && 'hidden md:contents')} style={MOBILE_LINE_COLS_STYLE}>
                    <div className="min-w-0 md:block md:px-2 md:text-right" role="cell">
                      <FieldLabel>Miktar</FieldLabel>
                      <div className="flex min-w-0 items-center gap-0.5 md:justify-end md:gap-1">
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
                            // px-1.5 (Input'un varsayılan px-3 yerine, kök neden düzeltmesi Tur 5 P1
                            // arge-recete-27): dar mobil sütunda 4 ondalıklı bir değer ("0,1500")
                            // 24px dolguyla KIRPILIYORDU (scrollWidth>clientWidth, arge-recete-01'in
                            // aynı hatası) — 12px'e düşürülünce içerik alanı yeterli.
                            inputClassName={cn('h-11 min-w-12 bg-transparent px-1.5 text-right md:h-8 md:px-3', CELL_CONTROL_CLS)}
                          />
                        )} />
                        {/* Birim kodu (11px muted): "0,2 KG" / "1 ADET" — birimsiz miktar hücresi
                            "Kavanoz 500ml → 1" ile "Yulaf → 0,2"yi ayırt edilemez kılıyordu
                            (Tur 2 P1 arge-recete-12). minDigits=4=maxDigits: ondalık basamak sayısı
                            satırdan satıra değişmiyor artık, ondalık ayırıcı aynı x'te hizalanır
                            (Tur 2 P2 arge-recete-13). SABİT genişlik (w-7/md:w-9) + sola yaslı — kök
                            neden düzeltmesi (Tur 6 P1 arge-recete-31): önceden bu span İÇERİK
                            genişliğindeydi ("KG"=2 / "ADET"=4 karakter), bu yüzden değerin sağ kenarı
                            birim koduna göre KAYIYORDU (1440'ta KG satırları 814,8px / ADET satırları
                            800,8px — 14px tırtık, 390'da aynı fark). Kod artık kendi SABİT hücresinde
                            olduğundan, kod ne kadar uzun olursa olsun input'un ayrılan alanı (ve dolayısıyla
                            sayının sağ kenarı) değişmez. */}
                        <span className="w-7 shrink-0 text-left text-[11px] text-muted-foreground md:w-9">{uomById.get(watched.lines[i]?.uomId ?? '')?.code ?? ''}</span>
                      </div>
                    </div>
                    <div className="min-w-0 md:block md:px-2" role="cell">
                      {/* Mobilde kısaltılmış etiket ("Kaynak") — masaüstü başlığı ("Maliyet kaynağı")
                          değişmedi; dar sütunda Select'e (Ortalama/Son alış/Manuel) daha çok yer
                          bırakır (Tur 4 P1 arge-recete-21 dar sütun düzeltmesiyle birlikte). */}
                      <FieldLabel>Kaynak</FieldLabel>
                      {editable ? (
                        <Select value={source} onValueChange={(v) => onCostSourceChange(i, v as CostSource)}>
                          {/* px-1.5 (Select'in kendi px-3'ü yerine): dar mobil sütunda "Ortalama"/
                              "Manuel" seçenekleri chevron'la birlikte sığsın diye (kök neden
                              düzeltmesi, Tur 5 P1 arge-recete-27/28) — md+ üstünde px-3'e döner. */}
                          <SelectTrigger size="sm" className={cn('w-full gap-1 bg-transparent px-1.5 text-[13px] data-[size=sm]:h-11 md:px-3 md:data-[size=sm]:h-8', CELL_CONTROL_CLS)}><SelectValue /></SelectTrigger>
                          <SelectContent>{COST_SOURCE_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent>
                        </Select>
                      ) : (
                        <span className="block truncate text-[13px] text-muted-foreground">{COST_SOURCE_LABELS[source]}</span>
                      )}
                    </div>
                    <div className="min-w-0 md:block md:px-2 md:text-right" role="cell">
                      <FieldLabel align="right">B. maliyet</FieldLabel>
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
                            // md:pr-0: kök neden düzeltmesi (Tur 4 P1 arge-recete-22) — Input'un yerleşik
                            // px-3 sağ dolgusu, aynı sütundaki MoneyCell'in dolgusuz sağ kenarına göre
                            // ondalık ayırıcıyı 12px kaydırıyordu; masaüstünde sağ dolgu sıfırlanır (sol
                            // dolgu değerin ortalanmasını bozmaz, metin zaten sağa hizalı).
                            // pr-0 text-right HER İKİ kırılım noktasında da (yalnızca md: DEĞİL): kök
                            // neden düzeltmesi (Tur 5 P1 arge-recete-25) — mobilde bu değer artık aynı
                            // sütun genişliğindeki MoneyCell'lerle (sıfır sağ dolgu) hizalanmalı.
                            inputClassName={cn('h-11 min-w-12 bg-transparent pr-0 pl-6 text-right md:h-8 md:pl-7', CELL_CONTROL_CLS)}
                          />
                        )} />
                      ) : (
                        // block w-full: sabit grid sütunu artık sağ kenarı BELİRLİYOR (kök neden
                        // düzeltmesi, Tur 5 P1 arge-recete-25) — MoneyCell inline-block olduğundan
                        // dolayı önceden içerik kadar dar kalıp satırdan satıra farklı bir sağ kenarda
                        // duruyordu (₺120,00→163px, ₺15,00→155px); artık HER satırda AYNI sütun
                        // genişliğinin sağına yaslanıyor.
                        <MoneyCell value={uCost} digits={2} className="block w-full" />
                      )}
                    </div>
                    <div className="min-w-0 md:block md:px-2 md:text-right" role="cell">
                      <FieldLabel align="right">Fire %</FieldLabel>
                      <Controller control={form.control} name={`lines.${i}.scrapPct`} render={({ field }) => (
                        <NumberInput
                          value={field.value}
                          onChange={(v) => field.onChange(v ?? '')}
                          onBlur={field.onBlur}
                          maxDigits={4}
                          disabled={!editable}
                          className="w-full"
                          inputClassName={cn('h-11 min-w-10 bg-transparent px-1 text-right md:h-8 md:px-3 md:text-right', CELL_CONTROL_CLS, scrapZero && 'text-muted-foreground')}
                        />
                      )} />
                    </div>
                  </div>
                  {/* Masaüstü-yalnız "Satır maliyeti" — mobil kopyası artık Ürün satırının sağında
                      (yukarıda); bu hücre `md:` altında GİZLİ, yalnızca masaüstü 7 sütunlu ızgaradaki
                      orijinal track'ını korur (kök neden düzeltmesi, Tur 5 P1 arge-recete-27). */}
                  <div className="hidden md:col-span-1 md:block md:px-2 md:text-right" role="cell">
                    <MoneyCell value={computation.lineCosts[i]?.toFixed(4) ?? '0'} digits={2} />
                  </div>
                  {/* Masaüstü aksiyon hücresi — mobilde sil ürün satırına taşındığı için gizli
                      (kök neden düzeltmesi, Tur 4 P1 arge-recete-21); grid sütun sayısı (7) korunur. */}
                  {editable ? (
                    <div className="hidden md:col-span-1 md:flex md:justify-start md:px-1" role="cell">
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive md:size-8" aria-label="Satırı sil"><Trash2 className="size-4" /></Button>
                    </div>
                  ) : null}
                  {qtyMissing ? (
                    <p className="col-span-2 text-[11px] text-destructive md:col-span-full" role="cell">Miktar gerekli</p>
                  ) : null}
                </div>
              );
            })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-border/60 pt-3 text-[13px]">
        <span className="text-muted-foreground">Malzeme maliyeti <MoneyCell value={computation.materialCost.toFixed(4)} digits={2} /></span>
        {/* formatQty: tr-TR virgül ondalık — eskiden .toFixed(2) nokta ondalık basıyordu, hemen
            yanındaki ₺ tutarı virgüllüydü (Tur 1 P1 arge-recete-02). */}
        <span className="text-muted-foreground">Etkin çıktı <span className="tabular-nums">{formatQty(computation.effectiveOutputQty.toFixed(4), undefined, { maxDigits: 2 })}</span></span>
        {/* text-[15px]→13px (kök neden düzeltmesi, Tur 5 P1 arge-recete-25/26): aynı değer yukarıdaki
            hedef bandında ZATEN hero metrik (24px) olarak gösteriliyor — burada ikinci kez, farklı
            boyut/ağırlıkta tekrarlanmıyor; özet satırının kendi 13px tabanıyla eşit, yalnız kalın. */}
        <span className="font-medium">Birim maliyet <MoneyCell value={computation.unitCost.toFixed(4)} digits={2} className="font-semibold" /></span>
      </div>

      {editable ? (
        // Kenarlıksız/saydam dinlenmede, yalnız odakta kenarlık — kutu-içinde-kutu düzeltmesi (Tur 4
        // P1 arge-recete-24), form alanlarındaki aynı desen (Combobox/NumberInput hover:border-input).
        // resize-none: field-sizing-content zaten içerik boyunca otomatik büyüyor, tarayıcının yerel
        // sürükleme tutamacı işlevsizdi (yalnızca süs, kaldırıldı).
        <Controller control={form.control} name="changeNote" render={({ field }) => (
          <Textarea {...field} placeholder="Değişiklik notu…" rows={2} className={cn('resize-none bg-transparent text-[13px]', CELL_CONTROL_CLS)} />
        )} />
      ) : detail.version.changeNote ? (
        <p className="text-[11px] text-muted-foreground">Not: {detail.version.changeNote}</p>
      ) : null}
    </div>
  );
}

/** Mobil (< md): etiket kontrolün ÜSTÜNDE (space-y-1, değişmedi). Masaüstü (md+): etiket kontrolün
 *  SOLUNDA, TEK satırda — kök neden düzeltmesi (Tur 6 P1 arge-recete-34): dört parti parametresi
 *  eskiden dördü de etiket+kontrol dikey yığını olduğundan ~56px yükseklik tüketiyordu; yatay
 *  düzende satır yüksekliği kontrolün kendi h-8'ine (32px) iner. `md:shrink-0` etiketin kontrolün
 *  genişliğini çalmasını önler, `md:min-w-0` kontrol sarmalayıcısının taşmasını engeller. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 md:flex md:min-w-0 md:flex-1 md:items-center md:gap-2 md:space-y-0">
      <span className="text-[11px] whitespace-nowrap text-muted-foreground md:shrink-0">{label}</span>
      <div className="md:min-w-0 md:flex-1">{children}</div>
    </div>
  );
}
