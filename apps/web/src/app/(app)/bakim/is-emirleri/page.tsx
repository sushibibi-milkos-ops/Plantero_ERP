import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { listMaintenanceOrders } from '@/modules/maintenance/queries';
import { OrdersView } from '@/modules/maintenance/components/orders-view';

export const metadata: Metadata = { title: 'Bakım İş Emirleri' };
export const dynamic = 'force-dynamic';

export default async function MaintenanceOrdersPage() {
  const user = await requirePermission('maintenance.view');
  const orders = await listMaintenanceOrders();
  const open = orders.filter((o) => !['done', 'cancelled'].includes(o.status)).length;

  return (
    <>
      <PageHeader
        title="Bakım İş Emirleri"
        description={`${orders.length} iş emri — ${open} açık`}
        actions={
          userCan(user, 'maintenance.report') ? (
            <Button asChild>
              <Link href="/bakim/is-emirleri/yeni"><Plus className="size-4" /> Arıza bildir</Link>
            </Button>
          ) : undefined
        }
      />
      <OrdersView orders={orders} />
    </>
  );
}
