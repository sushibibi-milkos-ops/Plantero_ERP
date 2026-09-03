import { Skeleton } from '@/components/ui/skeleton';
import { PageHeaderSkeleton } from '@/modules/masterdata/components/loading-skeletons';

export default function Loading() {
  return (
    <div aria-busy className="max-w-3xl space-y-6">
      <PageHeaderSkeleton />
      <Skeleton className="h-14 rounded-lg" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        </div>
      ))}
    </div>
  );
}
