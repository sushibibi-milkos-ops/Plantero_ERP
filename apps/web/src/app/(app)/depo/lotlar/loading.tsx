import { Skeleton } from '@/components/ui/skeleton';
import { DataTableSkeleton } from '@/components/data-table/skeleton';

/** /depo/lotlar: KPI şeridi yok, doğrudan tablo. */
export default function LotsLoading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-64" />
      </div>
      <DataTableSkeleton columns={7} />
    </div>
  );
}
