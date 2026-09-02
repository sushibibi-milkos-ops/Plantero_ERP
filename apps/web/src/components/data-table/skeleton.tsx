import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Yükleniyor iskeleti: gerçek satır yüksekliğiyle (36px) */
export function DataTableSkeleton({ columns = 5, rows = 8, className }: { columns?: number; rows?: number; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-lg border border-border/70', className)} aria-busy aria-label="Yükleniyor">
      <div className="flex h-9 items-center gap-4 border-b border-border/60 bg-muted/40 px-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1 max-w-32" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex h-9 items-center gap-4 border-b border-border/40 px-3 last:border-0">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-3 flex-1" style={{ maxWidth: `${(((r * 7 + c * 13) % 5) + 3) * 24}px` }} />
          ))}
        </div>
      ))}
    </div>
  );
}
