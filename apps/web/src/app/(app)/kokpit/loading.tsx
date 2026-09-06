import { Skeleton } from '@/components/ui/skeleton';

/**
 * Rota özel yükleniyor iskeleti — paylaşılan (app)/loading.tsx (4x h-24 kart ızgarası + 8x h-9 tablo
 * satırı) kokpit'in gerçek düzeniyle (80px çerçevesiz KpiStripRow + lg:grid-cols-2 bölüm kartları)
 * hiç örtüşmüyordu: `dynamic='force-dynamic'` + birden çok await'li sorgu beklerken uygulamanın en
 * çok açılan sayfasında görünür bir düzen sıçraması oluyordu (Tur 1 P1 kokpit-loading-skeleton-01 /
 * P2 kokpit-uretim-loading-01 — üretim şefi kesitinde en belirgindi: iskelet 4 kart + 8 satır vaat
 * edip 1 kart + 3 satır teslim ediyordu). Rol bilgisi burada yok (session henüz çözülmedi) — bu yüzden
 * TÜM rol panolarının paylaştığı ortak iskelet (KpiStripRow + DashboardGrid) basılır; beş rol görünümü
 * de artık aynı iskeleti (KpiStripRow + `Section`) kullandığı için tek bir iskelet hepsine uyar.
 */
export default function CockpitLoading() {
  return (
    <div aria-busy>
      <div className="mb-5 space-y-2 md:mb-6">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* KpiStripRow (kpi-strip.tsx) ile aynı anatomi: çerçevesiz, masaüstünde dikey hairline. */}
      <div className="mb-6 grid grid-cols-2 divide-x divide-y divide-border/60 rounded-lg border border-border/60 sm:grid-cols-4 sm:divide-y-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 px-4 py-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>

      {/* DashboardGrid (shared.tsx) ile aynı anatomi: lg:grid-cols-2, her kolonda birkaç `Section`. */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        {[0, 1].map((col) => (
          <div key={col} className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-border/70">
                <div className="flex h-11 items-center justify-between border-b border-border/60 px-4">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-10" />
                </div>
                <div className="divide-y divide-border/50">
                  {Array.from({ length: 3 }).map((_, r) => (
                    <div key={r} className="flex h-11 items-center justify-between gap-3 px-4">
                      <Skeleton className="h-3 w-40" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
