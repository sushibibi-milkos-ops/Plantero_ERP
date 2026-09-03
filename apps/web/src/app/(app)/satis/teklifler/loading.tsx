import { Skeleton } from '@/components/ui/skeleton';
import { DataTableSkeleton } from '@/components/data-table';

/**
 * Rota özel yükleniyor iskeleti — paylaşılan (app)/loading.tsx "4 KPI kartı" vaat ediyordu, oysa
 * bu sayfada hiç KPI kartı yok, doğrudan araç çubuğu + tablo (Tur 3 P1 bulgusu).
 */
export default function QuotationsLoading() {
  return (
    <div className="space-y-3" aria-busy>
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-64 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
      <DataTableSkeleton columns={6} rows={8} headers={['Belge no', 'Cari', 'Kanal', 'Durum', 'Tarih', 'Geçerlilik']} />
    </div>
  );
}
