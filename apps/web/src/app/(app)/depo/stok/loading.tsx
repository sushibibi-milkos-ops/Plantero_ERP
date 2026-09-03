import { Skeleton } from '@/components/ui/skeleton';
import { DataTableSkeleton } from '@/components/data-table/skeleton';

/**
 * /depo/stok'a özel iskelet: gerçek düzenle birebir (başlık + 6 KPI kartı + tablo).
 * Genel `app/(app)/loading.tsx` 4 kart varsayıyordu — geçişte sütun sayısı değişip
 * düzen sıçraması (CLS) yaratıyordu.
 */
export default function StockLoading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <DataTableSkeleton columns={7} />
    </div>
  );
}
