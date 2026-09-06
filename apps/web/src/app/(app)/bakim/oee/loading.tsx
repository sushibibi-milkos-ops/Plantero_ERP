import { Skeleton } from '@/components/ui/skeleton';
import { KpiStripRow } from '@/components/kpi-strip';

/**
 * Kök neden (Tur 4 P2 bakim-oee-05): iskelette hat filtresi çip satırı hiç yoktu, KPI bloğu 4 adet
 * (gerçek 5) ve genişliği sabitti (gerçek şerit tam genişlik) → içerik gelince 56px'lik blok sıçraması.
 * Artık: çip satırı yer tutucusu (h-8, gerçek h=32) + KpiStripRow içinde 5×80px tam genişlik şerit.
 */
export default function OeeLoading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-4 w-64" />
        <div className="flex gap-2 pt-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-md" />
          ))}
        </div>
      </div>
      <KpiStripRow>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] w-[152px] shrink-0 rounded-lg md:h-20 md:w-auto md:flex-1 md:rounded-none" />
        ))}
      </KpiStripRow>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
