import { Skeleton } from '@/components/ui/skeleton';

/** /uretim/is-emirleri/[id] iskeleti — başlık + rozet/meta şeridi + istatistik şeridi + sekmeler
 *  (jenerik KPI+tablo iskeleti bu sayfanın gerçek şekliyle uyuşmuyordu, Tur 3 bulgusu, P1). */
export default function WorkOrderDetailLoading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-56" />
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="flex w-fit divide-x divide-border/60 border-y border-border/60">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="min-w-[92px] space-y-1.5 px-4 py-2.5">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex gap-1 border-b border-border/60 pb-px">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-t-md" />
          ))}
        </div>
        <div className="space-y-px overflow-hidden rounded-lg border">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 rounded-none" />
          ))}
        </div>
      </div>
    </div>
  );
}
