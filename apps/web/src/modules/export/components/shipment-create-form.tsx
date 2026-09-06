'use client';

import { useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Ship } from 'lucide-react';
import Link from 'next/link';
import { Form, FormText, FieldLabel, FormSelect } from '@/components/form/fields';
import { Combobox } from '@/components/form/combobox';
import { FormActions } from '@/components/form/form-actions';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { Button } from '@/components/ui/button';
import { createShipmentAction } from '../actions';
import type { listEligibleExportOrders } from '../queries';

const INCOTERM_OPTIONS = ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF'].map((v) => ({ value: v, label: v }));
const TRANSPORT_OPTIONS = [
  { value: 'road', label: 'Karayolu' },
  { value: 'sea', label: 'Deniz yolu' },
  { value: 'air', label: 'Hava yolu' },
  { value: 'courier', label: 'Kurye/kargo' },
];
const REGIME_OPTIONS = [
  { value: '', label: 'Otomatik (tutara göre)' },
  { value: 'etgb', label: 'ETGB (mikro ihracat)' },
  { value: 'standard', label: 'Standart' },
];

const incotermEnum = z.enum(['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF']);

const schema = z.object({
  salesOrderId: z.string().uuid('Sipariş seçin'),
  incoterm: incotermEnum,
  incotermPlace: z.string().optional().nullable(),
  destinationCountry: z.string().trim().length(2, '2 harfli ülke kodu (ör. DE)').toUpperCase(),
  portOfLoading: z.string().optional().nullable(),
  portOfDischarge: z.string().optional().nullable(),
  transportMode: z.string().optional().nullable(),
  carrier: z.string().optional().nullable(),
  regime: z.enum(['standard', 'etgb']).optional(),
  note: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof schema>;
type EligibleOrder = Awaited<ReturnType<typeof listEligibleExportOrders>>[number];

export function ShipmentCreateForm({ orders, initialOrderId }: { orders: EligibleOrder[]; initialOrderId?: string }) {
  const router = useRouter();
  // Deep-link (`/ihracat/sevkiyatlar/yeni?order=<id>` — Tur 1 P2 kök neden düzeltmesi): sipariş
  // detayından/siparişler listesinden gelen bir bağlantı siparişi ÖNCEDEN SEÇMELİ; yalnızca gerçekten
  // uygun (sevkiyata henüz bağlanmamış, `orders` listesinde) bir sipariş için geçerli — aksi halde
  // sessizce boş bırakılır, hatalı/eski bir bağlantı formu bozmaz.
  const initialSalesOrderId = initialOrderId && orders.some((o) => o.id === initialOrderId) ? initialOrderId : '';
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { salesOrderId: initialSalesOrderId, incoterm: 'FOB', incotermPlace: '', destinationCountry: 'DE', portOfLoading: 'İzmir', portOfDischarge: '', transportMode: 'road', carrier: '', regime: undefined, note: '' },
  });
  const watchedOrderId = form.watch('salesOrderId');
  const orderById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);
  const selectedOrder = orderById.get(watchedOrderId);
  const orderOptions = useMemo(() => orders.map((o) => ({ value: o.id, label: `${o.docNo} — ${o.partnerName}`, description: `${o.grandTotal} ${o.currency}`, keywords: [o.partnerName] })), [orders]);

  async function onSubmit(values: FormValues) {
    const res = await createShipmentAction({ ...values, regime: values.regime || undefined });
    if (res.ok) {
      toast.success(`İhracat sevkiyatı oluşturuldu: ${res.data.docNo}`);
      router.push(`/ihracat/sevkiyatlar/${res.data.id}`);
    } else {
      toast.error(res.error);
    }
  }

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={Ship}
        title="Sevkiyata bağlanabilecek ihracat siparişi yok"
        description="Yeni bir sevkiyat açmak için önce satış siparişini ihracat kanalından (isExport) oluşturun; sevkiyata henüz bağlanmamış her sipariş burada listelenir."
        action={
          <Button asChild variant="outline">
            <Link href="/satis/siparisler/yeni">İhracat siparişi oluştur</Link>
          </Button>
        }
      />
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0">
        {/* Tur 2 P2 ihracat-yeni-03 kök neden düzeltmesi: bu blok `max-w-2xl` (672px), altındaki
            lojistik ızgarası `max-w-3xl` (768px) idi — sağ kenarlar 96px kayıyordu (ne ızgaranın sağ
            kenarına ne sol sütununa oturuyordu). Tek içerik genişliği: iki blok da artık `max-w-3xl`. */}
        <div className="max-w-3xl space-y-1.5">
          <FieldLabel required>İhracat siparişi</FieldLabel>
          <Controller control={form.control} name="salesOrderId" render={({ field }) => <Combobox value={field.value} onChange={(v) => field.onChange(v ?? '')} options={orderOptions} placeholder="Sipariş seçin" clearable={false} />} />
          {form.formState.errors.salesOrderId ? <p className="text-xs text-destructive">{form.formState.errors.salesOrderId.message}</p> : null}
          {selectedOrder ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-[13px]">
              <StatusBadge status={selectedOrder.status} kind="sales_order" />
              <span className="text-muted-foreground">{selectedOrder.partnerName}</span>
              <MoneyCell value={selectedOrder.grandTotal} currency={selectedOrder.currency} className="ml-auto" />
            </div>
          ) : null}
        </div>

        <div className="max-w-3xl border-t border-border/60 pt-5">
          <h2 className="mb-3 text-[13px] font-semibold text-foreground">Teslim şekli ve lojistik</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormSelect control={form.control} name="incoterm" label="Incoterm" required options={INCOTERM_OPTIONS} />
            <FormText control={form.control} name="incotermPlace" label="Incoterm yeri" placeholder="Ör. İzmir FOB" />
            <FormText control={form.control} name="destinationCountry" label="Varış ülkesi (ISO-2)" required placeholder="DE" />
            <FormSelect control={form.control} name="transportMode" label="Taşıma modu" options={TRANSPORT_OPTIONS} />
            <FormText control={form.control} name="portOfLoading" label="Yükleme limanı/noktası" />
            <FormText control={form.control} name="portOfDischarge" label="Varış limanı/noktası" />
            <FormText control={form.control} name="carrier" label="Nakliyeci" />
            <FormSelect control={form.control} name="regime" label="Rejim" options={REGIME_OPTIONS} placeholder="Otomatik (tutara göre)" />
          </div>
          <div className="mt-3">
            <FormText control={form.control} name="note" label="Not" />
          </div>
        </div>

        {/* Tur 4 P2 ihracat-yeni-04 kök neden düzeltmesi: `FormActions` (paylaşılan bileşen) kendi
            genişliğini formun akış genişliğinden alır — bu form yukarıdaki bloklarda içeriği
            bilinçli olarak `max-w-3xl`'e sabitlerken eylem çubuğu tam genişlikte kalıyor, "Sevkiyat
            oluştur" düğmesi form alanlarının sağ kenarından 384px uzakta duruyordu. Paylaşılan dosya
            DEĞİŞTİRİLMEDEN, `className` uzantı noktasından yalnızca masaüstünde (`md:`) genişlik
            sabitlenir — mobildeki kasıtlı tam genişlikte yapışkan çubuk davranışı (sticky/-mx-4)
            etkilenmez. */}
        <FormActions submitLabel="Sevkiyat oluştur" onCancel={() => router.back()} pending={form.formState.isSubmitting} className="md:max-w-3xl" />
      </form>
    </Form>
  );
}
