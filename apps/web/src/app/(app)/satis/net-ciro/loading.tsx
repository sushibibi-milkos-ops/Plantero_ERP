import { Skeleton } from '@/components/ui/skeleton';
import { DataTableSkeleton } from '@/components/data-table';

/**
 * Rota özel yükleniyor iskeleti — paylaşılan (app)/loading.tsx "4 KPI kartı + 8 tablo satırı"
 * vaat ediyordu, oysa bu sayfada 6 KPI (strip), bir zaman serisi grafiği ve 7 sütunlu bir kanal
 * tablosu var (Tur 3 P1 bulgusu).
 */
export default function NetRevenueLoading() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="mb-5 space-y-2 md:mb-6">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-96" />
      </div>
      {/* Dönem seçici şeridi */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-16 rounded-md" />
        ))}
      </div>
      {/* KpiStripRow: 6 kart, sabit 80px, dikey hairline yerine gap */}
      <div className="flex gap-2 md:gap-0 md:divide-x md:divide-border/60">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 w-[140px] shrink-0 space-y-2 rounded-lg border border-border/70 p-3 md:w-auto md:flex-1 md:rounded-none md:border-0 md:px-4 md:py-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
      {/* Grafik bloğu */}
      <div className="rounded-xl border border-border/70 bg-card p-4">
        <Skeleton className="mb-3 h-4 w-40" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
      {/* Kanal kırılımı tablosu: 7 sütun */}
      <DataTableSkeleton columns={7} rows={7} />
    </div>
  );
}
