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

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <FormSelect
            control={form.control}
            name="t"
            label="T — Tip"
            options={Object.entries(TYPE_BY_T).map(([code, m]) => ({ value: code, label: `${code} — ${m.label}` }))}
          />
          <FormSelect
            control={form.control}
            name="aa"
            label="AA — Aile"
            placeholder={aaOptions.length ? 'Seçin' : 'Sözlükte yok — elle girin'}
            options={aaOptions.map((o) => ({ value: o.code, label: `${o.code} — ${o.label}` }))}
          />
          <FormText control={form.control} name="bb" label="BB — Bileşen" mono placeholder="01" />
          <FormText control={form.control} name="cc" label="CC — Varyant" mono placeholder="00" />
          <FormSelect
            control={form.control}
            name="pp"
            label="PP — Ambalaj"
            options={ppOptions.map((o) => ({ value: o.code, label: `${o.code} — ${o.label}` }))}
          />
        </div>
        {bbOptions.length ? (
          <div className="-mt-3 flex flex-wrap gap-1.5">
            <span className="text-[11px] text-muted-foreground">Sözlükten BB önerileri:</span>
            {bbOptions.slice(0, 8).map((o) => (
              <button
                key={o.code}
                type="button"
                onClick={() => form.setValue('bb', o.code.padStart(2, '0').slice(0, 2))}
                className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-primary"
              >
                {o.code} {o.label}
              </button>
            ))}
          </div>
        ) : null}
        {ccOptions.length ? (
          <div className="-mt-3 flex flex-wrap gap-1.5">
            <span className="text-[11px] text-muted-foreground">Sözlükten CC önerileri:</span>
            {ccOptions.slice(0, 8).map((o) => (
              <button
                key={o.code}
                type="button"
                onClick={() => form.setValue('cc', o.code.padStart(2, '0').slice(0, 2))}
                className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-primary"
              >
                {o.code} {o.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormText control={form.control} name="name" label="Ürün adı" required description="Oluşturulduktan sonra kilitlenir." />
          <FormText control={form.control} name="shortCode" label="Kısa kod (öneri)" mono description="Otomatik önerilir, değiştirilebilir." />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormText control={form.control} name="category1" label="Kategori 1" />
          <FormText control={form.control} name="category2" label="Kategori 2" />
          <FormText control={form.control} name="category3" label="Kategori 3" />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormText control={form.control} name="packaging" label="Ambalaj etiketi" />
          <FormQty control={form.control} name="packQty" label="Ambalaj içi adet" maxDigits={0} />
          <FormSelect control={form.control} name="uomId" label="Ölçü birimi" options={uoms.map((u) => ({ value: u.id, label: `${u.code} — ${u.name}` }))} required />
        </div>

        <div>
          <FormText control={form.control} name="barcode" label="Barkod (EAN-13)" mono />
          {barcode ? (
            <p className={`mt-1 text-[12px] ${barcodeValid ? 'text-success' : 'text-muted-foreground'}`}>
              {barcode.length === 13 ? (barcodeValid ? 'Checksum geçerli' : 'Checksum hatalı — yine de kaydedilebilir') : `${barcode.length}/13 hane`}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 p-3 sm:grid-cols-4">
          <FormSwitch control={form.control} name="isLotTracked" label="Lot takipli" />
          <FormSwitch control={form.control} name="isPurchasable" label="Satın alınabilir" />
          <FormSwitch control={form.control} name="isSellable" label="Satılabilir" />
          <FormSwitch control={form.control} name="isManufactured" label="Üretilebilir" />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <FormText control={form.control} name="vatRate" label="Satış KDV %" inputMode="decimal" />
          <FormText control={form.control} name="purchaseVatRate" label="Alış KDV %" inputMode="decimal" />
          <FormQty control={form.control} name="shelfLifeDays" label="Raf ömrü" uom="gün" maxDigits={0} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormQty control={form.control} name="minQty" label="Min. stok" />
          <FormQty control={form.control} name="maxQty" label="Maks. stok" />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormCombobox control={form.control} name="preferredSupplierId" label="Tercih edilen tedarikçi (opsiyonel)" options={supplierOptions} placeholder="Tedarikçi seçin" />
          <FormMoney control={form.control} name="supplierPrice" label="Tedarikçi fiyatı" />
        </div>

        <FormTextarea control={form.control} name="note" label="Not" rows={2} />

        <FormActions pending={form.formState.isSubmitting} submitLabel="Ürünü oluştur" disabled={!skuComplete || skuState.conflict}>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Vazgeç
          </Button>
        </FormActions>
      </form>
    </Form>
  );
}
