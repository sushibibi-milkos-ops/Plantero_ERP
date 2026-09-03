import { Skeleton } from '@/components/ui/skeleton';

/**
 * /uretim/is-emirleri iskeleti — jenerik (app)/loading.tsx'in `xl:grid-cols-4`'ü gerçek KPI
 * ızgarasıyla (`grid-cols-2 lg:grid-cols-4`) uyuşmuyordu: 1024-1279px'te iskelet 2 sütun açıp
 * sayfa 4 sütuna sıçrıyordu (Tur 3 bulgusu, P1). Bu sayfaya özel iskelet gerçek kırılma noktasını
 * ve KpiCard'ın gerçek min yüksekliğini (104px) birebir taşır.
 */
export default function WorkOrdersLoading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
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
