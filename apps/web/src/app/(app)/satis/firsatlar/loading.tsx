import { Skeleton } from '@/components/ui/skeleton';

/**
 * Rota özel yükleniyor iskeleti (bkz. fiyat-listeleri/loading.tsx örneği) — paylaşılan
 * (app)/loading.tsx "4 KPI kartı + 8 tablo satırı" vaat ediyordu, oysa bu sayfada hiç KPI kartı
 * yok: tek satır huni özeti + kanban board (Tur 3 P1 bulgusu — soğuk ilk çekimde yakalandı).
 */
export default function OpportunitiesLoading() {
  return (
    <div className="space-y-3" aria-busy>
      <div className="mb-5 space-y-2 md:mb-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-56" />
      </div>
      {/* Huni özeti: tek satır aşama sayaçları + görünüm değiştirici */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-2.5">
        <div className="flex items-center gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-16" />
          ))}
        </div>
        <Skeleton className="hidden h-7 w-16 shrink-0 rounded-md md:block" />
      </div>
      {/* Kanban: 5 sütun, her birinde 2-3 kart */}
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }).map((_, col) => (
          <div key={col} className="w-64 shrink-0 space-y-2 rounded-xl border border-border/60 bg-muted/30 p-2">
            <Skeleton className="mx-1 mt-1 h-4 w-24" />
            {Array.from({ length: 2 + (col % 2) }).map((_, r) => (
              <Skeleton key={r} className="h-20 rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
