import { Skeleton } from '@/components/ui/skeleton';
import { DataTableSkeleton } from '@/components/data-table/skeleton';

/** /depo/mal-kabul: KPI şeridi yok, doğrudan tablo — genel iskeletin 4 kartı burada fazlaydı. */
export default function ReceiptsLoading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>
      <DataTableSkeleton columns={6} />
    </div>
  );
}
