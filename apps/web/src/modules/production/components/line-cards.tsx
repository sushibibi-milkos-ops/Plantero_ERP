import Link from 'next/link';
import { Gauge, Factory } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { QtyCell } from '@/components/qty-cell';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { formatQty } from '@/lib/format';
import { D } from '@plantero/core';
import type { LineCardRow } from '../queries';

const STATUS_TONE: Record<'running' | 'idle', { label: string; className: string }> = {
  running: { label: 'Çalışıyor', className: 'bg-success/12 text-success' },
  idle: { label: 'Boşta', className: 'bg-muted text-muted-foreground' },
};

export function LineCards({ lines }: { lines: LineCardRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {lines.map((line) => {
        const running = Boolean(line.activeWorkOrder && line.activeWorkOrder.status === 'in_progress');
        const paused = Boolean(line.activeWorkOrder && line.activeWorkOrder.status === 'paused');
        const tone = paused ? { label: 'Duraklatıldı', className: 'bg-warning/15 text-[oklch(0.5_0.14_70)] dark:text-warning' } : STATUS_TONE[running ? 'running' : 'idle'];
        const producedPct = line.activeWorkOrder ? Math.min(100, D(line.activeWorkOrder.producedQty).div(D(line.activeWorkOrder.plannedQty).eq(0) ? 1 : line.activeWorkOrder.plannedQty).mul(100).toNumber()) : 0;

        return (
          <div key={line.id} className="flex flex-col gap-4 rounded-xl border border-border/70 bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{line.code}</div>
                <div className="text-base font-semibold">{line.name}</div>
              </div>
              <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium', tone.className)}>
                <span aria-hidden className={cn('size-1.5 rounded-full', running ? 'bg-success' : paused ? 'bg-warning' : 'bg-muted-foreground/50')} />
                {tone.label}
              </span>
            </div>

            {line.activeWorkOrder ? (
              <Link href={`/uretim/is-emirleri/${line.activeWorkOrder.id}`} className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3 hover:border-border" data-pressable>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{line.activeWorkOrder.docNo}</span>
                  <StatusBadge status={line.activeWorkOrder.status} kind="work_order" size="sm" />
                </div>
                <div className="truncate text-sm font-medium">{line.activeWorkOrder.productName}</div>
                <Progress value={producedPct} className="h-1.5" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <QtyCell value={line.activeWorkOrder.producedQty} />
                  <QtyCell value={line.activeWorkOrder.plannedQty} />
                </div>
              </Link>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 py-6 text-center">
                <Factory className="size-5 text-muted-foreground/60" strokeWidth={1.5} />
                <span className="text-xs text-muted-foreground">Aktif iş emri yok</span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-center">
              <Metric label="Bugün üretim" value={<QtyCell value={line.todayProducedQty} className="justify-center text-sm font-semibold" />} />
              <Metric label="OEE" value={<span className="num text-sm font-semibold">%{line.oee.oeePct.toFixed(0)}</span>} icon={<Gauge className="size-3" />} />
              <Metric label="Kapasite" value={<span className="num text-sm font-semibold">{line.capacityPerHour ? `${formatQty(line.capacityPerHour, undefined, { maxDigits: 0 })}/sa` : '—'}</span>} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-center gap-1 text-[10px] tracking-wide text-muted-foreground uppercase">
        {icon}
        {label}
      </div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
