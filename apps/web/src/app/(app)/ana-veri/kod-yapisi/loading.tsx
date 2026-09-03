import { Skeleton } from '@/components/ui/skeleton';
import { PageHeaderSkeleton } from '@/modules/masterdata/components/loading-skeletons';

export default function Loading() {
  return (
    <div aria-busy>
      <PageHeaderSkeleton />
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, s) => (
          <div key={s}>
            <Skeleton className="mb-2 h-4 w-56" />
            <div className="overflow-hidden rounded-lg">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex h-9 items-center gap-4 border-b border-border/40 px-3 last:border-0">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-40" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
