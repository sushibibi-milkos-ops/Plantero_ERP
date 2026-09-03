'use client';

import { useMemo, useState, useTransition } from 'react';
import { DndContext, DragOverlay, useDraggable, useDroppable, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { toast } from 'sonner';
import Link from 'next/link';
import { GripVertical } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { QtyCell } from '@/components/qty-cell';
import { cn } from '@/lib/utils';
import { rescheduleWorkOrderAction } from '../actions';
import type { PlanningWorkOrderRow } from '../queries';
import type { LineOption } from '../queries';

const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function isoAddDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = DAY_LABELS[(d.getUTCDay() + 6) % 7];
  return `${dow} ${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function PlanningBoard({ lines, workOrders, startIso, days = 14 }: { lines: LineOption[]; workOrders: PlanningWorkOrderRow[]; startIso: string; days?: number }) {
  const [items, setItems] = useState(workOrders);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const dateCols = useMemo(() => Array.from({ length: days }, (_, i) => isoAddDays(startIso, i)), [startIso, days]);
  const byCell = useMemo(() => {
    const m = new Map<string, PlanningWorkOrderRow[]>();
    for (const wo of items) {
      const key = `${wo.lineId}:${wo.plannedStart ?? 'unscheduled'}`;
      (m.get(key) ?? m.set(key, []).get(key)!).push(wo);
    }
    return m;
  }, [items]);
  const active = items.find((w) => w.id === activeId) ?? null;

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const woId = e.active.id as string;
    const overId = e.over?.id as string | undefined;
    if (!overId) return;
    const [lineId, dateIso] = overId.split('::');
    if (!lineId || !dateIso) return;
    const wo = items.find((w) => w.id === woId);
    if (!wo || (wo.lineId === lineId && wo.plannedStart === dateIso)) return;

    setItems((prev) => prev.map((w) => (w.id === woId ? { ...w, lineId, plannedStart: dateIso } : w)));
    startTransition(async () => {
      const res = await rescheduleWorkOrderAction({ id: woId, lineId, plannedStart: dateIso });
      if (!res.ok) {
        toast.error(res.error);
        setItems((prev) => prev.map((w) => (w.id === woId ? wo : w)));
      }
    });
  }

  return (
    <DndContext sensors={sensors} onDragStart={(e) => setActiveId(e.active.id as string)} onDragEnd={handleDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="scrollbar-thin overflow-x-auto rounded-lg border border-border/70 bg-card">
        <div className="grid min-w-[1400px] grid-cols-[110px_repeat(14,1fr)]">
          <div className="sticky left-0 z-10 border-r border-b border-border/60 bg-muted/40 p-2 text-xs font-medium text-muted-foreground">Hat</div>
          {dateCols.map((d) => (
            <div key={d} className="border-b border-l border-border/60 bg-muted/40 p-2 text-center text-[11px] font-medium whitespace-nowrap text-muted-foreground">
              {fmtDay(d)}
            </div>
          ))}
          {lines.map((line) => (
            <PlanningLineRow key={line.id} line={line} dateCols={dateCols} byCell={byCell} />
          ))}
        </div>
      </div>
      <DragOverlay>{active ? <WoCard wo={active} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}

function PlanningLineRow({ line, dateCols, byCell }: { line: LineOption; dateCols: string[]; byCell: Map<string, PlanningWorkOrderRow[]> }) {
  return (
    <>
      <div className="sticky left-0 z-10 border-r border-b border-border/60 bg-card p-2">
        <div className="font-mono text-xs font-medium">{line.code}</div>
        <div className="truncate text-[11px] text-muted-foreground">{line.name}</div>
      </div>
      {dateCols.map((d) => (
        <PlanningCell key={d} lineId={line.id} dateIso={d} items={byCell.get(`${line.id}:${d}`) ?? []} />
      ))}
    </>
  );
}

function PlanningCell({ lineId, dateIso, items }: { lineId: string; dateIso: string; items: PlanningWorkOrderRow[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${lineId}::${dateIso}` });
  return (
    <div ref={setNodeRef} className={cn('min-h-24 space-y-1.5 border-b border-l border-border/60 p-1.5 transition-colors', isOver && 'bg-primary/5')}>
      {items.map((wo) => (
        <WoCard key={wo.id} wo={wo} />
      ))}
    </div>
  );
}

function WoCard({ wo, dragging }: { wo: PlanningWorkOrderRow; dragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: wo.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group rounded-md border border-border/70 bg-card p-1.5 text-[11px] shadow-[0_1px_2px_rgb(0_0_0/0.03)]',
        (isDragging || dragging) && 'opacity-90 shadow-lg ring-2 ring-primary/30',
      )}
    >
      <div className="flex items-center gap-1">
        <button type="button" {...attributes} {...listeners} className="cursor-grab touch-none text-muted-foreground/50 hover:text-foreground active:cursor-grabbing" aria-label="Taşı">
          <GripVertical className="size-3" />
        </button>
        <Link href={`/uretim/is-emirleri/${wo.id}`} className="truncate font-mono text-[10px] text-muted-foreground hover:text-foreground" onClick={(e) => e.stopPropagation()}>
          {wo.docNo}
        </Link>
      </div>
      <div className="mt-0.5 truncate font-medium">{wo.productName}</div>
      <div className="mt-0.5 flex items-center justify-between gap-1">
        <QtyCell value={wo.plannedQty} className="text-[10px]" />
        <StatusBadge status={wo.status} kind="work_order" dot={false} className="h-4 px-1 text-[9px]" />
      </div>
    </div>
  );
}
