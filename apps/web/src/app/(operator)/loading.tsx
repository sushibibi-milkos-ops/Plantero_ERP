import { Skeleton } from '@/components/ui/skeleton';

/**
 * Operatör terminali geçiş iskeleti: `(operator)` grubu `(app)`'in genel `loading.tsx`'ini miras
 * almaz (ayrı route grubu) — hat seçiminden iş emrine geçerken (her sayfa `force-dynamic`, sunucu
 * sorgusu var) atölye wifi'sinde beyaz/donmuş ekran kalmasın diye kendi iskeleti.
 * Hem `/operator` (kart ızgarası) hem `/operator/[lineId]` (4 StatTile + aksiyon + liste) için
 * genel geçer bir yaklaşımı hedefler.
 */
export default function OperatorLoading() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4" aria-busy aria-label="Yükleniyor">
      <div className="flex items-center gap-2">
        <Skeleton className="size-11 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-48" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>

      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
