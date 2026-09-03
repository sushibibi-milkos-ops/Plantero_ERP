import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listPlanningWorkOrders, listLineOptions } from '@/modules/production/queries';
import { PlanningBoard } from '@/modules/production/components/planning-board';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { CalendarRange } from 'lucide-react';

export const metadata: Metadata = { title: 'Üretim Planlama' };
export const dynamic = 'force-dynamic';

function mondayOfThisWeek(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Pazar
  const diff = (day + 6) % 7; // Pazartesi'ye kaç gün geri
  now.setUTCDate(now.getUTCDate() - diff);
  return now.toISOString().slice(0, 10);
}

export default async function PlanningPage() {
  await requirePermission('production.plan');
  const startIso = mondayOfThisWeek();
  const endIso = (() => {
    const d = new Date(`${startIso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 13);
    return d.toISOString().slice(0, 10);
  })();

  const [workOrders, lines] = await Promise.all([listPlanningWorkOrders(startIso, endIso), listLineOptions()]);

  return (
    <>
      <PageHeader title="Üretim Planlama" description="Bu hafta ve gelecek hafta — kartı sürükleyerek hat/gün değiştirin." />
      {lines.length === 0 ? (
        <EmptyState icon={CalendarRange} title="Üretim hattı tanımlı değil" />
      ) : (
        <PlanningBoard lines={lines} workOrders={workOrders} startIso={startIso} />
      )}
    </>
  );
}
