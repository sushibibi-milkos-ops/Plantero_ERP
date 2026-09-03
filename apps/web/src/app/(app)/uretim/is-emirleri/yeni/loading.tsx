import { Skeleton } from '@/components/ui/skeleton';

/** /uretim/is-emirleri/yeni iskeleti — form alanları tek kolon + alt aksiyon çubuğu (jenerik
 *  KPI+tablo iskeleti bir form sayfası için tamamen yanlış şekildi, Tur 3 bulgusu, P1). */
export default function NewWorkOrderLoading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="mx-auto max-w-xl space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-11 w-full rounded-md md:h-9" />
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-xl justify-end gap-2">
        <Skeleton className="h-9 w-20 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
    </div>
  );
}
