import Link from 'next/link';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import { relativeTime } from '@/lib/format';
import type { RecentBreakdownRow } from '../queries';

/**
 * "Arıza Bildir" formunun yanında masaüstü yan panel (bakim-yeni-02): son bildirilen 5 arıza.
 * Sahadaki telefon akışını değiştirmez — yalnızca `lg:` üzerinde görünür (report-breakdown-form.tsx
 * zaten tek sütun/telefon odaklı kalır), geniş ekranda boş kalan alanı dolu bir bağlamla doldurur.
 */
export function RecentBreakdownsPanel({ items }: { items: RecentBreakdownRow[] }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <h2 className="mb-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Son bildirilen arızalar</h2>
      {items.length === 0 ? (
        <EmptyState compact title="Henüz arıza bildirilmemiş" />
      ) : (
        <ul className="space-y-3">
          {items.map((o) => (
            <li key={o.id}>
              <Link href={`/bakim/is-emirleri/${o.id}`} className="block rounded-md -mx-2 px-2 py-1.5 hover:bg-accent">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-[13px] font-medium">{o.title}</span>
                  <StatusBadge status={o.status} kind="maintenance" size="sm" className="shrink-0" />
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">{o.machineCode} — {o.machineName}</span>
                  <span className="shrink-0">{relativeTime(o.reportedAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
