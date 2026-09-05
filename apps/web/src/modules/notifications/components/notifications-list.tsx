'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Bell, BellOff, CheckCheck, Clock4, PackageSearch, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { relativeTime } from '@/lib/format';
import { markNotificationReadAction, markAllNotificationsReadAction } from '../actions';
import type { NotificationRow } from '../queries';

/** `notifications.ref_table` → tür ikonu + Türkçe etiket (Tur 1 P1 bildirimler-03 — satırlarda tür
 *  göstergesi yoktu, SKT/kritik-stok/geri-çağırma birbirinden ayırt edilemiyordu). Bugün üretilen
 *  bütün sistem bildirimlerinin `refTable` değerleri (bkz. `notifications/systemAlerts.ts`,
 *  `quality/recall.ts`, `apps/worker/src/jobs/replenishmentEngine.ts`) burada karşılık bulur. */
const TYPE_META: Record<string, { label: string; icon: typeof Bell }> = {
  expiry_digest: { label: 'SKT uyarısı', icon: Clock4 },
  recalls: { label: 'Geri çağırma', icon: Undo2 },
  replenishment_runs: { label: 'Kritik stok', icon: PackageSearch },
};

function typeMeta(refTable: string | null) {
  return (refTable ? TYPE_META[refTable] : undefined) ?? { label: 'Bildirim', icon: Bell };
}

export function NotificationsList({ notifications }: { notifications: NotificationRow[] }) {
  const [items, setItems] = useState(notifications);
  const [filter, setFilter] = useState<'unread' | 'all'>('all');
  const [pending, startTransition] = useTransition();

  const unreadCount = items.filter((n) => n.status === 'sent').length;
  const visible = useMemo(() => (filter === 'unread' ? items.filter((n) => n.status === 'sent') : items), [items, filter]);

  function markRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, status: 'read' } : n)));
    startTransition(async () => {
      const res = await markNotificationReadAction({ id });
      if (!res.ok) toast.error(res.error);
    });
  }

  function markAll() {
    setItems((prev) => prev.map((n) => (n.status === 'sent' ? { ...n, status: 'read' } : n)));
    startTransition(async () => {
      const res = await markAllNotificationsReadAction();
      if (res.ok) toast.success('Tümü okundu olarak işaretlendi');
      else toast.error(res.error);
    });
  }

  if (!items.length) {
    return <EmptyState icon={BellOff} title="Henüz bildiriminiz yok" description="Yeni bir bildirim geldiğinde burada görünür." />;
  }

  return (
    <div className="max-w-3xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Bildirim filtresi" className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            onClick={() => setFilter('all')}
            className={cn('h-8 rounded-md px-3 text-[13px] font-medium transition-colors', filter === 'all' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
          >
            Tümü <span className="tabular-nums text-muted-foreground">({items.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'unread'}
            onClick={() => setFilter('unread')}
            className={cn('h-8 rounded-md px-3 text-[13px] font-medium transition-colors', filter === 'unread' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
          >
            Okunmamış <span className="tabular-nums text-muted-foreground">({unreadCount})</span>
          </button>
        </div>
        <Button variant="ghost" disabled={pending || unreadCount === 0} onClick={markAll}>
          <CheckCheck className="size-3.5" /> Tümünü okundu işaretle
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState compact icon={CheckCheck} title="Okunmamış bildirim yok" description="Tüm bildirimler okundu." />
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
          {visible.map((n) => {
            const unread = n.status === 'sent';
            const meta = typeMeta(n.refTable);
            const Icon = meta.icon;
            const content = (
              <div className={cn('flex items-start gap-3 px-4 py-3', unread && 'bg-primary/[0.03]')}>
                <span aria-hidden className={cn('mt-2 size-1.5 shrink-0 rounded-full', unread ? 'bg-primary' : 'bg-transparent')} />
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className={cn('text-sm', unread ? 'font-medium' : 'text-muted-foreground')}>{n.title}</div>
                    <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{relativeTime(n.createdAt)}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{meta.label}</div>
                  <p className="mt-1 line-clamp-2 max-w-[65ch] text-[13px] text-muted-foreground">{n.body}</p>
                </div>
              </div>
            );
            return (
              <li key={n.id}>
                {n.href ? (
                  <Link href={n.href} onClick={() => unread && markRead(n.id)} className="block hover:bg-accent/40">
                    {content}
                  </Link>
                ) : (
                  <button type="button" onClick={() => unread && markRead(n.id)} className="block w-full text-left hover:bg-accent/40">
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
