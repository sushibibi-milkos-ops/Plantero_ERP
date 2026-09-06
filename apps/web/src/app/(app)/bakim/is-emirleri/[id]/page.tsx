import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission, userCan } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { getMaintenanceOrderDetail } from '@/modules/maintenance/queries';
import { OrderDetailView } from '@/modules/maintenance/components/order-detail';
import { PRIORITY_TONE } from '@/modules/maintenance/labels';

export const metadata: Metadata = { title: 'Bakım İş Emri Detayı' };
export const dynamic = 'force-dynamic';

export default async function MaintenanceOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('maintenance.view');
  const detail = await getMaintenanceOrderDetail(id);
  if (!detail) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Bakım İş Emri"
        title={<span className="font-mono">{detail.order.docNo}</span>}
        description={detail.order.title}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
          <StatusBadge status={detail.order.status} kind="maintenance" size="md" />
          {/* Kriter 4 (Tur 2 P1 bakim-isemirleri-detay-02): tone override — bkz. labels.ts PRIORITY_TONE. */}
          <StatusBadge status={detail.order.priority} kind="maintenance_priority" tone={PRIORITY_TONE[detail.order.priority]} />
          <span className="text-muted-foreground">{detail.machine.name}</span>
        </div>
      </PageHeader>
      <OrderDetailView detail={detail} canExecute={userCan(user, 'maintenance.execute')} />
    </>
  );
}
