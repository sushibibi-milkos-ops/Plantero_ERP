import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Sunucu tarafı sayfalama (50/sayfa) — DataTablePagination'ın istemci durumu tutmayan eşdeğeri.
 * Diğer filtre parametreleri korunarak yalnızca `page` değişir.
 */
export function AuditPager({
  page,
  pageSize,
  total,
  searchParams,
}: {
  page: number;
  pageSize: number;
  total: number;
  searchParams: Record<string, string | undefined>;
}) {
  if (total === 0) return null;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const hrefFor = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (v) params.set(k, v);
    if (p > 1) params.set('page', String(p));
    else params.delete('page');
    const qs = params.toString();
    return `/ayarlar/audit${qs ? `?${qs}` : ''}`;
  };

  const btnClass = (disabled: boolean) =>
    cn(
      'inline-flex size-11 items-center justify-center rounded-md text-muted-foreground md:size-8',
      disabled ? 'pointer-events-none opacity-40' : 'hover:bg-accent hover:text-foreground',
    );

  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <span className="num">
        {from.toLocaleString('tr-TR')}–{to.toLocaleString('tr-TR')} / {total.toLocaleString('tr-TR')}
      </span>
      {pageCount > 1 ? (
        <div className="flex items-center gap-1">
          <Link href={hrefFor(page - 1)} aria-label="Önceki sayfa" aria-disabled={page <= 1} className={btnClass(page <= 1)}>
            <ChevronLeft className="size-4" />
          </Link>
          <span className="num px-1">
            {page} / {pageCount}
          </span>
          <Link href={hrefFor(page + 1)} aria-label="Sonraki sayfa" aria-disabled={page >= pageCount} className={btnClass(page >= pageCount)}>
            <ChevronRight className="size-4" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
