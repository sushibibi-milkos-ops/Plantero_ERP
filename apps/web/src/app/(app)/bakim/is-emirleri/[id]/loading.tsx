import { Skeleton } from '@/components/ui/skeleton';

// Kriter 7 (Tur 3 P1 bakim-isemirleri-detay-06) kök neden düzeltmesi: bu iskelet Tur 2'de yeniden
// kurulan gerçek sayfayı (3 alan grubu + açıklama kartı + kontrol listesi + olay geçmişi + "diğer iş
// emirleri" + sabit eylem çubuğu) yansıtmıyordu. Yer tutucular gerçek bölümlerle bire bir eşleşmez
// (içerik veriye bağlı — açıklama/kontrol listesi/fotoğraf yalnızca doluysa basılır) ama yükseklik
// sınıfı `pnpm tsx scripts/probe-bakim-r4-skeleton.ts` ile sparse bir iş emrine (MO-2026-000006)
// karşı ölçüldü.
export default function MaintenanceOrderDetailLoading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-56" />
      </div>

      <div className="space-y-5">
        {[5, 4, 4].map((n, g) => (
          <div key={g} className={g === 0 ? 'space-y-2.5' : 'space-y-2.5 border-t border-border/60 pt-3'}>
            <Skeleton className="h-3.5 w-32" />
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: n }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border/70 p-4">
        <Skeleton className="mb-2.5 h-3 w-20" />
        <Skeleton className="h-4 w-full" />
      </div>

      <div className="space-y-2.5">
        <Skeleton className="h-3 w-28" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-6 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5 pt-0.5">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Skeleton className="h-3 w-48" />
        <div className="flex h-11 items-center justify-between gap-2 border-t border-border/50">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>

      <div className="flex gap-2 border-t border-border pt-3">
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="h-9 w-20 rounded-md" />
      </div>
    </div>
  );
}
