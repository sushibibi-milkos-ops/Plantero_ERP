import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listChannelCards } from '@/modules/sales/queries';
import { ChannelsTable } from '@/modules/sales/components/channels-table';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Satış Kanalları' };
export const dynamic = 'force-dynamic';

export default async function ChannelsPage() {
  await requirePermission('sales.view');
  const channels = await listChannelCards();

  return (
    <>
      <PageHeader title="Kanallar" description={`${channels.length} satış kanalı · komisyon, kargo kesintisi ve pazaryeri senkronu`} />
      <ChannelsTable rows={channels} />
    </>
  );
}
