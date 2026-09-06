'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Camera, CheckCircle2, Play, XCircle, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { StatusBadge } from '@/components/status-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { getStatusInfo } from '@/lib/status';
import { relativeTime } from '@/lib/format';
import { startOrderAction, cancelOrderAction } from '../actions';
import type { MaintenanceOrderRow } from '../queries';

const COLUMNS: MaintenanceOrderRow['status'][] = ['reported', 'planned', 'in_progress', 'waiting_parts', 'done'];

const DOT_CLASS: Record<string, string> = {
  neutral: 'bg-foreground/50', muted: 'bg-muted-foreground/60', info: 'bg-info', success: 'bg-success', warning: 'bg-warning', danger: 'bg-destructive', primary: 'bg-primary',
};

function Card({ order, onOpen, onStart, onCancel }: { order: MaintenanceOrderRow; onOpen: () => void; onStart: () => void; onCancel: () => void }) {
  const open = !['done', 'cancelled'].includes(order.status);
  return (
    // Kriter 8 (Tur 1 P1 bakim-isemirleri-03) kök neden düzeltmesi: eskiden salt bir `div onClick` —
    // tabIndex/role yoktu, klavyeyle sekmelenemiyor, Enter çalışmıyor, odak halkası görünmüyordu.
    // Aynı modülün DataTable satırları (`rowHref`) klavyeyle erişilebilirken kart erişilemiyordu.
    // `role="link"` + `tabIndex=0` + Enter/Space aktivasyonu + görünür `focus-visible` halkası
    // eklendi (kart iç içe bir `<button>` — dropdown tetikleyicisi — barındırdığından gerçek bir
    // `<a>`/`<Link>` içine alınmadı; dropdown'ın `stopPropagation`'ı korunur).
    <div
      onClick={onOpen}
      onKeyDown={(e) => {
        // e.target === e.currentTarget: yalnızca kartın KENDİSİ odaktayken Enter/Space açar — iç içe
        // aksiyon menüsü (dropdown tetikleyici/öge) React'ın sentetik olay sistemi Portal'a rağmen
        // JSX ağacından yukarı kabarcıklandığından, bu koruma olmadan menüde Enter'a basmak HEM
        // menü ögesini seçer HEM kartı açardı (çift/çakışan eylem).
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          onOpen();
        }
      }}
      role="link"
      tabIndex={0}
      aria-label={`${order.docNo} — ${order.title}`}
      className="cursor-pointer space-y-2 rounded-lg border border-border/70 bg-card p-3 outline-none hover:border-border focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[11px] text-muted-foreground">{order.docNo}</div>
          <div className="truncate text-[13px] font-medium">{order.title}</div>
        </div>
        {open ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" className="shrink-0 text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {['reported', 'planned', 'waiting_parts'].includes(order.status) ? (
                <DropdownMenuItem onSelect={onStart}><Play className="size-4" /> İşleme al</DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={onOpen}><CheckCircle2 className="size-4" /> Tamamla</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onCancel}><XCircle className="size-4" /> İptal et</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{order.machineCode} — {order.machineName}</span>
        {order.photoCount > 0 ? <span className="inline-flex items-center gap-0.5"><Camera className="size-3" />{order.photoCount}</span> : null}
      </div>
      <div className="flex items-center justify-between">
        <StatusBadge status={order.kind} kind="maintenance_kind" size="sm" />
        <span className="text-[11px] text-muted-foreground">{relativeTime(order.reportedAt)}</span>
      </div>
    </div>
  );
}

export function OrdersBoard({ orders }: { orders: MaintenanceOrderRow[] }) {
  const router = useRouter();
  const [cancelTarget, setCancelTarget] = useState<MaintenanceOrderRow | null>(null);

  const byStatus = useMemo(() => {
    const map = new Map<string, MaintenanceOrderRow[]>();
    for (const o of orders) map.set(o.status, [...(map.get(o.status) ?? []), o]);
    return map;
  }, [orders]);

  async function start(row: MaintenanceOrderRow) {
    const res = await startOrderAction({ id: row.id });
    if (res.ok) {
      toast.success(`İş emri işleme alındı: ${row.docNo}`);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <>
      <div className="scrollbar-thin scroll-fade-x flex snap-x snap-mandatory items-start gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((status) => {
          const cards = byStatus.get(status) ?? [];
          const info = getStatusInfo(status, 'maintenance');
          return (
            <div key={status} className="flex w-72 shrink-0 snap-start flex-col rounded-xl border border-border/60 bg-muted/30">
              <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium">
                  <span className={`size-1.5 rounded-full ${DOT_CLASS[info.tone] ?? DOT_CLASS.neutral}`} />
                  {info.label}
                </span>
                <span className="rounded-full bg-muted px-1.5 py-px text-[11px] text-muted-foreground">{cards.length}</span>
              </div>
              <div className="min-h-0 space-y-2 overflow-y-auto px-2 pb-2" style={{ maxHeight: 'min(560px, calc(100dvh - 20rem))' }}>
                {cards.map((o) => (
                  <Card key={o.id} order={o} onOpen={() => router.push(`/bakim/is-emirleri/${o.id}`)} onStart={() => start(o)} onCancel={() => setCancelTarget(o)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(v) => !v && setCancelTarget(null)}
        title={`İş emrini iptal et — ${cancelTarget?.docNo}`}
        description="Açık duruş varsa kapatılır, başka açık iş emri kalmadıysa makine boşta durumuna döner."
        destructive
        confirmLabel="İptal et"
        onConfirm={async () => {
          if (!cancelTarget) return;
          const res = await cancelOrderAction({ id: cancelTarget.id });
          if (res.ok) {
            toast.success('İş emri iptal edildi');
            router.refresh();
          }
          return res;
        }}
      />
    </>
  );
}
