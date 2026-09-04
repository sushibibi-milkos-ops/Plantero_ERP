'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, ArrowRight, Sparkles, ShoppingBag, ClipboardList, Landmark, Receipt, FlaskConical, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/empty-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { formatDateTime } from '@/lib/format';
import { approveQueueItemAction, rejectQueueItemAction } from '../actions';
import type { ApprovalQueueItem } from '../queries';

const KIND_META: Record<string, { label: string; icon: typeof Sparkles }> = {
  purchase_draft: { label: 'Satın alma taslağı', icon: ShoppingBag },
  count_variance: { label: 'Sayım farkı', icon: ClipboardList },
  dunning_message: { label: 'Tahsilat hatırlatma', icon: Receipt },
  reconciliation: { label: 'Mutabakat önerisi', icon: Landmark },
  recipe_release: { label: 'Reçete devri', icon: FlaskConical },
  price_change: { label: 'Fiyat değişikliği', icon: Tag },
};

function kindMeta(kind: string) {
  return KIND_META[kind] ?? { label: kind, icon: Sparkles };
}

export function ApprovalQueue({ items }: { items: ApprovalQueueItem[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [rejectTarget, setRejectTarget] = useState<ApprovalQueueItem | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => setSelected((s) => Math.min(s, Math.max(0, items.length - 1))), [items.length]);

  const current = items[selected] ?? null;

  const approve = useMemo(
    () => async (item: ApprovalQueueItem) => {
      setBusyId(item.id);
      const res = await approveQueueItemAction({ kind: item.kind, id: item.id });
      setBusyId(null);
      if (res.ok) toast.success(`${kindMeta(item.kind).label} onaylandı`);
      else toast.error(res.error);
    },
    [],
  );
  const reject = useMemo(
    () => async (item: ApprovalQueueItem, reasonText: string | null) => {
      setBusyId(item.id);
      const res = await rejectQueueItemAction({ kind: item.kind, id: item.id, reason: reasonText });
      setBusyId(null);
      if (res.ok) toast.success(`${kindMeta(item.kind).label} reddedildi`);
      else toast.error(res.error);
    },
    [],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (!items.length) return;
      if (e.key === 'j' || e.key === 'J') { e.preventDefault(); setSelected((s) => Math.min(items.length - 1, s + 1)); }
      else if (e.key === 'k' || e.key === 'K') { e.preventDefault(); setSelected((s) => Math.max(0, s - 1)); }
      else if (e.key === 'a' || e.key === 'A') { e.preventDefault(); if (current) void approve(current); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); if (current) void reject(current, null); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, current, approve, reject]);

  if (!items.length) {
    return <EmptyState icon={Sparkles} title="Onay bekleyen kayıt yok" description="Yeni bir taslak, sayım farkı ya da mutabakat önerisi oluştuğunda burada görünür." />;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Klavye: <kbd className="rounded border bg-muted px-1 py-px font-mono text-[10px]">J</kbd>/<kbd className="rounded border bg-muted px-1 py-px font-mono text-[10px]">K</kbd> gezin ·{' '}
        <kbd className="rounded border bg-muted px-1 py-px font-mono text-[10px]">A</kbd> onayla · <kbd className="rounded border bg-muted px-1 py-px font-mono text-[10px]">R</kbd> reddet
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item, i) => {
          const meta = kindMeta(item.kind);
          const Icon = meta.icon;
          const isSelected = i === selected;
          return (
            <div
              key={`${item.kind}:${item.id}`}
              onClick={() => setSelected(i)}
              className={cn(
                'flex cursor-default flex-col gap-3 rounded-xl border p-4 transition-colors',
                isSelected ? 'border-primary/60 ring-2 ring-primary/15' : 'border-border/60 hover:border-border',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    <Icon className="size-3.5 shrink-0 text-primary" /> {meta.label}
                  </div>
                  <div className="mt-1 truncate text-sm font-medium">{item.title}</div>
                </div>
                {item.confidence !== null ? (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary tabular-nums">%{Math.round(item.confidence * 100)}</span>
                ) : null}
              </div>

              {item.summary ? <p className="line-clamp-3 text-[13px] text-muted-foreground">{item.summary}</p> : null}

              <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                <span className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</span>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={busyId === item.id} onClick={() => { setRejectTarget(item); setReason(''); }}>
                    <XCircle className="size-3.5" /> Reddet
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href={item.href}>Detay <ArrowRight className="size-3.5" /></Link>
                  </Button>
                  <Button size="sm" disabled={busyId === item.id} onClick={() => approve(item)}>
                    <CheckCircle2 className="size-3.5" /> Onayla
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={rejectTarget !== null}
        onOpenChange={(v) => { if (!v) setRejectTarget(null); }}
        title={rejectTarget ? `${kindMeta(rejectTarget.kind).label} reddedilsin mi?` : ''}
        description={rejectTarget?.title}
        destructive
        confirmLabel="Reddet"
        onConfirm={async () => { if (rejectTarget) await reject(rejectTarget, reason.trim() || null); setRejectTarget(null); }}
      >
        <Textarea placeholder="Red gerekçesi (opsiyonel)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="text-[13px]" />
      </ConfirmDialog>
    </div>
  );
}
