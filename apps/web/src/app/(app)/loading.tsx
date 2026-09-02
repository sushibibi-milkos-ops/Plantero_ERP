import { Skeleton } from '@/components/ui/skeleton';

/** Sayfa geçişi iskeleti: başlık + KPI şeridi + tablo satırları */
export default function AppLoading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="space-y-px overflow-hidden rounded-lg border">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 rounded-none" />
        ))}
      </div>
    </div>
  );
}
