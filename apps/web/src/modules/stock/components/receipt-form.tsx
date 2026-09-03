'use client';

import { useMemo, useRef, useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2, PackagePlus, ScanBarcode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/empty-state';
import { Form, FormText, FormSelect, FieldLabel } from '@/components/form/fields';
import { FormMoney, FormQty } from '@/components/form/money-qty';
import { FormDate } from '@/components/form/date-field';
import { Combobox } from '@/components/form/combobox';
import { FormActions } from '@/components/form/form-actions';
import { receiveGoodsAction } from '../actions';
import { RECEIPT_DISPOSITION_LABELS } from '../labels';
import type { ProductPickerRow } from '../queries';

const lineSchema = z.object({
  purchaseOrderLineId: z.string().uuid().optional().nullable(),
  productId: z.string().uuid('Ürün seçin'),
  qty: z.string().min(1, 'Miktar girin'),
  uomId: z.string().uuid(),
  unitCost: z.string().min(1, 'Birim maliyet girin'),
  supplierLotNo: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  productionDate: z.string().optional().nullable(),
  disposition: z.enum(['quarantine', 'released', 'rejected']),
  toLocationId: z.string().uuid('Hedef lokasyon seçin'),
  rejectedQty: z.string().optional(),
  rejectReason: z.string().optional().nullable(),
});

const schema = z.object({
  warehouseId: z.string().uuid('Depo seçin'),
  partnerId: z.string().uuid().optional().nullable(),
  supplierDeliveryNo: z.string().optional().nullable(),
  supplierDeliveryDate: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1, 'En az bir satır ekleyin'),
});

type FormValues = z.infer<typeof schema>;

type LocationOption = { id: string; code: string; usage: string; warehouseId: string | null; isPickable: boolean };

type OpenPurchaseOrderOption = { id: string; docNo: string; partnerId: string; partnerName: string; grandTotal: string };

export function ReceiptForm({
  warehouses,
  suppliers,
  products,
  locations,
  purchaseOrderId,
  openPurchaseOrders,
  initialLines,
  initialWarehouseId,
  initialPartnerId,
}: {
  warehouses: Array<{ id: string; code: string; name: string }>;
  suppliers: Array<{ id: string; name: string; code: string }>;
  products: ProductPickerRow[];
  locations: LocationOption[];
  purchaseOrderId?: string;
  /** Sayfa `?po=` OLMADAN açıldığında gösterilen açık sipariş listesi (P0 düzeltme — docs/INVARIANTS.md
   *  I24: mal kabul her zaman bir siparişe bağlanabilmeli, yalnızca doğrudan bağlantıyla değil). Seçim
   *  `?po=<id>`'ye yönlendirir; sayfa o PO'nun kalan satırlarıyla yeniden yüklenir (üstteki `page.tsx`). */
  openPurchaseOrders?: OpenPurchaseOrderOption[];
  initialLines?: Array<Partial<FormValues['lines'][number]> & { purchaseOrderLineId?: string }>;
  initialWarehouseId?: string;
  initialPartnerId?: string | null;
}) {
  const router = useRouter();
  const [barcode, setBarcode] = useState('');
  const barcodeRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      // Varsayılan depo: üretim tesisi (TIRE) — mal kabul neredeyse her zaman orada yapılır;
      // depo listesi koda göre alfabetik geldiği için (BUCA < TIRE) ilk öğeye güvenmiyoruz.
      warehouseId: initialWarehouseId ?? warehouses.find((w) => w.code === 'TIRE')?.id ?? warehouses[0]?.id ?? '',
      partnerId: initialPartnerId ?? null,
      supplierDeliveryNo: '',
      supplierDeliveryDate: '',
      note: '',
      lines: (initialLines as FormValues['lines']) ?? [],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' });
  const watchedWarehouseId = form.watch('warehouseId');
  const watchedLines = form.watch('lines');

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const productOptions = useMemo(() => products.map((p) => ({ value: p.id, label: `${p.name}`, description: p.sku, keywords: [p.sku, p.barcode ?? ''] })), [products]);
  const warehouseOptions = useMemo(() => warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })), [warehouses]);
  const supplierOptions = useMemo(() => suppliers.map((s) => ({ value: s.id, label: s.name, description: s.code })), [suppliers]);
  const openPoOptions = useMemo(
    () => (openPurchaseOrders ?? []).map((p) => ({ value: p.id, label: `${p.docNo} — ${p.partnerName}`, description: `₺${Number(p.grandTotal).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` })),
    [openPurchaseOrders],
  );

  function locationOptionsFor(disposition: string) {
    const usage = disposition === 'rejected' ? 'rejected' : disposition === 'released' ? 'internal' : 'quarantine';
    return locations
      .filter((l) => l.usage === usage && (!l.warehouseId || l.warehouseId === watchedWarehouseId) && (usage !== 'internal' || l.isPickable))
      .map((l) => ({ value: l.id, label: l.code }));
  }

  function addLine(product: ProductPickerRow) {
    append({
      productId: product.id, qty: '', uomId: product.uomId, unitCost: product.averageCost ?? '0',
      supplierLotNo: '', expiryDate: '', productionDate: '', disposition: product.requiresIncomingQc ? 'quarantine' : 'released',
      toLocationId: '', rejectedQty: '0', rejectReason: '',
    });
  }

  function handleBarcode() {
    const code = barcode.trim();
    if (!code) return;
    const product = products.find((p) => p.barcode === code);
    if (!product) {
      toast.error(`Barkod bulunamadı: ${code}`);
      setBarcode('');
      return;
    }
    addLine(product);
    setBarcode('');
    barcodeRef.current?.focus();
  }

  async function onSubmit(values: FormValues) {
    const res = await receiveGoodsAction({
      ...values,
      warehouseId: values.warehouseId,
      purchaseOrderId: purchaseOrderId ?? null,
      lines: values.lines.map((l) => ({ ...l, rejectedQty: l.disposition === 'rejected' ? l.qty : l.rejectedQty || '0' })),
    });
    if (res.ok) {
      toast.success(`Mal kabul kaydedildi: ${res.data.docNo}`);
      router.push(`/depo/mal-kabul/${res.data.id}`);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Form {...form}>
      {/* 390px altında yapışkan aksiyon çubuğu (FormActions, bkz. aşağıda) + mobil alt gezinme çubuğu
          üst üste biniyordu — "Henüz satır yok" boş durumu çubuğun altında yarısı kesik kalıyordu
          (Tur 4 P1 bulgusu). İçeriğe iki çubuk kadar (56px aksiyon + 64px alt nav + nefes payı) alt
          boşluk ayrıldı; masaüstünde çubuk statik olduğundan gerek yok. */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0">
        {/* P0 düzeltme (docs/INVARIANTS.md I24 — "PO'suz mal kabul yasak"): sayfa `?po=` ile değil
            doğrudan `/depo/mal-kabul/yeni`'den açıldığında da bir siparişe bağlanabilmeli. Seçim, o
            siparişin kalan satırlarıyla önceden dolu formu yeniden yükler (bkz. page.tsx `?po=`
            işleyişi) — ayrı bir "bağla" adımı yok, tek combobox yeterli. `purchaseOrderId` zaten
            doluysa (bağlantıdan geldiyse) bu satır hiç render edilmez. */}
        {!purchaseOrderId && openPoOptions.length > 0 ? (
          <div className="max-w-md rounded-lg border border-primary/20 bg-primary/[0.03] p-3">
            <FieldLabel>Sipariş seç (opsiyonel)</FieldLabel>
            <p className="mb-2 text-xs text-muted-foreground">Bir satın alma siparişinden geliyorsa seçin — satırlar ve tedarikçi otomatik doldurulur.</p>
            <Combobox
              value={null}
              onChange={(id) => { if (id) router.push(`/depo/mal-kabul/yeni?po=${id}`); }}
              options={openPoOptions}
              placeholder="Açık siparişlerde ara…"
              clearable={false}
            />
          </div>
        ) : null}
        {/* Önceki sürüm iki bölümü 1px çerçeveli kutuya alıyordu (klasik ERP formu); bölüm başlığı da
            (`text-sm text-muted-foreground`, normal ağırlık) alan etiketlerinden (`text-[13px]
            font-medium`, tam kontrast) daha zayıf basılıyordu — hiyerarşi tersti (Tur 3 P2 bulgusu).
            Kutular kaldırıldı, bölümler ince bir üst hairline ile ayrılır; başlık artık daha büyük
            ağırlıkta (font-semibold, tam kontrast) alan etiketlerinin üstünde durur.
            `max-w-3xl`: sınırsız form kolonu 1440px'te ~1600px içerik alanına yayılıyor, "Tedarikçi
            irsaliye no" gibi ~10 karakterlik bir alan 800px'lik kutu oluyordu (Tur 4 P1 bulgusu, en
            belirgin "kurumsal-sıkıcı ERP" kokusu). Yalnızca başlık alanları sınırlanır — "Satırlar"
            bölümü (aşağıda, satır başına 6 sütunlu ızgara) tam genişlikte kalır. */}
        <div className="max-w-3xl">
          <h2 className="mb-3 text-[13px] font-semibold text-foreground">Belge başlığı</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Tedarikçi ve Ürün ekle ile aynı seçim bileşeni (Combobox) — Select farklı bir
                affordance (tek chevron) kullanıyordu, aynı formda iki farklı "seç" dili oluşuyordu. */}
            <div className="space-y-1.5">
              <FieldLabel required>Depo</FieldLabel>
              <Controller control={form.control} name="warehouseId" render={({ field }) => <Combobox value={field.value} onChange={(v) => field.onChange(v ?? '')} options={warehouseOptions} placeholder="Depo seçin" clearable={false} />} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Tedarikçi</FieldLabel>
              <Controller control={form.control} name="partnerId" render={({ field }) => <Combobox value={field.value} onChange={field.onChange} options={supplierOptions} placeholder="Tedarikçi seçin" />} />
            </div>
            <FormText control={form.control} name="supplierDeliveryNo" label="Tedarikçi irsaliye no" />
            <FormDate control={form.control} name="supplierDeliveryDate" label="İrsaliye tarihi" />
          </div>
        </div>

        <div className="border-t border-border/60 pt-5">
          <h2 className="mb-3 text-[13px] font-semibold text-foreground">Satırlar</h2>
          {/* Kök neden (Tur 5 P2): iki eşdeğer satır-ekleme yolu (arama ile ekle / barkod okut) iki
              farklı hizadaydı — barkod input'u başlığın sağında bağlamsız biçimde yüzüyordu, hemen
              altındaki "Ürün ekle" alanıyla hiçbir görsel grubu yoktu. Artık tek satırlık bir grid'de
              eşleniyorlar: solda birincil yol (arama), sağda ikincil/hızlı yol (barkod) — aynı satır
              hizasında, her ikisi de kendi etiketini taşır. 390px'te tek kolona düşer (Tur 3 P2
              bulgusunun mobil davranışı korunur). */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-1.5">
              <FieldLabel>Ürün ekle (arama ile)</FieldLabel>
              <Combobox value={null} onChange={(id) => { const p = id ? productById.get(id) : undefined; if (p) addLine(p); }} options={productOptions} placeholder="Ürün ara ve ekle…" clearable={false} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Barkod</FieldLabel>
              <div className="relative">
                <ScanBarcode className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={barcodeRef}
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleBarcode(); } }}
                  placeholder="Barkod okut…"
                  className="h-11 w-full pl-8 font-mono text-[13px] md:h-9"
                />
              </div>
            </div>
          </div>

          {form.formState.errors.lines?.message ? <p className="mt-2 text-xs text-destructive">{form.formState.errors.lines.message}</p> : null}

          <div className="mt-4 space-y-3">
            {fields.map((field, index) => {
              const product = productById.get(watchedLines[index]?.productId ?? '');
              const disposition = watchedLines[index]?.disposition ?? 'quarantine';
              return (
                <div key={field.id} className="rounded-lg border border-border/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{product?.name ?? '—'}</div>
                      <div className="font-mono text-xs text-muted-foreground">{product?.sku}</div>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} aria-label="Satırı sil" className="size-8 shrink-0 text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    <FormQty control={form.control} name={`lines.${index}.qty`} label="Miktar" required uom={product?.uomCode} />
                    <FormMoney control={form.control} name={`lines.${index}.unitCost`} label="Birim maliyet" required />
                    <FormText control={form.control} name={`lines.${index}.supplierLotNo`} label="Tedarikçi lot no" mono />
                    <FormDate control={form.control} name={`lines.${index}.productionDate`} label="Üretim tarihi" />
                    <FormDate control={form.control} name={`lines.${index}.expiryDate`} label="SKT" />
                    <FormSelect
                      control={form.control}
                      name={`lines.${index}.disposition`}
                      label="Karar"
                      options={[
                        { value: 'quarantine', label: RECEIPT_DISPOSITION_LABELS.quarantine! },
                        { value: 'released', label: RECEIPT_DISPOSITION_LABELS.released! },
                        { value: 'rejected', label: RECEIPT_DISPOSITION_LABELS.rejected! },
                      ]}
                    />
                    {disposition !== 'rejected' ? (
                      <div className="col-span-2 space-y-1.5 sm:col-span-1">
                        <FieldLabel>Hedef lokasyon</FieldLabel>
                        <Controller control={form.control} name={`lines.${index}.toLocationId`} render={({ field: f }) => <Combobox value={f.value} onChange={f.onChange} options={locationOptionsFor(disposition)} mono placeholder="Lokasyon" />} />
                      </div>
                    ) : (
                      <div className="col-span-2 space-y-1.5 sm:col-span-1">
                        <FieldLabel>Red lokasyonu</FieldLabel>
                        <Controller control={form.control} name={`lines.${index}.toLocationId`} render={({ field: f }) => <Combobox value={f.value} onChange={f.onChange} options={locationOptionsFor('rejected')} mono placeholder="Lokasyon" />} />
                      </div>
                    )}
                    {disposition !== 'rejected' ? <FormQty control={form.control} name={`lines.${index}.rejectedQty`} label="Kısmi red miktarı" /> : null}
                    {disposition === 'rejected' || Number(watchedLines[index]?.rejectedQty) > 0 ? (
                      <FormText control={form.control} name={`lines.${index}.rejectReason`} label="Red gerekçesi" className="col-span-2 sm:col-span-3" />
                    ) : null}
                  </div>
                </div>
              );
            })}
            {fields.length === 0 ? (
              // Önceki sürüm ikonsuz, eylemsiz tek gri cümleydi (Tur 3 P2 bulgusu) — ortak EmptyState
              // (compact) + barkod alanına odaklanan birincil eylem.
              <EmptyState
                compact
                icon={PackagePlus}
                title="Henüz satır yok"
                description="Barkod okutun veya ürün arayarak satır ekleyin."
                action={
                  <Button type="button" variant="outline" onClick={() => barcodeRef.current?.focus()}>
                    <ScanBarcode className="size-3.5" /> Barkod alanına git
                  </Button>
                }
              />
            ) : null}
          </div>
        </div>

        <FormActions submitLabel="Kabul et" onCancel={() => router.back()} pending={form.formState.isSubmitting} disabled={fields.length === 0}>
          <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
            <PackagePlus className="size-3.5" /> {fields.length} satır
          </span>
        </FormActions>
      </form>
    </Form>
  );
}
