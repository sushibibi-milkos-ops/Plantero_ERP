import { Skeleton } from '@/components/ui/skeleton';
import { DataTableSkeleton } from '@/components/data-table/skeleton';

/** /depo/transfer: KPI şeridi yok, doğrudan tablo. */
export default function TransfersLoading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>
      <DataTableSkeleton columns={5} />
    </div>
  );
}
