import { Skeleton } from '@/components/ui/skeleton';
import { DataTableSkeleton } from '@/components/data-table';
import { cn } from '@/lib/utils';

/**
 * Rota bazlı `loading.tsx` iskeletleri — genel (app)/loading.tsx (4 eşit baloncuk) ile hiç örtüşmeyen,
 * gerçek sayfa düzenine (±4px) yakın iskeletler. Sunucu bileşeni verileri çözerken Next bunu gösterir;
 * hedef: 400ms altı görünse bile nihai düzenle uyumlu olsun (P0 — receteler/[id], cariler bulgusu).
 */

/** PageHeader ile aynı yükseklik: 20px başlık + 13px alt satır. */
export function PageHeaderSkeleton({ withEyebrow = false }: { withEyebrow?: boolean }) {
  return (
    <div className="mb-5 space-y-2 md:mb-6">
      {withEyebrow ? <Skeleton className="h-3 w-24" /> : null}
      <Skeleton className="h-6 w-56" />
      <Skeleton className="h-4 w-80" />
    </div>
  );
}

/** Liste ekranları: başlık + DataTable'ın kendi 36px satırlı iskeleti (gerçek tabloyla birebir aynı). */
export function ListPageSkeleton({ columns = 6 }: { columns?: number }) {
  return (
    <div aria-busy>
      <PageHeaderSkeleton />
      <div className="mb-3 flex items-center gap-2">
        <Skeleton className="h-9 w-64 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
      <DataTableSkeleton columns={columns} />
    </div>
  );
}

/** Detay ekranları: başlık(eyebrow dahil) + sekme şeridi + KPI şeridi + 36px satırlı tablo. */
export function DetailPageSkeleton({ tabs = 5, kpis = 4, rows = 6 }: { tabs?: number; kpis?: number; rows?: number }) {
  return (
    <div aria-busy>
      <PageHeaderSkeleton withEyebrow />
      {tabs > 0 ? (
        <div className="-mx-4 mb-4 flex gap-4 overflow-x-auto border-b border-border/60 px-4 md:mx-0 md:px-0">
          {Array.from({ length: tabs }).map((_, i) => (
            <Skeleton key={i} className="mb-2 h-4 w-16 shrink-0" />
          ))}
        </div>
      ) : null}
      {kpis > 0 ? (
        // Gerçek KPI şeritleriyle (bom-detail-form.tsx, partner-general-tab.tsx) aynı anatomi: 390px'te
        // grid-cols-2, ≥sm'de hücre sayısı kadar sütun + hairline ayraç — önceden `flex divide-x`
        // kullanıyordu, hücre sayısı değiştiğinde (ör. 3 KPI'lık cari şeridi) gerçek düzenle örtüşmüyordu.
        <div
          className={cn(
            'grid grid-cols-2 divide-x divide-y divide-border/60 rounded-lg border border-border/60 bg-muted/10 sm:divide-y-0',
            kpis <= 2 ? 'sm:grid-cols-2' : kpis === 3 ? 'sm:grid-cols-3' : kpis === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-5',
          )}
        >
          {Array.from({ length: kpis }).map((_, i) => (
            <div key={i} className="space-y-2 px-4 py-3">
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-6 overflow-hidden rounded-lg border border-border/70">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex h-9 items-center gap-4 border-b border-border/40 px-3 last:border-0">
            {Array.from({ length: 4 }).map((_, c) => (
              <Skeleton key={c} className="h-3 flex-1" style={{ maxWidth: `${(((r * 7 + c * 13) % 5) + 3) * 24}px` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Lokasyon ağacı: başlık + tekli-derinlikte ~8 satırlık ağaç iskeleti. */
export function TreePageSkeleton() {
  return (
    <div aria-busy>
      <PageHeaderSkeleton />
      <div className="space-y-8">
        {Array.from({ length: 2 }).map((_, s) => (
          <div key={s}>
            <Skeleton className="mb-2 h-5 w-40" />
            <div className="rounded-lg border border-border/70 p-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex h-9 items-center gap-2 border-b border-border/40 px-2 last:border-0">
                  <Skeleton className="size-4 rounded" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 flex-1 max-w-32" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
