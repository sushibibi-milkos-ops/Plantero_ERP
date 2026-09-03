import { Skeleton } from '@/components/ui/skeleton';
import { DataTableSkeleton } from '@/components/data-table/skeleton';
import { PageHeader } from '@/components/page-header';
import { KpiStripRow } from '@/components/kpi-strip';

/** /depo/skt: başlık gerçek metinle, 4 kova KPI'sı + tablo. */
export default function ExpiryLoading() {
  return (
    <div aria-busy>
      <PageHeader title="SKT Takibi" description={<Skeleton className="h-4 w-72" />} />
      <KpiStripRow>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] w-[140px] shrink-0 rounded-lg md:h-20 md:w-auto md:flex-1 md:rounded-none" />
        ))}
      </KpiStripRow>
      <DataTableSkeleton headers={['Lot', 'Ürün', 'Lokasyon', 'Miktar', 'Değer', 'SKT']} />
    </div>
  );
}
