import { Skeleton } from '@/components/ui/skeleton';
import { DataTableSkeleton } from '@/components/data-table/skeleton';
import { PageHeader } from '@/components/page-header';
import { KpiStripRow } from '@/components/kpi-strip';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

/** /depo/mal-kabul: kardeş ekranlarla (sayım, transfer) aynı KPI şeridi + tablo (Tur 3 P2 bulgusu). */
export default function ReceiptsLoading() {
  return (
    <div aria-busy>
      <PageHeader
        title="Mal Kabul"
        description={<Skeleton className="h-4 w-40" />}
        actions={
          <Button disabled className="pointer-events-none opacity-60">
            <Plus className="size-4" /> Yeni mal kabul
          </Button>
        }
      />
      <KpiStripRow>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] w-[140px] shrink-0 rounded-lg md:h-20 md:w-auto md:flex-1 md:rounded-none" />
        ))}
      </KpiStripRow>
      <DataTableSkeleton headers={['Belge no', 'Tedarikçi', 'Durum', 'Toplam tutar', 'İrsaliye no', 'Tarih']} />
    </div>
  );
}
