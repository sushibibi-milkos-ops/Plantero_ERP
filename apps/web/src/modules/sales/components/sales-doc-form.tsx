'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2, PackagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form, FormText, FormSelect, FieldLabel } from '@/components/form/fields';
import { FormMoney, FormQty } from '@/components/form/money-qty';
import { FormDate } from '@/components/form/date-field';
import { Combobox, type ComboboxOption } from '@/components/form/combobox';
import { FormActions } from '@/components/form/form-actions';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { cn } from '@/lib/utils';
import { createSalesDocAction, resolvePriceAction } from '../actions';
import { PRICE_SOURCE_LABELS } from '../labels';
import type { SellableProductRow } from '../queries';

const lineSchema = z.object({
  productId: z.string().uuid('Ürün seçin'),
  qty: z.string().min(1, 'Miktar girin'),
  uomId: z.string().uuid().optional().nullable(),
  unitPrice: z.string().min(1, 'Fiyat girin'),
  discountPct: z.string().optional(),
  priceSource: z.string().optional(),
});

const schema = z.object({
  partnerId: z.string().uuid('Cari seçin'),
  channelId: z.string().uuid('Kanal seçin'),
  warehouseId: z.string().uuid('Depo seçin'),
  priceListId: z.string().optional().nullable(),
  orderDate: z.string().min(1),
  validUntil: z.string().optional().nullable(),
  requestedDeliveryDate: z.string().optional().nullable(),
  paymentTermDays: z.string().optional(),
  customerRef: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1, 'En az bir satır ekleyin'),
});

type FormValues = z.infer<typeof schema>;

export type CustomerOption = { id: string; name: string; code: string; defaultChannelId: string | null; priceListId: string | null; paymentTermDays: number; currency: string };
export type ChannelOption = { id: string; code: string; name: string; currency: string; defaultPriceListId: string | null; commissionPct: string; shippingDeductionPerOrder: string; otherDeductionPct: string };
export type PriceListOption = { id: string; code: string; name: string; currency: string };
export type WarehouseOption = { id: string; code: string; name: string };

export function SalesDocForm({
  docType,
  customers,
  channels,
  warehouses,
  priceLists,
  products,
  opportunityId,
  initialPartnerId,
}: {
  docType: 'quotation' | 'order';
  customers: CustomerOption[];
  channels: ChannelOption[];
  warehouses: WarehouseOption[];
  priceLists: PriceListOption[];
  products: SellableProductRow[];
  opportunityId?: string;
  initialPartnerId?: string;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      partnerId: initialPartnerId ?? '', channelId: '', warehouseId: warehouses.find((w) => w.code === 'TIRE')?.id ?? warehouses[0]?.id ?? '',
      priceListId: 'none', orderDate: today, validUntil: '', requestedDeliveryDate: '', paymentTermDays: '0', customerRef: '', note: '', lines: [],
    },
  });
  const { fields, append, remove, update } = useFieldArray({ control: form.control, name: 'lines' });
  const partnerId = form.watch('partnerId');
  const channelId = form.watch('channelId');
  const priceListId = form.watch('priceListId');
  const watchedLines = form.watch('lines');

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const channelById = useMemo(() => new Map(channels.map((c) => [c.id, c])), [channels]);

  const partnerOptions = useMemo(() => customers.map((c) => ({ value: c.id, label: c.name, description: c.code })), [customers]);
  const channelOptions = useMemo(() => channels.map((c) => ({ value: c.id, label: c.name })), [channels]);
  const priceListOptions = useMemo(() => [{ value: 'none', label: 'Yok (yalnızca liste fiyatı)' }, ...priceLists.map((p) => ({ value: p.id, label: p.name }))], [priceLists]);
  const warehouseOptions = useMemo(() => warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })), [warehouses]);
  const productOptions = useMemo(() => products.map((p) => ({ value: p.id, label: p.name, description: p.sku, keywords: [p.sku, p.barcode ?? ''] })), [products]);

  /**
   * Combobox'ın varsayılan yerel süzmesi (ad+SKU+barkod içinde basit "includes") benzer isimli
   * farklı SKU'ları (ör. "BADEM BAZI" ararken "2x/3x/6x Badem Bazı") tam SKU/ad eşleşmesinin önüne
   * geçirebiliyordu. `onSearch` ile skorlu kendi sıralamamızı veriyoruz: tam/başlangıç SKU eşleşmesi
   * > tam/başlangıç ad eşleşmesi > içerir. tr-TR duyarsız.
   */
  async function searchProducts(query: string): Promise<ComboboxOption[]> {
    const needle = query.trim().toLocaleLowerCase('tr-TR');
    if (!needle) return productOptions;
    const scored: Array<{ opt: ComboboxOption; score: number }> = [];
    for (const opt of productOptions) {
      const sku = (opt.description ?? '').toLocaleLowerCase('tr-TR');
      const name = opt.label.toLocaleLowerCase('tr-TR');
      const barcode = (opt.keywords?.[1] ?? '').toLocaleLowerCase('tr-TR');
      let score = -1;
      if (sku === needle || barcode === needle) score = 100;
      else if (sku.startsWith(needle)) score = 90;
      else if (name === needle) score = 80;
      else if (name.startsWith(needle)) score = 60;
      else if (sku.includes(needle)) score = 40;
      else if (name.includes(needle)) score = 20;
      if (score >= 0) scored.push({ opt, score });
    }
    scored.sort((a, b) => b.score - a.score || a.opt.label.localeCompare(b.opt.label, 'tr-TR'));
    return scored.slice(0, 50).map((s) => s.opt);
  }

  // Cari seçilince kanal/fiyat listesi/vade otomatik doldurulur (kullanıcı sonradan değiştirebilir)
  const appliedPartnerRef = useRef<string | null>(null);
  useEffect(() => {
    if (!partnerId || appliedPartnerRef.current === partnerId) return;
    appliedPartnerRef.current = partnerId;
    const c = customerById.get(partnerId);
    if (!c) return;
    if (!form.getValues('channelId') && c.defaultChannelId) form.setValue('channelId', c.defaultChannelId);
    if (c.priceListId) form.setValue('priceListId', c.priceListId);
    if (c.paymentTermDays) form.setValue('paymentTermDays', String(c.paymentTermDays));
  }, [partnerId, customerById, form]);

  useEffect(() => {
    if (!channelId) return;
    const c = channelById.get(channelId);
    const current = form.getValues('priceListId');
    if (c?.defaultPriceListId && (!current || current === 'none')) form.setValue('priceListId', c.defaultPriceListId);
  }, [channelId, channelById, form]);

  const effectivePriceListId = priceListId && priceListId !== 'none' ? priceListId : null;

  async function resolveLinePrice(index: number, productId: string, qty: string) {
    if (!partnerId || !qty || Number(qty) <= 0) return;
    const res = await resolvePriceAction({ productId, partnerId, priceListId: effectivePriceListId, qty });
    if (res.ok) {
      const current = form.getValues(`lines.${index}`);
      update(index, { ...current, unitPrice: res.data.unitPrice, priceSource: res.data.source });
    }
  }

  function addLine(product: SellableProductRow) {
    const idx = fields.length;
    append({ productId: product.id, qty: '1', uomId: product.uomId, unitPrice: product.listPrice || '0', discountPct: '0', priceSource: 'list' });
    void resolveLinePrice(idx, product.id, '1');
  }

  const channel = channelById.get(channelId);
  const totals = useMemo(() => {
    let subtotal = 0, vat = 0;
    for (let i = 0; i < watchedLines.length; i++) {
      const l = watchedLines[i];
      const product = productById.get(l?.productId ?? '');
      const qty = Number(l?.qty ?? 0);
      const price = Number(l?.unitPrice ?? 0);
      const disc = Number(l?.discountPct ?? 0);
      const gross = qty * price;
      const net = gross * (1 - disc / 100);
      subtotal += net;
      vat += net * (Number(product?.vatRate ?? 1) / 100);
    }
    const grandTotal = subtotal + vat;
    const commission = docType === 'order' && channel ? subtotal * (Number(channel.commissionPct) / 100) : 0;
    const shipping = docType === 'order' && channel ? Number(channel.shippingDeductionPerOrder) : 0;
    const other = docType === 'order' && channel ? subtotal * (Number(channel.otherDeductionPct) / 100) : 0;
    const netRevenue = subtotal - commission - shipping - other;
    return { subtotal, vat, grandTotal, commission, shipping, other, netRevenue };
  }, [watchedLines, productById, channel, docType]);

  async function onSubmit(values: FormValues) {
    const res = await createSalesDocAction({
      docType, partnerId: values.partnerId, channelId: values.channelId, warehouseId: values.warehouseId, priceListId: values.priceListId && values.priceListId !== 'none' ? values.priceListId : null,
      opportunityId: opportunityId ?? null, orderDate: values.orderDate, validUntil: values.validUntil || null, requestedDeliveryDate: values.requestedDeliveryDate || null,
      customerRef: values.customerRef || null, paymentTermDays: values.paymentTermDays ? Number(values.paymentTermDays) : undefined, note: values.note || null,
      lines: values.lines.map((l) => ({ productId: l.productId, qty: l.qty, uomId: l.uomId, unitPrice: l.unitPrice, discountPct: l.discountPct })),
    });
    if (res.ok) {
      toast.success(`${docType === 'quotation' ? 'Teklif' : 'Sipariş'} kaydedildi: ${res.data.docNo}`);
      router.push(`/satis/${docType === 'quotation' ? 'teklifler' : 'siparisler'}/${res.data.id}`);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Tur 5 P1 bulgusu: üç kart da max-w-3xl + sola yaslıydı — 1440px'te 420px'lik asimetrik ölü
            alan sağda kalıyor, Özet kartı sayfanın en altında göz yolunun dışında duruyordu. `lg:` ve
            üstünde iki sütuna ayrılır: sol 768px (Belge başlığı + Satırlar), sağ 320px (Özet, sticky —
            form doldurulurken toplamlar hep görünür kalır). `lg` altında (mobil/tablet) tek sütun,
            max-w-3xl korunur.
            Tur 10 P2 satis-yeni-01: satır yokken Özet kartı hiç render edilmiyordu (fields.length===0
            koşulu aşağıda) ama 320px'lik sağ sütun izi boş kalsa da grid'te duruyordu — form kartı
            765px'te bitip FormActions (bu grid'in DIŞINDA, tam içerik genişliğinde) 320px sağda kalan
            "Siparişi kaydet" ile hizasız görünüyordu. Sağ sütun yalnızca gerçekten dolduğunda (bir
            satır eklendiğinde) rezerve edilir. */}
        <div className={cn('grid gap-4 lg:items-start', fields.length > 0 ? 'lg:grid-cols-[minmax(0,768px)_320px]' : 'lg:grid-cols-1')}>
        <div className="max-w-3xl space-y-6 lg:max-w-none">
        {/* max-w-3xl: 1440px'te 4 sütuna yayılan form gövdesi alanlar arası 1200px göz yolu bırakıyordu —
            Stripe/Linear form gövdesini 640-768px ile sınırlar, burada 2 sütuna (4×2 satır) düşürüldü. */}
        <div className="rounded-xl border border-border/70 bg-card p-4">
          <h2 className="mb-3 border-b border-border/60 pb-2 text-[13px] font-semibold text-foreground">Belge başlığı</h2>
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <FieldLabel required>Cari</FieldLabel>
              <Controller control={form.control} name="partnerId" render={({ field }) => <Combobox value={field.value} onChange={(v) => field.onChange(v ?? '')} options={partnerOptions} placeholder="Müşteri seçin" />} />
              {form.formState.errors.partnerId ? <p className="text-xs text-destructive">{form.formState.errors.partnerId.message}</p> : null}
            </div>
            <FormSelect control={form.control} name="channelId" label="Kanal" required options={channelOptions} />
            <FormSelect control={form.control} name="warehouseId" label="Depo" required options={warehouseOptions} />
            <FormSelect control={form.control} name="priceListId" label="Fiyat listesi" options={priceListOptions} />
            <FormDate control={form.control} name="orderDate" label={docType === 'quotation' ? 'Teklif tarihi' : 'Sipariş tarihi'} required />
            {docType === 'quotation' ? (
              <FormDate control={form.control} name="validUntil" label="Geçerlilik tarihi" />
            ) : (
              <FormDate control={form.control} name="requestedDeliveryDate" label="İstenen teslim tarihi" />
            )}
            <FormQty control={form.control} name="paymentTermDays" label="Vade (gün)" maxDigits={0} />
            <FormText control={form.control} name="customerRef" label="Müşteri sipariş no" />
          </div>
        </div>

        {/* Kendi max-w-3xl'i kaldırıldı — artık sol sütun kapsayıcısıyla (ebeveyn) aynı genişliği
            paylaşıyor (Tur 3 P2'nin çözdüğü "iki farklı kap genişliği" sorunu bu şekilde korunur). */}
        <div className="rounded-xl border border-border/70 bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-border/60 pb-2">
            <h2 className="text-[13px] font-semibold text-foreground">Satırlar</h2>
          </div>
          {/* max-w-md: arama alanı ekran genişliğinde (1550px) olmaz — bir arama kutusu ne kadar
              genişse okuma/tarama o kadar zorlaşır. */}
          <div className="max-w-md space-y-1.5">
            <FieldLabel>Ürün ekle</FieldLabel>
            <Combobox value={null} onChange={(id) => { const p = id ? productById.get(id) : undefined; if (p) addLine(p); }} onSearch={searchProducts} options={productOptions} placeholder="Ürün ara ve ekle…" clearable={false} />
          </div>
          {form.formState.errors.lines?.message ? <p className="mt-2 text-xs text-destructive">{form.formState.errors.lines.message}</p> : null}

          <div className="mt-4 space-y-3">
            {fields.map((field, index) => {
              const line = watchedLines[index];
              const product = productById.get(line?.productId ?? '');
              return (
                <div key={field.id} className="rounded-lg border border-border/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{product?.name ?? '—'}</div>
                      <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                        {product?.sku}
                        {line?.priceSource ? <StatusBadge status={line.priceSource} label={PRICE_SOURCE_LABELS[line.priceSource] ?? line.priceSource} tone={line.priceSource === 'customer' ? 'primary' : line.priceSource === 'channel' ? 'info' : 'muted'} dot={false} /> : null}
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} aria-label="Satırı sil" className="size-8 shrink-0 text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div onBlurCapture={() => void resolveLinePrice(index, line?.productId ?? '', line?.qty ?? '')}>
                      <FormQty control={form.control} name={`lines.${index}.qty`} label="Miktar" required uom={product?.uomCode} />
                    </div>
                    <FormMoney control={form.control} name={`lines.${index}.unitPrice`} label="Birim fiyat (KDV hariç)" required />
                    <FormQty control={form.control} name={`lines.${index}.discountPct`} label="İskonto %" maxDigits={2} />
                    <div className="space-y-1.5">
                      <FieldLabel>Satır toplamı</FieldLabel>
                      <div className="flex h-9 items-center justify-end rounded-md border border-transparent px-3">
                        <MoneyCell value={((Number(line?.qty ?? 0) * Number(line?.unitPrice ?? 0)) * (1 - Number(line?.discountPct ?? 0) / 100)).toFixed(2)} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {fields.length === 0 ? (
              <EmptyState compact icon={PackagePlus} title="Henüz satır yok" description="Yukarıdaki aramadan ürün seçin." className="rounded-lg border border-dashed" />
            ) : null}
          </div>
        </div>
        </div>

        <div className="max-w-3xl lg:max-w-none lg:sticky lg:top-6">
        {fields.length > 0 ? (
          <div className="rounded-xl border border-border/70 bg-card p-4">
            <h2 className="mb-3 border-b border-border/60 pb-2 text-[13px] font-semibold text-foreground">Özet</h2>
            <dl className="grid grid-cols-2 gap-y-1.5 text-[13px]">
              <dt className="text-muted-foreground">Ara toplam</dt><dd className="text-right"><MoneyCell value={totals.subtotal.toFixed(2)} /></dd>
              {/* `muted` yalnızca sıfırsa — bkz. sales-doc-summary.tsx aynı bulgu. */}
              <dt className="text-muted-foreground">KDV</dt><dd className="text-right"><MoneyCell value={totals.vat.toFixed(2)} /></dd>
              <dt className="font-medium">Genel toplam</dt><dd className="text-right font-medium"><MoneyCell value={totals.grandTotal.toFixed(2)} /></dd>
              {docType === 'order' ? (
                <>
                  {/* Aynı kök neden, sales-doc-summary.tsx'teki aritmetik boşluk bulgusuyla birebir
                      (Tur 5 P1): "Genel toplam" KDV DAHİL, hemen altı Komisyon/Kargo ile çıkarma
                      bekletiyordu ama aradaki KDV farkı hiç yazılmıyordu. */}
                  {totals.vat > 0 ? (<><dt className="pt-1.5 text-muted-foreground">KDV (−)</dt><dd className="pt-1.5 text-right"><MoneyCell value={(-totals.vat).toFixed(2)} muted /></dd></>) : null}
                  <dt className={totals.vat > 0 ? 'text-muted-foreground' : 'pt-1.5 text-muted-foreground'}>Komisyon</dt>
                  <dd className={totals.vat > 0 ? 'text-right' : 'pt-1.5 text-right'}><MoneyCell value={(totals.commission > 0 ? -totals.commission : totals.commission).toFixed(2)} muted /></dd>
                  <dt className="text-muted-foreground">Kargo kesintisi</dt><dd className="text-right"><MoneyCell value={(totals.shipping > 0 ? -totals.shipping : totals.shipping).toFixed(2)} muted /></dd>
                  {totals.other ? (<><dt className="text-muted-foreground">Diğer kesinti</dt><dd className="text-right"><MoneyCell value={(-totals.other).toFixed(2)} muted /></dd></>) : null}
                  {/* Marka yeşili yalnızca birincil eylem/pozitif delta anlamına ayrılır — nötr toplam
                      rakamı foreground'da, ayrım border-t + font-semibold ile kurulur. */}
                  <dt className="border-t border-border/60 pt-1.5 font-medium">Net ciro</dt><dd className="border-t border-border/60 pt-1.5 text-right font-semibold text-foreground"><MoneyCell value={totals.netRevenue.toFixed(2)} /></dd>
                </>
              ) : null}
            </dl>
          </div>
        ) : null}
        </div>
        </div>

        {/* Satır sayacı artık mobilde de görünür (önceden `hidden ... sm:flex` ile 390px'te tamamen
            gizliydi) — "Kaydet" butonu `fields.length === 0` iken pasif olduğunda kullanıcının NEDENİNİ
            görebileceği tek yer tam da bu sayaçtı (Tur 4 P1 bulgusu). FormActions (ortak bileşen)
            `flex-wrap` taşımadığı için 390px'te "Vazgeç" + "Siparişi kaydet" düğmeleriyle aynı satırda
            sıkışıyor — uzun bir "N satır · en az bir satır ekleyin" metni burada iki parçaya bölünüp
            kelimelerin ortasından kırpılıyordu. Bunun yerine sayaç sıfırken AYNI kısa slotta doğrudan
            eylem metnine döner ("Satır ekleyin") — hem durumu hem nedeni tek satırda, kırpılmadan
            anlatır. `aria-live` ile değişiklik ekran okuyucuya da bildirilir.
            Tur 5 P1 bulgusu: bu ipucu 13px + ikonla düğme gibi görünüp tıklanamıyordu — ikon kaldırıldı,
            metin 11px'e düşürüldü, `mr-auto` ile düğmelerden görsel olarak ayrıştırıldı. Ortak
            FormActions/Button bileşenleri (apps/web/src/components) değiştirilmeden `title`
            özniteliği bir üst sarmalayıcıya konur — düğmenin kendi `title`'ı yoksa tarayıcı en yakın
            atadaki `title`'ı gösterir, disabled düğme üzerinde hover ile NEDEN görünür olur. */}
        <div title={fields.length === 0 ? 'En az bir satır ekleyin' : undefined}>
          <FormActions submitLabel={docType === 'quotation' ? 'Teklifi kaydet' : 'Siparişi kaydet'} onCancel={() => router.back()} pending={form.formState.isSubmitting} disabled={fields.length === 0}>
            <span className="mr-auto text-[11px] whitespace-nowrap text-muted-foreground" aria-live="polite">
              {fields.length > 0 ? `${fields.length} satır` : 'Satır ekleyin'}
            </span>
          </FormActions>
        </div>
      </form>
    </Form>
  );
}
