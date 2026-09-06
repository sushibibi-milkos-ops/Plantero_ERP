import { Skeleton } from '@/components/ui/skeleton';
import { DataTableSkeleton } from '@/components/data-table/skeleton';

/**
 * Kök neden (Tur 4 P2 bakim-planlar-03): iskelet 6 satır + araç çubuğu için hiç yer tutucu
 * basıyordu, gerçek sayfa 12 satır + arama/filtre çubuğu ile geliyordu → içerik gelince
 * araç çubuğu kadar sıçrama. /satis/teklifler ile birebir aynı desen (arama + filtre + sütun
 * seçici yer tutucusu, gerçek sütun başlıkları, 12 satır).
 */
export default function PlansLoading() {
  return (
    <div className="space-y-3" aria-busy>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-64 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
      <DataTableSkeleton headers={['Plan', 'Makine', 'Aralık', 'Son yapılan', 'Sonraki', 'Sorumlu', 'Durum']} rows={12} />
    </div>
  );
}
