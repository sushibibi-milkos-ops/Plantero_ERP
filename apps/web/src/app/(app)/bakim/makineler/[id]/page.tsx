import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { getMachineDetail } from '@/modules/maintenance/queries';
import { MachineDetailView } from '@/modules/maintenance/components/machine-detail';
import { MACHINE_CATEGORY_LABELS } from '@/modules/maintenance/labels';

export const metadata: Metadata = { title: 'Makine Detayı' };
export const dynamic = 'force-dynamic';

export default async function MachineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission('maintenance.view');
  const detail = await getMachineDetail(id);
  if (!detail) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Makine"
        title={<span className="font-mono">{detail.machine.code}</span>}
        description={detail.machine.name}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
          <StatusBadge status={detail.machine.status} kind="machine" size="md" />
          <span className="text-muted-foreground">{MACHINE_CATEGORY_LABELS[detail.machine.category] ?? detail.machine.category}</span>
        </div>
      </PageHeader>
      <MachineDetailView detail={detail} />
    </>
  );
}
