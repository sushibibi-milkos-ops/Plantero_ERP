'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Sparkles, CheckCircle2, XCircle, ArrowRight, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { MoneyCell } from '@/components/money-cell';
import { formatDateTime } from '@/lib/format';
import { approvePurchaseOrderAction, rejectPurchaseOrderAction } from '../actions';
import type { ApprovalQueueRow } from '../queries';

/**
 * Onay kuyruğu — kart ızgarası + klavye kısayolları (docs/modules/tedarik.md §2: "Onayla / Düzenle /
 * Reddet, klavye kısayolları animasyonsuz"). Seçili kart `j`/`k` (veya ↓/↑) ile gezilir; `a` onaylar,
 * `r` reddeder, `e`/`Enter` düzenlemeye (sipariş detayına) götürür. Seçim halkası (`ring`) anlık
 * uygulanır — geçiş/animasyon YOK (kısayol tepkisi gecikmeli hissettirmemeli, bkz. `.claude/skills/animate`).
 */
export function ApprovalQueueList({ items }: { items: ApprovalQueueRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (selected >= items.length) setSelected(Math.max(0, items.length - 1));
  }, [items.length, selected]);

  const approve = useCallback(async (orderId: string) => {
    setBusyId(orderId);
    const res = await approvePurchaseOrderAction({ id: orderId });
    setBusyId(null);
    if (res.ok) {
      toast.success('Taslak onaylandı');
      startTransition(() => router.refresh());
    } else toast.error(res.error);
  }, [router, startTransition]);

  const reject = useCallback(async (orderId: string) => {
    setBusyId(orderId);
    const res = await rejectPurchaseOrderAction({ id: orderId, reason: null });
    setBusyId(null);
    if (res.ok) {
      toast.success('Taslak reddedildi');
      startTransition(() => router.refresh());
    } else toast.error(res.error);
  }, [router, startTransition]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (!items.length) return;
      const current = items[selected];
      if (!current) return;
      if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown') { e.preventDefault(); setSelected((i) => Math.min(i + 1, items.length - 1)); }
      else if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp') { e.preventDefault(); setSelected((i) => Math.max(i - 1, 0)); }
      else if (e.key === 'a' || e.key === 'A') { e.preventDefault(); void approve(current.orderId); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); void reject(current.orderId); }
      else if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') { e.preventDefault(); router.push(`/satin-alma/siparisler/${current.orderId}`); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [items, selected, approve, reject, router]);

  if (!items.length) {
    return <EmptyState icon={Sparkles} title="Onay bekleyen taslak yok" description="Kritik stok motoru yeni bir taslak önerdiğinde burada görünür." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
        <Keyboard className="size-3.5" />
        <span className="flex items-center gap-1"><kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">j</kbd>/<kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">k</kbd> gezin</span>
        <span className="flex items-center gap-1"><kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">a</kbd> onayla</span>
        <span className="flex items-center gap-1"><kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">r</kbd> reddet</span>
        <span className="flex items-center gap-1"><kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">e</kbd> düzenle</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item, i) => (
          <div
            key={item.approvalId}
            onClick={() => setSelected(i)}
            className={`flex flex-col gap-3 rounded-xl border p-4 ${i === selected ? 'border-primary ring-1 ring-primary' : 'border-border/60'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5 shrink-0 text-primary" />
                  <Link href={`/satin-alma/siparisler/${item.orderId}`} className="truncate font-mono text-sm font-medium hover:underline">{item.docNo}</Link>
                </div>
                <div className="mt-0.5 truncate text-sm text-muted-foreground">{item.partnerName} · {item.lineCount} kalem</div>
              </div>
              <MoneyCell value={item.grandTotal} className="shrink-0 text-base font-semibold" />
            </div>

            {item.aiRationale ? <p className="line-clamp-3 text-[13px] text-muted-foreground">{item.aiRationale}</p> : null}

            <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
              <span className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}{item.aiConfidence ? ` · %${Math.round(Number(item.aiConfidence) * 100)} güven` : ''}</span>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={busyId === item.orderId} onClick={() => reject(item.orderId)}>
                  <XCircle className="size-3.5" /> Reddet
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/satin-alma/siparisler/${item.orderId}`}>Düzenle <ArrowRight className="size-3.5" /></Link>
                </Button>
                <Button size="sm" disabled={busyId === item.orderId} onClick={() => approve(item.orderId)}>
                  <CheckCircle2 className="size-3.5" /> Onayla
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
