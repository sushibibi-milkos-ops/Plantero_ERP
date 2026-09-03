import { Skeleton } from '@/components/ui/skeleton';

/** /depo/mal-kabul/yeni: form ekranı — KPI/tablo yok, genel iskelet uymuyordu. */
export default function NewReceiptLoading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="mx-auto max-w-3xl space-y-4 rounded-xl border border-border/70 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-10 rounded-md" />
          <Skeleton className="h-10 rounded-md" />
        </div>
        <Skeleton className="h-10 rounded-md" />
        <div className="space-y-px overflow-hidden rounded-lg border">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 rounded-none" />
          ))}
        </div>
      </div>
    </div>
  );
}
