import { Skeleton } from '@/components/ui/skeleton';
import { DataTableSkeleton } from '@/components/data-table/skeleton';
import { PageHeader } from '@/components/page-header';
import { KpiStripRow } from '@/components/kpi-strip';

/**
 * Kök neden (Tur 4 P2 bakim-makineler-04): iskelet KPI bloğu (104px) gerçek karttan (o zamanki
 * 136px ızgara) farklıydı ve araç çubuğu için hiç yer ayrılmıyordu → içerik gelince sıçrama.
 * Sayfa artık `KpiStripRow` + `variant="strip"` (80px) kullandığından (bakim-makineler-05/06 ile
 * birlikte) iskelet de aynı geometriye taşındı — /depo/stok ile birebir aynı desen.
 */
export default function MachinesLoading() {
  return (
    <div aria-busy>
      <PageHeader title="Makineler" description={<Skeleton className="h-4 w-56" />} />
      <KpiStripRow>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] w-[152px] shrink-0 rounded-lg md:h-20 md:w-auto md:flex-1 md:rounded-none" />
        ))}
      </KpiStripRow>
      <DataTableSkeleton headers={['Kod', 'Makine', 'Hat', 'Durum', 'Sonraki bakım', 'Çalışma saati', 'Açık iş emri']} rows={15} />
    </div>
  );
}
