import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth';
import { listCounts, listWarehouses, listLocations } from '@/modules/stock/queries';
import { CountsTable } from '@/modules/stock/components/counts-table';
import { CreateCountDialog } from '@/modules/stock/components/create-count-dialog';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Sayım' };
export const dynamic = 'force-dynamic';

export default async function CountsPage() {
  const user = await requirePermission('stock.count');
  const [counts, warehouses, locations] = await Promise.all([listCounts(), listWarehouses(), listLocations()]);
  const active = counts.filter((c) => !['posted', 'cancelled'].includes(c.status)).length;

  return (
    <>
      <PageHeader
        title="Sayım"
        description={`${counts.length} sayım oturumu${active ? ` · ${active} aktif` : ''}`}
        actions={userCan(user, 'stock.count') ? <CreateCountDialog warehouses={warehouses} locations={locations.map((l) => ({ id: l.id, code: l.code, usage: l.usage, warehouseId: l.warehouseId }))} /> : undefined}
      />
      <CountsTable counts={counts} />
    </>
  );
}
