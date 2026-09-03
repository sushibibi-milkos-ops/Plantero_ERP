import { Skeleton } from '@/components/ui/skeleton';
import { DataTableSkeleton } from '@/components/data-table';

/**
 * Rota özel yükleniyor iskeleti — paylaşılan (app)/loading.tsx "4 KPI kartı" vaat ediyordu, oysa
 * bu sayfada hiç KPI kartı yok, doğrudan araç çubuğu + tablo (Tur 3 P1 bulgusu).
 */
export default function ChannelsLoading() {
  return (
    <div className="space-y-3" aria-busy>
      <div className="mb-5 space-y-2 md:mb-6">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-64 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
      <DataTableSkeleton columns={7} rows={7} headers={['Kanal', 'Tip', 'Bugün', 'Bu ay', 'Sipariş (ay)', 'Komisyon', 'Son senkron']} />
    </div>
  );
}
