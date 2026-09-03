'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Form, FormText, FormSelect, FormTextarea, FormSwitch } from '@/components/form/fields';
import { FormCombobox, type ComboboxOption } from '@/components/form/combobox';
import { FormQty, FormMoney } from '@/components/form/money-qty';
import { FormActions } from '@/components/form/form-actions';
import { isValidEan13 } from '@/lib/ean13';
import { createProductAction, suggestSkuAction, suggestShortCodeAction } from '../actions';

export type SkuSegmentOption = { segment: string; context: string | null; code: string; label: string; isReserved: boolean };
export type UomOption = { id: string; code: string; name: string; category: string };
type ProductType = 'finished' | 'semi_finished' | 'raw_material' | 'packaging' | 'merchandise' | 'equipment' | 'fixed_asset' | 'service';

const TYPE_BY_T: Record<string, { type: ProductType; context: string | null; label: string }> = {
  '1': { type: 'finished', context: 'finished', label: 'Mamul Ürünler' },
  '3': { type: 'raw_material', context: 'raw_material', label: 'Hammaddeler' },
  '4': { type: 'packaging', context: null, label: 'Ambalaj Malzemeleri' },
  '8': { type: 'equipment', context: 'equipment', label: 'Teknik Ekipman' },
  '9': { type: 'fixed_asset', context: null, label: 'Demirbaş' },
};

function packQtyFromPP(code: string, label: string): number {
  if (/palet/i.test(label)) return 1;
  const n = parseInt(code, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

const schema = z.object({
  t: z.string().length(1, 'Gerekli'),
  aa: z.string().length(2, '2 hane'),
  bb: z.string().length(2, '2 hane'),
  cc: z.string().length(2, '2 hane'),
  pp: z.string().length(2, '2 hane'),
  name: z.string().trim().min(2, 'Ürün adı gerekli'),
  shortCode: z.string().trim().optional().nullable(),
  category1: z.string().trim().optional().nullable(),
  category2: z.string().trim().optional().nullable(),
  category3: z.string().trim().optional().nullable(),
  packaging: z.string().trim().optional().nullable(),
  packQty: z.string(),
  barcode: z.string().trim().optional().nullable(),
  uomId: z.string().uuid('Birim seçin'),
  isLotTracked: z.boolean(),
  isPurchasable: z.boolean(),
  isSellable: z.boolean(),
  isManufactured: z.boolean(),
  vatRate: z.string(),
  purchaseVatRate: z.string(),
  shelfLifeDays: z.string().optional().nullable(),
  minQty: z.string().optional().nullable(),
  maxQty: z.string().optional().nullable(),
  preferredSupplierId: z.string().uuid().optional().nullable(),
  supplierPrice: z.string().optional().nullable(),
  note: z.string().trim().optional().nullable(),
});
type FormValues = z.infer<typeof schema>;

export function ProductWizard({ segments, uoms, supplierOptions }: { segments: SkuSegmentOption[]; uoms: UomOption[]; supplierOptions: ComboboxOption[] }) {
  const router = useRouter();
  const [skuState, setSkuState] = useState<{ sku: string; conflict: boolean; checking: boolean }>({ sku: '', conflict: false, checking: false });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      t: '1', aa: '', bb: '', cc: '00', pp: '01', name: '', shortCode: '', category1: '', category2: '', category3: '',
      packaging: 'Tekli', packQty: '1', barcode: '', uomId: '', isLotTracked: true, isPurchasable: false, isSellable: false,
      isManufactured: false, vatRate: '1', purchaseVatRate: '20', shelfLifeDays: '', minQty: '', maxQty: '',
      preferredSupplierId: null, supplierPrice: '', note: '',
    },
  });

  const t = form.watch('t');
  const aa = form.watch('aa');
  const bb = form.watch('bb');
  const cc = form.watch('cc');
  const pp = form.watch('pp');
  const barcode = form.watch('barcode');

  const meta = TYPE_BY_T[t];

  const aaOptions = useMemo(
    () => segments.filter((s) => s.segment === 'AA' && s.context === (meta?.context ?? null)).sort((a, b) => a.code.localeCompare(b.code)),
    [segments, meta],
  );
  const bbOptions = useMemo(() => segments.filter((s) => s.segment === 'BB').sort((a, b) => a.code.localeCompare(b.code)), [segments]);
  const ccOptions = useMemo(() => segments.filter((s) => s.segment === 'CC').sort((a, b) => a.code.localeCompare(b.code)), [segments]);
  const ppOptions = useMemo(() => segments.filter((s) => s.segment === 'PP').sort((a, b) => a.code.localeCompare(b.code)), [segments]);

  // T değişince tip varsayılanlarını uygula
  useEffect(() => {
    if (!meta) return;
    form.setValue('category1', meta.label);
    const isFinished = meta.type === 'finished';
    const isRaw = meta.type === 'raw_material' || meta.type === 'packaging';
    form.setValue('isLotTracked', isFinished || isRaw);
    form.setValue('isPurchasable', !isFinished);
    form.setValue('isSellable', isFinished);
    form.setValue('isManufactured', isFinished);
    form.setValue('vatRate', isFinished ? '1' : '20');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  // AA seçilince kategori 2 otomatik dolsun
  useEffect(() => {
    const opt = aaOptions.find((o) => o.code === aa);
    if (opt) form.setValue('category2', opt.label.split('(BB')[0]?.trim() ?? opt.label);
  }, [aa, aaOptions, form]);

  // BB seçilince kategori 3 otomatik dolsun (sözlükte varsa)
  useEffect(() => {
    const opt = bbOptions.find((o) => o.code === bb);
    if (opt) form.setValue('category3', opt.label);
  }, [bb, bbOptions, form]);

  // PP seçilince ambalaj etiketi + adedi otomatik dolsun
  useEffect(() => {
    const opt = ppOptions.find((o) => o.code === pp);
    if (opt) {
      form.setValue('packaging', opt.label.split('/')[0]?.trim() ?? opt.label);
      form.setValue('packQty', String(packQtyFromPP(opt.code, opt.label)));
    }
  }, [pp, ppOptions, form]);

  // T·AA·BB·CC tamamlanınca sıradaki boş SKU'yu öner
  useEffect(() => {
    if (t.length !== 1 || aa.length !== 2 || bb.length !== 2 || cc.length !== 2) {
      setSkuState({ sku: '', conflict: false, checking: false });
      return;
    }
    let alive = true;
    setSkuState((s) => ({ ...s, checking: true }));
    const timer = setTimeout(async () => {
      const res = await suggestSkuAction({ t, aa, bb, cc, preferredPP: pp || undefined });
      if (!alive) return;
      if (res.ok) {
        setSkuState({ sku: res.data.sku, conflict: res.data.conflict, checking: false });
        form.setValue('pp', res.data.sku.slice(7, 9));
      } else {
        setSkuState({ sku: '', conflict: false, checking: false });
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, aa, bb, cc]);

  const category2 = form.watch('category2');
  useEffect(() => {
    if (!meta) return;
    let alive = true;
    suggestShortCodeAction({ type: meta.type, category2, category3: form.getValues('category3') }).then((res) => {
      if (alive && res.ok) form.setValue('shortCode', res.data.shortCode);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.type, category2]);

  const previewSku = `${t}${aa}${bb}${cc}${pp}`;
  const skuComplete = /^\d{9}$/.test(previewSku);
  const barcodeValid = barcode ? isValidEan13(barcode) : null;

  async function onSubmit(values: FormValues) {
    if (!skuComplete) {
      toast.error('SKU tamamlanmadı — tüm segmentleri seçin');
      return;
    }
    if (skuState.conflict) {
      toast.error('Bu SKU zaten kullanımda — segmentleri değiştirin');
      return;
    }
    const { t: _t, aa: _aa, bb: _bb, cc: _cc, pp: _pp, ...rest } = values;
    const res = await createProductAction({ ...rest, sku: previewSku, type: meta?.type ?? 'raw_material' });
    if (res.ok) {
      toast.success(`Ürün oluşturuldu: ${res.data.sku}`);
      router.push(`/ana-veri/urunler/${res.data.id}`);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Canlı SKU önizleme */}
        <div className="sticky top-14 z-10 -mx-4 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur-sm md:static md:mx-0 md:rounded-lg md:border md:border-border/70 md:bg-muted/30 md:px-4 md:backdrop-blur-none">
          <div className="flex flex-wrap items-center gap-3">
            <Sparkles className="size-4 text-primary" />
            <div className="flex items-baseline gap-0.5 font-mono text-xl font-semibold tracking-tight">
              <span className={t ? '' : 'text-muted-foreground/40'}>{t || '_'}</span>
              <span className={aa.length === 2 ? '' : 'text-muted-foreground/40'}>{aa.padEnd(2, '_')}</span>
              <span className={bb.length === 2 ? '' : 'text-muted-foreground/40'}>{bb.padEnd(2, '_')}</span>
              <span className={cc.length === 2 ? '' : 'text-muted-foreground/40'}>{cc.padEnd(2, '_')}</span>
              <span className={pp.length === 2 ? '' : 'text-muted-foreground/40'}>{pp.padEnd(2, '_')}</span>
            </div>
            {skuState.checking ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
            {!skuState.checking && skuComplete && skuState.sku ? (
              skuState.conflict ? (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="size-3" /> Çakışma — kod dolu
                </Badge>
              ) : (
                <Badge className="gap-1 border-transparent bg-success/12 text-success hover:bg-success/12">
                  <CheckCircle2 className="size-3" /> Boş kod
                </Badge>
              )
            ) : null}
            <span className="text-[12px] text-muted-foreground">T·AA·BB·CC·PP</span>
          </div>
        </div>

        <div>
          <h2 className="mb-3 border-t border-border/60 pt-4 text-[13px] font-semibold">Kimlik</h2>
          {/* 12'lik ızgara — formun geri kalanıyla aynı desen (T=2, AA=3, BB=2, CC=2, PP=3). Önceden
              yalnızca bu bölüm sm:grid-cols-5 kullanıyordu; diğer bölümler md:grid-cols-12 — sayfa
              aşağı indikçe sütun sayısı 5→2→3→3→1 zıplıyor, alan sol kenarları hizalanmıyordu (Tur 3 P1). */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-2">
              <FormSelect
                control={form.control}
                name="t"
                label="T — Tip"
                options={Object.entries(TYPE_BY_T).map(([code, m]) => ({ value: code, label: `${code} — ${m.label}` }))}
              />
            </div>
            <div className="md:col-span-3">
              <FormSelect
                control={form.control}
                name="aa"
                label="AA — Aile"
                placeholder={aaOptions.length ? 'Seçin' : 'Sözlükte yok — elle girin'}
                options={aaOptions.map((o) => ({ value: o.code, label: `${o.code} — ${o.label}` }))}
              />
            </div>
            <div className="md:col-span-2">
              <FormText control={form.control} name="bb" label="BB — Bileşen" mono placeholder="01" />
            </div>
            <div className="md:col-span-2">
              <FormText control={form.control} name="cc" label="CC — Varyant" mono placeholder="00" />
            </div>
            <div className="md:col-span-3">
              <FormSelect
                control={form.control}
                name="pp"
                label="PP — Ambalaj"
                options={ppOptions.map((o) => ({ value: o.code, label: `${o.code} — ${o.label}` }))}
              />
            </div>
          </div>
          {/* Sözlük önerileri: tek tıkla dolduran chip'ler. Önceden ' · ' ile ayrılmış tek bir <p> içinde
              `max-w-[160px] truncate` ile kelime ortasından kesiliyordu — 8 kırpık linkten oluşan okunamaz
              bir duvar (Tur 3 P1 bulgusu, en belirgin "kurumsal-sıkıcı ERP" kokusu). Artık tam metin taşıyan
              sarmalı chip'ler; 8'den fazlası varsa kalan sayı ayrı bir bilgi chip'inde özetlenir. */}
          {bbOptions.length ? (
            <div className="mt-3">
              <div className="mb-1.5 text-[12px] text-muted-foreground">Sözlükten BB önerileri</div>
              <div className="flex flex-wrap gap-1.5">
                {bbOptions.slice(0, 8).map((o) => (
                  <button
                    key={o.code}
                    type="button"
                    title={`${o.code} — ${o.label}`}
                    onClick={() => form.setValue('bb', o.code.padStart(2, '0').slice(0, 2))}
                    // Tur 4 P2: 24px yükseklik 44px dokunma hedefi eşiğinin altındaydı — mobilde 32px'e
                    // büyütülür, masaüstünde eski 24px'e döner.
                    className="min-h-[32px] rounded-md bg-muted px-2 py-1.5 text-[12px] hover:bg-accent md:min-h-0 md:py-0"
                  >
                    <span className="font-mono">{o.code}</span> {o.label}
                  </button>
                ))}
                {bbOptions.length > 8 ? (
                  <span className="inline-flex h-6 items-center rounded-md bg-muted/60 px-2 text-[12px] text-muted-foreground">
                    +{bbOptions.length - 8} daha
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
          {ccOptions.length ? (
            <div className="mt-2">
              <div className="mb-1.5 text-[12px] text-muted-foreground">Sözlükten CC önerileri</div>
              <div className="flex flex-wrap gap-1.5">
                {ccOptions.slice(0, 8).map((o) => (
                  <button
                    key={o.code}
                    type="button"
                    title={`${o.code} — ${o.label}`}
                    onClick={() => form.setValue('cc', o.code.padStart(2, '0').slice(0, 2))}
                    // Tur 4 P2: 24px yükseklik 44px dokunma hedefi eşiğinin altındaydı — mobilde 32px'e
                    // büyütülür, masaüstünde eski 24px'e döner.
                    className="min-h-[32px] rounded-md bg-muted px-2 py-1.5 text-[12px] hover:bg-accent md:min-h-0 md:py-0"
                  >
                    <span className="font-mono">{o.code}</span> {o.label}
                  </button>
                ))}
                {ccOptions.length > 8 ? (
                  <span className="inline-flex h-6 items-center rounded-md bg-muted/60 px-2 text-[12px] text-muted-foreground">
                    +{ccOptions.length - 8} daha
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div>
          <h2 className="mb-3 border-t border-border/60 pt-4 text-[13px] font-semibold">Sınıflandırma</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-6">
              <FormText control={form.control} name="name" label="Ürün adı" required description="Oluşturulduktan sonra kilitlenir." />
            </div>
            <div className="md:col-span-6">
              <FormText control={form.control} name="shortCode" label="Kısa kod (öneri)" mono description="Otomatik önerilir, değiştirilebilir." />
            </div>
            <div className="md:col-span-4">
              <FormText control={form.control} name="category1" label="Kategori 1" />
            </div>
            <div className="md:col-span-4">
              <FormText control={form.control} name="category2" label="Kategori 2" />
            </div>
            <div className="md:col-span-4">
              <FormText control={form.control} name="category3" label="Kategori 3" />
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-3 border-t border-border/60 pt-4 text-[13px] font-semibold">Ambalaj & Barkod</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-4">
              <FormText control={form.control} name="packaging" label="Ambalaj etiketi" />
            </div>
            <div className="md:col-span-4">
              <FormQty control={form.control} name="packQty" label="Ambalaj içi adet" maxDigits={0} />
            </div>
            <div className="md:col-span-4">
              <FormSelect control={form.control} name="uomId" label="Ölçü birimi" options={uoms.map((u) => ({ value: u.id, label: `${u.code} — ${u.name}` }))} required />
            </div>
            <div className="md:col-span-12">
              <FormText control={form.control} name="barcode" label="Barkod (EAN-13)" mono />
              {barcode ? (
                <p className={`mt-1 text-[12px] ${barcodeValid ? 'text-success' : 'text-muted-foreground'}`}>
                  {barcode.length === 13 ? (barcodeValid ? 'Checksum geçerli' : 'Checksum hatalı — yine de kaydedilebilir') : `${barcode.length}/13 hane`}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-3 border-t border-border/60 pt-4 text-[13px] font-semibold">Stok & Kalite</h2>
          {/* Dördü tek bir ayar grubunun üyesi — tek kap + hairline ayraç, dört ayrı kart değil.
              `rounded-none border-0` FormSwitch'in kendi kutusunu iptal eder (yalnızca burada, className
              üzerinden — paylaşılan form/fields.tsx dosyası değiştirilmedi); h-11 mobilde 44px dokunma hedefi verir. */}
          <div className="divide-y divide-border/50 rounded-lg border border-border/60">
            <FormSwitch control={form.control} name="isLotTracked" label="Lot takipli" className="h-11 rounded-none border-0 px-3 py-0" />
            <FormSwitch control={form.control} name="isPurchasable" label="Satın alınabilir" className="h-11 rounded-none border-0 px-3 py-0" />
            <FormSwitch control={form.control} name="isSellable" label="Satılabilir" className="h-11 rounded-none border-0 px-3 py-0" />
            <FormSwitch control={form.control} name="isManufactured" label="Üretilebilir" className="h-11 rounded-none border-0 px-3 py-0" />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-4">
              <FormQty control={form.control} name="shelfLifeDays" label="Raf ömrü" uom="gün" maxDigits={0} />
            </div>
            <div className="md:col-span-4">
              <FormQty control={form.control} name="minQty" label="Min. stok" />
            </div>
            <div className="md:col-span-4">
              <FormQty control={form.control} name="maxQty" label="Maks. stok" />
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-3 border-t border-border/60 pt-4 text-[13px] font-semibold">Fiyat & Vergi</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-4">
              <FormText control={form.control} name="vatRate" label="Satış KDV %" inputMode="decimal" />
            </div>
            <div className="md:col-span-4">
              <FormText control={form.control} name="purchaseVatRate" label="Alış KDV %" inputMode="decimal" />
            </div>
            <div className="md:col-span-4">
              <FormMoney control={form.control} name="supplierPrice" label="Tedarikçi fiyatı" />
            </div>
            <div className="md:col-span-12">
              <FormCombobox control={form.control} name="preferredSupplierId" label="Tercih edilen tedarikçi (opsiyonel)" options={supplierOptions} placeholder="Tedarikçi seçin" />
            </div>
          </div>
        </div>

        <FormTextarea control={form.control} name="note" label="Not" rows={2} />

        {/* `className` twMerge ile birleşir (cn/tailwind-merge) — üstte 4px'lik scrim (gradient) sızmayı
            engeller (paylaşılan form-actions.tsx dosyası değiştirilmedi, bkz. rapor "sharedComponentRequests").
            Tur 4 P1 bulgusu: 390px'te yardımcı metin ("Kimlik segmentlerini tamamlayın…") 3 satıra
            sarıyor, `justify-end` düzeninde iki butona ~150px kalıp şerit ~64px'e çıkıyordu. Mobilde
            dikey yığın (yardımcı metin ÜSTTE, tek satıra kırpılmış; butonlar ALTTA tam genişlik) —
            ≥sm'de eski yatay/sağa-yaslı düzene döner. */}
        <FormActions
          pending={form.formState.isSubmitting}
          submitLabel="Ürünü oluştur"
          disabled={!skuComplete || skuState.conflict}
          className="flex-col items-stretch gap-2 before:absolute before:-top-4 before:left-0 before:h-4 before:w-full before:bg-gradient-to-t before:from-background before:to-transparent max-sm:[&>button]:w-full sm:flex-row sm:items-center sm:justify-end"
        >
          {/* CTA disabled iken neyin eksik olduğunu söyler — önceden yalnızca gri bir düğme vardı. */}
          {skuState.conflict ? (
            <span className="text-[12px] text-[oklch(0.5_0.14_70)] line-clamp-1 dark:text-warning">Kod çakışıyor — segmentleri değiştirin</span>
          ) : !skuComplete ? (
            <span className="line-clamp-1 text-[12px] text-muted-foreground">Kimlik segmentlerini tamamlayın (T·AA·BB·CC·PP)</span>
          ) : null}
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Vazgeç
          </Button>
        </FormActions>
      </form>
    </Form>
  );
}
