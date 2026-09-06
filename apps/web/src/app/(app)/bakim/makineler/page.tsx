import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
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
      {/* Kök neden (Tur 4 P1 bakim-makineler-05/06): bu şerit uygulamadaki 154 KpiCard kullanımı
          içinde `variant="strip"` KULLANMAYAN ve `icon=` taşıyan tek yerdi (279×136px ızgara kartı +
          süs ikonu) — /bakim/oee dahil her modül KpiStripRow + variant="strip" kullanıyor. Etiketin
          ("Toplam makine" vb.) taşımadığı bilgiyi tekrar eden ikonlar kaldırıldı, ızgara yerine tek
          satırlık şerit (80px, dikey hairline) geldi — tabloyu artık ~256px daha az aşağı itiyor. */}
      <KpiStripRow>
        <KpiCard title="Toplam makine" value={machines.length} variant="strip" />
        <KpiCard title="Çalışıyor" value={running} variant="strip" />
        <KpiCard title="Arızalı" value={down} invertDelta variant="strip" />
        <KpiCard title="Vadesi geçen bakım" value={overdue} invertDelta variant="strip" />
      </KpiStripRow>
      <MachinesTable machines={machines} />
    </>
  );
}
