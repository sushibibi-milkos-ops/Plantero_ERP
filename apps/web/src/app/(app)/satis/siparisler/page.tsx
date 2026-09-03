import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { listSalesOrders } from '@/modules/sales/queries';
import { SalesDocsTable } from '@/modules/sales/components/sales-docs-table';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Siparişler' };
export const dynamic = 'force-dynamic';

export default async function SalesOrdersPage() {
  const user = await requirePermission('sales.view');
  const orders = await listSalesOrders();
  const active = orders.filter((o) => !['cancelled', 'closed', 'invoiced'].includes(o.status)).length;

  return (
    <>
      <PageHeader
        title="Siparişler"
        description={`${orders.length} sipariş · ${active} açık`}
        actions={userCan(user, 'sales.order') ? (
          <Button asChild>
            <Link href="/satis/siparisler/yeni"><Plus className="size-4" /> Yeni sipariş</Link>
          </Button>
        ) : undefined}
      />
      <SalesDocsTable rows={orders} docType="order" />
    </>
  );
}
