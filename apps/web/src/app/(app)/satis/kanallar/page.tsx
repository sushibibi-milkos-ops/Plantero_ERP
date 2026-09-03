import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listChannelCards } from '@/modules/sales/queries';
import { ChannelCard } from '@/modules/sales/components/channel-card';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Satış Kanalları' };
export const dynamic = 'force-dynamic';

export default async function ChannelsPage() {
  await requirePermission('sales.view');
  const channels = await listChannelCards();

  return (
    <>
      <PageHeader title="Kanallar" description={`${channels.length} satış kanalı · komisyon, kargo kesintisi ve pazaryeri senkronu`} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {channels.map((row) => (
          <ChannelCard key={row.channel.id} row={row} />
        ))}
      </div>
    </>
  );
}
