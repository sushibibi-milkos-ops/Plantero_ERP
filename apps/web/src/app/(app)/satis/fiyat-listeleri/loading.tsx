import { Skeleton } from '@/components/ui/skeleton';
import { DataTableSkeleton } from '@/components/data-table';

/**
 * Rota özel yükleniyor iskeleti: paylaşılan (app)/loading.tsx 4 KPI kartı varsayar, oysa bu
 * sayfada hiç KPI kartı yok — genel iskelet nihai düzeni yanlış vaat ediyordu. Başlık + sekme
 * şeridi + tablo iskeleti gerçek düzenle birebir.
 */
export default function PriceListsLoading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="flex gap-4 border-b border-border/60 pb-px">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-7 w-40" />
      </div>
      <DataTableSkeleton columns={6} rows={6} />
    </div>
  );
}
