import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listLots } from '@/modules/stock/queries';
import { LotsTable } from '@/modules/stock/components/lots-table';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Lotlar' };
export const dynamic = 'force-dynamic';

export default async function LotsPage() {
  await requirePermission('stock.view');
  const lots = await listLots();
  const released = lots.filter((l) => l.status === 'released').length;
  const quarantine = lots.filter((l) => l.status === 'quarantine').length;

  return (
    <>
      <PageHeader title="Lotlar" description={`${lots.length} lot · ${released} serbest · ${quarantine} karantinada`} />
      <LotsTable lots={lots} />
    </>
  );
}
