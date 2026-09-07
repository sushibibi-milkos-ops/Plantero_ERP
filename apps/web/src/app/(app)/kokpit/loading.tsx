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
 *
 * Tur 9 P1 düzeltmesi (kokpit-loading-skeleton-mismatch-09): önceki iskelet KpiStripRow/Row'un GERÇEK
 * anatomisini değil, yorumdaki iddiayı taşıyordu. Artık her ölçü doğrudan kaynak bileşenden kopyalanır:
 * - KPI şeridi: `kpi-strip.tsx`'teki `KpiStripRow` sarmalayıcısı ile BİREBİR aynı sınıflar (dış çerçeve/
 *   rounded YOK, mobilde `flex gap-2 overflow-x-auto snap-x`, masaüstünde `md:overflow-visible`).
 *   Kart iskeletleri `kpi-card.tsx`'teki `variant="strip"` ölçüleriyle birebir: mobil 152×72 + rounded-lg
 *   border, masaüstü `md:h-20` + çerçevesiz + `md:border-l md:first:border-l-0` dikey hairline.
 * - Liste satırları: masaüstünde `ROW_BASE` (`shared.tsx`) ile birebir `sm:h-10` (40px). Mobilde
 *   `ROW_BASE`'in KENDİ sınıfı `min-h-11` (44px) yalnızca bir ALT sınırdır — gerçek satırın ölçülen
 *   mobil yüksekliği (62,5-65,5px) iki satır GERÇEK metnin kendi içerik yüksekliğinden gelir; sabit
 *   boy `Skeleton` çubukları o içeriği doldurmadığından iskelet `max-sm:min-h-[63px]` ile GERÇEK
 *   ölçüyü doğrudan hedefler (bkz. `scripts/probe-kokpit-r9f.ts` kabul ölçütü).
 */
export default function CockpitLoading() {
  return (
    <div aria-busy>
      <div className="mb-5 space-y-2 md:mb-6">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* KpiStripRow (kpi-strip.tsx) ile aynı sınıflar/style: dış çerçeve/rounded yok, mobilde yatay
          kaydıran snap şeridi + scroll-fade-x affordance'ı, masaüstünde çerçevesiz + kart başına sol
          hairline. `--scroll-fade-bg`: kokpit sayfa zemininde durur (var(--card) DEĞİL). */}
      <div
        className="scrollbar-thin scroll-fade-x relative mb-6 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 md:gap-0 md:overflow-visible md:bg-transparent md:pb-0 md:[background-image:none] md:snap-none"
        style={{ '--scroll-fade-bg': 'var(--background)' } as React.CSSProperties}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[72px] w-[152px] shrink-0 snap-start space-y-2 rounded-lg border border-border/70 bg-card px-3 py-2 md:h-20 md:w-auto md:flex-1 md:snap-align-none md:rounded-none md:border-y-0 md:border-r-0 md:border-l md:border-border/60 md:bg-transparent md:px-4 md:py-3 md:first:border-l-0"
          >
            <Skeleton className="h-3 w-16 md:w-20" />
            <Skeleton className="h-5 w-20 md:w-24" />
          </div>
        ))}
      </div>

      {/* DashboardGrid (shared.tsx) ile aynı anatomi: lg:grid-cols-2, her kolonda birkaç `Section`,
          satır bandı `ROW_BASE` bandıyla eşleşir (masaüstü h-10=40px, mobil ölçülen ~63px). */}
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
                  {/* Satır bandı `ROW_BASE`'in kendisi değil (min-h-11=44px yalnızca bir ALT sınır —
                      GERÇEK satırın mobil yüksekliği (62,5-65,5px) iki satır GERÇEK metnin kendi
                      içerik yüksekliğinden gelir, iskeletin sabit boy Skeleton çubukları o içeriği
                      doldurmaz). `max-sm:min-h-[63px]` GERÇEK ölçülen yüksekliği doğrudan hedefler
                      (probe-kokpit-r9f.ts kabul ölçütü: mobilde 63 ± 4px). */}
                  {Array.from({ length: 3 }).map((_, r) => (
                    <div key={r} className="flex max-sm:min-h-[63px] flex-col justify-center gap-1 px-4 py-2.5 sm:h-10 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
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
