import { Skeleton } from '@/components/ui/skeleton';

/** /uretim/hatlar iskeleti — 3 hat kartı, KPI şeridi yok (jenerik KPI+tablo iskeleti bu sayfa için
 *  yanlış şekildi, Tur 3 bulgusu, P1). */
export default function ProductionLinesLoading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[232px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
