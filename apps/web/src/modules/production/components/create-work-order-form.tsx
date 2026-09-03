'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, ListChecks, Loader2 } from 'lucide-react';
import { Form, FormSelect, FieldLabel } from '@/components/form/fields';
import { FormQty } from '@/components/form/money-qty';
import { FormDate } from '@/components/form/date-field';
import { Combobox } from '@/components/form/combobox';
import { FormActions } from '@/components/form/form-actions';
import { QtyCell } from '@/components/qty-cell';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { createWorkOrderAction, previewMaterialsAction, type MaterialPreviewLine } from '../actions';
import type { ManufacturableProductRow, LineOption } from '../queries';

const schema = z.object({
  productId: z.string().uuid('Ürün seçin'),
  bomId: z.string().uuid(),
  plannedQty: z.string().min(1, 'Miktar girin'),
  lineId: z.string().uuid('Hat seçin'),
  warehouseId: z.string().uuid('Depo seçin'),
  plannedStart: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});
type FormValues = z.infer<typeof schema>;

export function CreateWorkOrderForm({
  products,
  lines,
  warehouses,
}: {
  products: ManufacturableProductRow[];
  lines: LineOption[];
  warehouses: Array<{ id: string; code: string; name: string }>;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<MaterialPreviewLine[] | null>(null);
  // P1 (Tur 10): eskiden yalnızca `res.ok` dalı vardı — action `{ ok: false }` döndüğünde ya da
  // istek atılamadan reddedildiğinde (ör. dev sunucusu Fast Refresh ile yeniden başlarken) hiçbir
  // dal `preview`'ı doldurmuyor, "Hesaplanıyor…" durumu süresiz kalıyordu; kullanıcının önünde ne
  // hata mesajı ne yeniden deneme yolu vardı. Ayrı bir hata durumu + "Yeniden dene" eylemi eklenir.
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewPending, startPreview] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      productId: '', bomId: '', plannedQty: '', lineId: '',
      warehouseId: warehouses.find((w) => w.code === 'TIRE')?.id ?? warehouses[0]?.id ?? '',
      plannedStart: '', note: '',
    },
  });

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const productOptions = useMemo(() => products.map((p) => ({ value: p.id, label: p.name, description: p.sku, keywords: [p.sku] })), [products]);
  // Yalnızca kod: Hat alanı artık `lg:col-span-2` değil (Tur 5 bulgusu, P1 — bkz. aşağıdaki ızgara),
  // "HAT1 — Bazlar, Barista & Kremalar" gibi tam etiketler 245px'lik tek sütuna sığmayıp shadcn
  // Select tetikleyicisinin (ortak bileşen, `components/form/fields.tsx`) flex öğesi min-width:auto
  // sınırı yüzünden görsel olarak yan alana taşıyordu — uygulama genelindeki her FormSelect'i
  // etkileyen bir taşma hatası (yalnızca dar bir sütunda uzun etiketle tetikleniyor). Ortak bileşeni
  // değiştirmek yerine, hattın zaten her yerde (tablo, kart, operatör ekranı) tek başına kullanılan
  // kısa kodu yeterli bağlamı veriyor — seçili hat adı zaten formun üstündeki ürün seçiminden bellidir.
  const lineOptions = useMemo(() => lines.map((l) => ({ value: l.id, label: l.code })), [lines]);
  const warehouseOptions = useMemo(() => warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })), [warehouses]);

  const productId = form.watch('productId');
  const bomId = form.watch('bomId');
  const plannedQty = form.watch('plannedQty');
  const warehouseId = form.watch('warehouseId');

  useEffect(() => {
    const p = productId ? productById.get(productId) : undefined;
    if (p) {
      form.setValue('bomId', p.activeBomId ?? '');
      if (p.defaultLineId) form.setValue('lineId', p.defaultLineId);
    }
    setPreview(null);
    setPreviewError(null);
  }, [productId, productById, form]);

  // `stale` bayrağı: girdiler değişip yeni bir çağrı başlamadan önceki isteğin geç dönen sonucu
  // (unmount ya da bomId/plannedQty/warehouseId değişimi) artık state'e yazılmaz — eskiden hiçbir
  // koruma yoktu, geç dönen bir yanıt daha güncel bir önizlemenin üstüne yazabilirdi.
  const runPreview = (bomId: string, plannedQty: string, warehouseId: string, isStale: () => boolean) => {
    startPreview(async () => {
      try {
        const res = await previewMaterialsAction({ bomId, plannedQty, warehouseId });
        if (isStale()) return;
        if (res.ok) {
          setPreview(res.data);
          setPreviewError(null);
        } else {
          setPreview(null);
          setPreviewError(res.error);
        }
      } catch {
        if (isStale()) return;
        setPreview(null);
        setPreviewError('Malzeme önizlemesi hesaplanamadı. Bağlantıyı kontrol edip yeniden deneyin.');
      }
    });
  };

  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
    if (!bomId || !plannedQty || !warehouseId || Number(plannedQty) <= 0) return;
    let stale = false;
    const t = setTimeout(() => runPreview(bomId, plannedQty, warehouseId, () => stale), 350);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [bomId, plannedQty, warehouseId]);

  const hasShortage = preview?.some((l) => Number(l.shortQty) > 0) ?? false;

  async function onSubmit(values: FormValues) {
    const res = await createWorkOrderAction(values);
    if (res.ok) {
      toast.success(`İş emri oluşturuldu: ${res.data.docNo}`);
      router.push(`/uretim/is-emirleri/${res.data.id}`);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Form {...form}>
      {/* Kök neden (Tur 4 P2): `pb-28` (112px) yalnızca sticky aksiyon çubuğunu (~72px) hesaba
          katıyordu — altta uygulama alt navigasyonu da (~64px) sabit durduğundan toplam ~136px'lik
          sabit katman içeriği örtüyordu ("Reçete henüz hesaplanmadı" boş durum metni çubuğun
          arkasında yarı görünür kalıyordu). 144px (9rem) + güvenli alan iki katmanı da karşılar. */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-[calc(9rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="rounded-xl border border-border/70 bg-card p-4">
          {/* text-[11px] uppercase: bölüm başlığı hemen altındaki alan etiketleriyle ("Mamul / yarı
              mamul") aynı punto/ağırlıktaydı, yalnızca daha soluk — hiyerarşi kurmuyordu, unutulmuş
              bir yer tutucu gibi okunuyordu (Tur 5 bulgusu, P2). Detay sayfasındaki StatCell etiket
              kalıbıyla aynı. */}
          <h2 className="mb-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Ürün ve miktar</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5 lg:col-span-2">
              <FieldLabel required>Mamul / yarı mamul</FieldLabel>
              <Controller control={form.control} name="productId" render={({ field }) => <Combobox value={field.value} onChange={(v) => field.onChange(v ?? '')} options={productOptions} placeholder="Ürün seçin (aktif reçetesi olanlar)" clearable={false} />} />
              {form.formState.errors.productId ? <p className="text-xs text-destructive">{form.formState.errors.productId.message}</p> : null}
            </div>
            <FormQty control={form.control} name="plannedQty" label="Planlanan miktar" required uom={productId ? productById.get(productId)?.uomCode : undefined} />
            {/* lg:col-span-2: 4 sütunlu ızgarada 2. satır yalnızca Depo+Hat ile yarısı dolu kalıyor,
                kartın sağında ~380px tırtıklı boşluk bırakıyordu (Tur 2 bulgusu) — ikisi satırı
                birlikte tam kaplar. */}
            <FormSelect control={form.control} name="warehouseId" label="Depo" required options={warehouseOptions} className="lg:col-span-2" />
            {/* Hat: lg:col-span-2 kaldırıldı — 3 seçenekli bir dropdown, hemen üstündeki "Planlanan
                miktar" sayısal alanının (245px) iki katı genişlikteydi (~500px), taşıdığı bilgiyle
                orantısız (Tur 5 bulgusu, P1). Planlanan başlangıç 2. satırın son sütununa taşındı —
                iki satır da aynı 4 sütunluk ızgarayı paylaşır. */}
            <FormSelect control={form.control} name="lineId" label="Hat" required options={lineOptions} />
            <FormDate control={form.control} name="plannedStart" label="Planlanan başlangıç" />
          </div>
        </div>

        {/* Ürün+miktar girilmeden bu kart ~200px boş rezervasyona düşüyordu — ortak EmptyState
            (compact) kullanılır; dashed çerçeve /uretim/hatlar'daki boş durumla aynı klişeyi
            tekrarlıyordu (Tur 2 bulgusu). */}
        {!bomId || !plannedQty ? (
          <div className="rounded-xl border border-border/70 bg-card">
            {/* max-md:py-4 max-md:gap-1.5: compact varyant her zaman py-10 (~165px) ayırıyordu — 390px
                mobilde yapışkan eylem çubuğunun (bottom-16, ~72px) tamamen arkasında kalıyordu,
                başlık/açıklama hiç görünmüyordu (Tur 5 bulgusu, P1). Ortak bileşen değiştirilmeden
                `className` ile mobilde daraltılır (~120px), masaüstünde varsayılan kalır. */}
            <EmptyState compact icon={ListChecks} title="Reçete henüz hesaplanmadı" description="Ürün ve planlanan miktar seçin." className="max-md:gap-1.5 max-md:py-4" />
          </div>
        ) : (
        <div className="rounded-xl border border-border/70 bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Malzeme önizleme (reçete)</h2>
            {previewPending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
          </div>
          {previewError ? (
            <EmptyState
              compact
              icon={AlertTriangle}
              title="Malzeme önizlemesi hesaplanamadı"
              description={previewError}
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => runPreview(bomId, plannedQty, warehouseId, () => false)} disabled={previewPending}>
                  Yeniden dene
                </Button>
              }
            />
          ) : !preview ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Hesaplanıyor…</div>
          ) : preview.length === 0 ? (
            <EmptyState compact title="Bu reçetede satır yok" />
          ) : (
            // İç çerçeve kaldırıldı: kart zaten `rounded-xl border` — iç içe iki kutu "kurumsal ERP"
            // klişesiydi (Tur 5 bulgusu, P1, line-cards.tsx'in bilerek kaçındığı desen). Tablonun
            // kendi satır altı hairline'ı ayrım için yeterli.
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Malzeme</TableHead>
                    <TableHead className="text-right">Gerekli</TableHead>
                    <TableHead className="text-right">Eldeki serbest</TableHead>
                    <TableHead className="text-right">Eksik</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((l) => {
                    const short = Number(l.shortQty) > 0;
                    return (
                      <TableRow key={l.productId} className={cn(short && 'bg-destructive/5')}>
                        <TableCell>
                          <div>{l.name}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">{l.sku}</div>
                        </TableCell>
                        <TableCell className="text-right"><QtyCell value={l.requiredQty} uom={l.uomCode} /></TableCell>
                        <TableCell className="text-right"><QtyCell value={l.availableQty} uom={l.uomCode} /></TableCell>
                        <TableCell className="text-right">
                          {short ? <QtyCell value={l.shortQty} uom={l.uomCode} className="text-destructive font-medium" /> : <CheckCircle2 className="ml-auto size-4 text-success" />}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {hasShortage ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-[oklch(0.5_0.14_70)] dark:text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              Bazı malzemelerde eldeki serbest stok yetersiz. İş emri yine de oluşturulabilir; malzeme mal kabul veya transferle tamamlanmalı.
            </div>
          ) : null}
        </div>
        )}

        <FormActions submitLabel="İş emrini oluştur" onCancel={() => router.back()} pending={form.formState.isSubmitting} />
      </form>
    </Form>
  );
}
