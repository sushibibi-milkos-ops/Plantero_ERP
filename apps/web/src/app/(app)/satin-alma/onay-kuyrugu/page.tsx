import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listApprovalQueue } from '@/modules/purchasing/queries';
import { ApprovalQueueList } from '@/modules/purchasing/components/approval-queue-list';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Onay Kuyruğu' };
export const dynamic = 'force-dynamic';

export default async function ApprovalQueuePage() {
  await requirePermission('purchasing.approve');
  const items = await listApprovalQueue();

  return (
    <>
      <PageHeader title="Onay Kuyruğu" description={`${items.length} AI taslağı onay bekliyor`} />
      <ApprovalQueueList items={items} />
    </>
  );
}
