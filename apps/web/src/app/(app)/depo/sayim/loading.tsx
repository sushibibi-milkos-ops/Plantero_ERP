import { Skeleton } from '@/components/ui/skeleton';
import { DataTableSkeleton } from '@/components/data-table/skeleton';

/** /depo/sayim: KPI şeridi yok, doğrudan tablo. */
export default function CountsLoading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-11 w-36 rounded-md" />
      </div>
      <DataTableSkeleton columns={5} />
    </div>
  );
}
