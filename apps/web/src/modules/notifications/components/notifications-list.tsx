'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { BellOff, Circle, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { relativeTime } from '@/lib/format';
import { markNotificationReadAction, markAllNotificationsReadAction } from '../actions';
import type { NotificationRow } from '../queries';

export function NotificationsList({ notifications }: { notifications: NotificationRow[] }) {
  const [items, setItems] = useState(notifications);
  const [pending, startTransition] = useTransition();

  const unreadCount = items.filter((n) => n.status === 'sent').length;

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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{unreadCount > 0 ? `${unreadCount} okunmamış` : 'Tümü okundu'}</span>
        <Button size="sm" variant="ghost" disabled={pending || unreadCount === 0} onClick={markAll}>
          <CheckCheck className="size-3.5" /> Tümünü okundu işaretle
        </Button>
      </div>
      <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
        {items.map((n) => {
          const unread = n.status === 'sent';
          const content = (
            <div className={cn('flex items-start gap-3 px-4 py-3', unread && 'bg-primary/[0.03]')}>
              <span aria-hidden className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', unread ? 'bg-primary' : 'bg-transparent')}>
                {!unread ? <Circle className="size-1.5 opacity-0" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <div className={cn('text-sm', unread ? 'font-medium' : 'text-muted-foreground')}>{n.title}</div>
                <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{n.body}</p>
                <div className="mt-1 text-[11px] text-muted-foreground">{relativeTime(n.createdAt)}</div>
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
    </div>
  );
}
