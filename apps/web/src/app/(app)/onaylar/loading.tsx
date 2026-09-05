import { Skeleton } from '@/components/ui/skeleton';

/**
 * Rota özel yükleniyor iskeleti — paylaşılan (app)/loading.tsx bu ekranda hiç bulunmayan 4 KPI
 * kartı çiziyordu, her girişte yanlış iskelet titriyordu (Tur 2 P1 onaylar-12). Başlık + sekme
 * şeridi + 13x yoğun satır (KPI bloğu yok).
 */
export default function ApprovalsLoading() {
  return (
    <div className="space-y-3" aria-busy>
      <div className="mb-5 space-y-2 sm:mb-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-11 w-64 rounded-lg md:h-8" />
      </div>
      <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
        {Array.from({ length: 13 }).map((_, i) => (
          <Skeleton key={i} className="h-11 rounded-none sm:h-10" />
        ))}
      </div>
    </div>
  );
}
