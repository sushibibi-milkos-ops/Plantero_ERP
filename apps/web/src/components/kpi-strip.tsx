import { cn } from '@/lib/utils';

/**
 * `KpiCard variant="strip"` için sarmalayıcı: masaüstünde tek satır + dikey hairline'lar
 * (kutulama yok — Stripe KPI blokları çerçeveli değildir), mobilde 140px'lik kartların
 * yatay kaydıran (snap) bir şeridi. Kart yüksekliği KpiCard'da sabittir (mobil 72px,
 * masaüstü 80px) — böylece 6 kartlık bir şerit 390px'te ~750px yerine tek bir ~88px'lik
 * satıra iner.
 */
export function KpiStripRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'mb-6 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        'snap-x snap-mandatory md:snap-none',
        'md:gap-0 md:divide-x md:divide-border/60 md:overflow-visible md:pb-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
