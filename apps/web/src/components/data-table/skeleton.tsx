import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Yükleniyor iskeleti: gerçek satır yüksekliğiyle (36px).
 * `headers` verilirse sütun başlıkları gri kutu değil gerçek metin olarak basılır — sayfa yapısı
 * (kaç sütun, ne isimde) yüklenmeden önce zaten bilindiği için Linear/Stripe bunu asla gizlemez;
 * yalnızca içerik hücreleri (satır verisi) `<Skeleton>` olur.
 */
export function DataTableSkeleton({ columns = 5, rows = 8, headers, className }: { columns?: number; rows?: number; headers?: string[]; className?: string }) {
  const colCount = headers?.length ?? columns;
  return (
    <div className={cn('overflow-hidden rounded-lg border border-border/70', className)} aria-busy aria-label="Yükleniyor">
      <div className="flex h-9 items-center gap-4 border-b border-border/60 bg-muted/40 px-3">
        {headers
          ? headers.map((h, i) => (
              <span key={i} className="flex-1 max-w-32 truncate text-[12px] font-medium whitespace-nowrap text-muted-foreground">
                {h}
              </span>
            ))
          : Array.from({ length: columns }).map((_, i) => <Skeleton key={i} className="h-3 flex-1 max-w-32" />)}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex h-9 items-center gap-4 border-b border-border/40 px-3 last:border-0">
          {Array.from({ length: colCount }).map((_, c) => (
            <Skeleton key={c} className="h-3 flex-1" style={{ maxWidth: `${(((r * 7 + c * 13) % 5) + 3) * 24}px` }} />
          ))}
        </div>
      ))}
    </div>
  );
}
