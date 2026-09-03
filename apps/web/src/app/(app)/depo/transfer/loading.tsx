import { Skeleton } from '@/components/ui/skeleton';
import { DataTableSkeleton } from '@/components/data-table/skeleton';
import { PageHeader } from '@/components/page-header';
import { KpiStripRow } from '@/components/kpi-strip';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

/** /depo/transfer: başlık gerçek metinle, KPI şeridi + tablo. */
export default function TransfersLoading() {
  return (
    <div aria-busy>
      <PageHeader
        title="Transfer"
        description={<Skeleton className="h-4 w-32" />}
        actions={
          <Button disabled className="pointer-events-none opacity-60">
            <Plus className="size-4" /> Yeni transfer
          </Button>
        }
      />
      <KpiStripRow>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] w-[140px] shrink-0 rounded-lg md:h-20 md:w-auto md:flex-1 md:rounded-none" />
        ))}
      </KpiStripRow>
      <DataTableSkeleton headers={['Belge no', 'Güzergah', 'Durum', 'Satır', 'Değer', 'Planlanan tarih', 'Oluşturma']} />
    </div>
  );
}
