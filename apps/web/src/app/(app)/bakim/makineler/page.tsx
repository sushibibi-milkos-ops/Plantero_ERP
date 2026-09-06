import type { Metadata } from 'next';
import { AlertTriangle, Cog, Gauge, Wrench } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { listMachines } from '@/modules/maintenance/queries';
import { MachinesTable } from '@/modules/maintenance/components/machines-table';

export const metadata: Metadata = { title: 'Makineler' };
export const dynamic = 'force-dynamic';

export default async function MachinesPage() {
  await requirePermission('maintenance.view');
  const machines = await listMachines();

  const running = machines.filter((m) => m.status === 'running').length;
  const down = machines.filter((m) => m.status === 'down').length;
  const overdue = machines.filter((m) => m.nextDueAt && m.nextDueAt < new Date().toISOString().slice(0, 10)).length;

  return (
    <>
      <PageHeader title="Makineler" description={`${machines.length} makine kartı — kapasite raporu ekipmanları`} />
      {/* `icon` sunucu bileşeninden HAZIR ELEMENT olarak geçilir (`<Icon />`) — ham bileşen türü
          (`icon={Cog}`) sunucu→istemci sınırında serileştirilemeyen bir fonksiyon değeridir
          (bkz. kpi-card.tsx üstündeki sözleşme yorumu). */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard title="Toplam makine" value={machines.length} icon={<Cog />} />
        <KpiCard title="Çalışıyor" value={running} icon={<Gauge />} />
        <KpiCard title="Arızalı" value={down} icon={<Wrench />} invertDelta />
        <KpiCard title="Vadesi geçen bakım" value={overdue} icon={<AlertTriangle />} invertDelta />
      </div>
      <MachinesTable machines={machines} />
    </>
  );
}
