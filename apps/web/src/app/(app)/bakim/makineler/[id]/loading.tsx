import { Skeleton } from '@/components/ui/skeleton';

// Kriter 7 (Tur 3 P1 bakim-makine-detay-09) kök neden düzeltmesi: bu iskelet Tur 2'de yeniden kurulan
// gerçek sayfayı (hairline tanım listesi + line-tab + 3 sütunlu özet + OEE sparkline) yansıtmıyordu —
// eski "8 gri dolgulu StatCell kutusu" düzeni (bakim-makine-detay-06 düzeltmesinden önceki tasarım)
// hâlâ duruyordu. Gerçek sayfada ARTIK hiçbir gri dolgulu yüzey yok (`DetailFieldGroupsGrid` salt
// ince metin satırları basar) — iskelet de aynı dile geçti: her alan `etiket satırı + değer satırı`
// (iki ince `Skeleton` çizgisi), StatCell/kart yerine. Yükseklik `pnpm tsx scripts/probe-bakim-
// r4-skeleton.ts` ile gerçek sayfaya (contentBottom) karşı ölçüldü.
export default function MachineDetailLoading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>

      <div className="flex gap-6 border-b border-border/60 pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-20" />
        ))}
      </div>

      <div className="space-y-3">
        <Skeleton className="h-3.5 w-14" />
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-6 [&>*]:min-w-0 sm:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, g) => (
          <div key={g} className="space-y-3 border-t border-border/60 pt-3">
            <Skeleton className="h-3.5 w-28" />
            <div className="space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3 border-t border-border/60 pt-5">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-3.5 w-44" />
          <Skeleton className="h-5 w-12" />
        </div>
        <div className="flex h-[120px] items-end">
          <Skeleton className="h-px w-full" />
        </div>
      </div>
    </div>
  );
}
