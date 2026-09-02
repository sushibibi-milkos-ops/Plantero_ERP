import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth';
import { listDeliveries, listShippableSalesOrders } from '@/modules/stock/queries';
import { DeliveriesTable } from '@/modules/stock/components/deliveries-table';
import { CreateDeliveryDialog } from '@/modules/stock/components/create-delivery-dialog';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Sevkiyat' };
export const dynamic = 'force-dynamic';

export default async function DeliveriesPage() {
  const user = await requirePermission('stock.pick');
  const [deliveries, shippable] = await Promise.all([listDeliveries(), userCan(user, 'stock.pick') ? listShippableSalesOrders() : Promise.resolve([])]);
  const active = deliveries.filter((d) => !['delivered', 'cancelled'].includes(d.status)).length;

  return (
    <>
      <PageHeader
        title="Sevkiyat"
        description={`${deliveries.length} irsaliye · ${active} aktif`}
        actions={userCan(user, 'stock.pick') ? <CreateDeliveryDialog orders={shippable.map((o) => ({ id: o.order.id, docNo: o.order.docNo, partnerName: o.partnerName }))} /> : undefined}
      />
      <DeliveriesTable deliveries={deliveries} />
    </>
  );
}
