import { Skeleton } from '@/components/ui/skeleton';

/**
 * Kriter 7 (Tur 2 P1 bakim-isemirleri-10) kök neden düzeltmesi: varsayılan görünüm 'kanban'dan
 * 'list'e geçtiğinde (orders-view.tsx) bu iskelet güncellenmemişti — 4 × 288×384px kanban sütunu
 * çiziyordu, gerçek sayfa (araç çubuğu + tablo) tamamen farklı bir düzen. İskelet artık gerçek
 * OrdersView'ın araç çubuğunu (arama + 3 filtre + görünüm seçici, ~32px) ve altı satırlık tablo
 * iskeletini (36px başlık + 6×36px satır — seed'in 6 iş emrine yakın) yansıtır.
 */
export default function MaintenanceOrdersLoading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-full rounded-md sm:w-64" />
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-16 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="ml-auto hidden h-8 w-20 rounded-md md:block" />
        </div>
        <div className="space-y-px overflow-hidden rounded-lg border">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className={i === 0 ? 'h-9 rounded-none bg-muted/40' : 'h-9 rounded-none'} />
          ))}
        </div>
      </div>
    </div>
  );
}
