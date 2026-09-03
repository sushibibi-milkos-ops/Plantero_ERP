import { Skeleton } from '@/components/ui/skeleton';

/** /uretim/planlama iskeleti — hat×gün ızgarası (jenerik KPI+tablo iskeleti tamamen yanlış şekildi,
 *  Tur 3 bulgusu, P1). Gerçek ızgaranın sütun düzenini (Hat 110px + Planlanmamış 132px + 7 gün +
 *  Toplam 92px) ve 3 hat satırını birebir taşır — yükleme bitince yerleşim sıçramaz. */
export default function PlanningLoading() {
  const gridTemplate = '110px 132px repeat(7, minmax(84px, 1fr)) 92px';
  return (
    <div className="space-y-6" aria-busy>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-40 rounded-md" />
      </div>
      <div className="hidden overflow-hidden rounded-lg border border-border/70 md:block">
        <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={`h-${i}`} className="h-9 rounded-none" />
          ))}
          {Array.from({ length: 3 }).map((_, row) =>
            Array.from({ length: 9 }).map((_, col) => <Skeleton key={`${row}-${col}`} className="h-20 rounded-none opacity-60" />),
          )}
        </div>
      </div>
      <div className="space-y-2 md:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
