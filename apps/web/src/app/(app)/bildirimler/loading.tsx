import { Skeleton } from '@/components/ui/skeleton';

/**
 * Rota özel yükleniyor iskeleti — paylaşılan (app)/loading.tsx bu ekranda hiç bulunmayan 4 KPI
 * kartı çiziyordu (Tur 2 P1 bildirimler-07). Başlık + sekme şeridi + satır iskeleti (KPI bloğu yok).
 */
export default function NotificationsLoading() {
  return (
    <div className="max-w-3xl space-y-3" aria-busy>
      <div className="mb-5 space-y-2 sm:mb-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-11 w-48 rounded-lg md:h-8" />
      </div>
      <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-none" />
        ))}
      </div>
    </div>
  );
}
