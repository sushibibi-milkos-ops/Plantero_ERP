import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth';
import { listDeliveries, listShippableSalesOrders } from '@/modules/stock/queries';
import { DeliveriesTable } from '@/modules/stock/components/deliveries-table';
import { CreateDeliveryDialog } from '@/modules/stock/components/create-delivery-dialog';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { ZERO, D, toDb } from '@plantero/core';

export const metadata: Metadata = { title: 'Sevkiyat' };
export const dynamic = 'force-dynamic';

export default async function DeliveriesPage() {
  const user = await requirePermission('stock.pick');
  const [deliveries, shippable] = await Promise.all([listDeliveries(), userCan(user, 'stock.pick') ? listShippableSalesOrders() : Promise.resolve([])]);
  // "Aktif" iptal edilmemiş her şeyi sayıyordu (draft/reserved/picking/picked/shipped) — 27'nin 23'ü
  // zaten "Sevk edildi" (kapanmış) olduğu halde başlık "27 irsaliye · 27 aktif" yazıyor, kullanıcı bunu
  // "işlem bekliyor" diye okuyordu. Gerçekten aksiyon bekleyen (henüz sevk edilmemiş, rezerve) sayılır.
  const pendingAction = deliveries.filter((d) => d.status === 'reserved').length;
  const today = new Date().toISOString().slice(0, 10);
  const shippedToday = deliveries.filter((d) => d.shippedAt && d.shippedAt.toISOString().slice(0, 10) === today).length;
  const shippedValue = toDb(deliveries.filter((d) => !['draft', 'cancelled'].includes(d.status)).reduce((a, d) => a.plus(D(d.value)), ZERO));

  return (
    <>
      <PageHeader
        title="Sevkiyat"
        description={`${deliveries.length} irsaliye · ${pendingAction} rezerve`}
        actions={userCan(user, 'stock.pick') ? <CreateDeliveryDialog orders={shippable.map((o) => ({ id: o.order.id, docNo: o.order.docNo, partnerName: o.partnerName }))} /> : undefined}
      />

      {/* Kardeş ekranlarla (stok/skt) aynı KPI anatomisi — liste tek satır + 700px boşluktan ibaret
          görünmesin diye (Tur 2 bulgusu). */}
      <KpiStripRow>
        <KpiCard variant="strip" title="Rezerve" value={pendingAction} format="int" />
        <KpiCard variant="strip" title="Bugün sevk edilen" value={shippedToday} format="int" />
        <KpiCard variant="strip" title="Sevk edilen tutar" value={shippedValue} format="money" />
      </KpiStripRow>

      <DeliveriesTable deliveries={deliveries} />
    </>
  );
}
