import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, ListChecks, PlayCircle, PackageCheck, Percent } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { listWorkOrders, getWorkOrderKpis } from '@/modules/production/queries';
import { WorkOrdersTable } from '@/modules/production/components/work-orders-table';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'İş Emirleri' };
export const dynamic = 'force-dynamic';

export default async function WorkOrdersPage() {
  const user = await requirePermission('production.view');
  const [workOrders, kpis] = await Promise.all([listWorkOrders(), getWorkOrderKpis()]);

  return (
    <>
      <PageHeader
        title="İş Emirleri"
        description={`${workOrders.length} iş emri`}
        actions={
          userCan(user, 'production.plan') ? (
            <Button asChild>
              <Link href="/uretim/is-emirleri/yeni">
                <Plus className="size-4" /> Yeni iş emri
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard title="Açık iş emri" value={kpis.openCount} format="int" icon={<ListChecks strokeWidth={1.75} />} />
        <KpiCard title="Üretimde" value={kpis.inProgressCount} format="int" icon={<PlayCircle strokeWidth={1.75} />} />
        <KpiCard title="Açık iş emri değeri" value={kpis.plannedValue} format="money" icon={<PackageCheck strokeWidth={1.75} />} />
        <KpiCard title="Ortalama verim" value={kpis.avgYieldPct} format="pct" icon={<Percent strokeWidth={1.75} />} />
      </div>

      <WorkOrdersTable workOrders={workOrders} />
    </>
  );
}
