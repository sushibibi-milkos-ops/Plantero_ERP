'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { DndContext, DragOverlay, useDraggable, useDroppable, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { toast } from 'sonner';
import Link from 'next/link';
import { GripVertical } from 'lucide-react';
// Not: '@plantero/core' barrel'ı sunucu-özel kod (node:crypto) içerir — istemci bileşeninde
// yalnızca gösterim amaçlı hesaplama için doğrudan 'decimal.js' kullanılır (bkz. operator-work-order.tsx).
import Decimal from 'decimal.js';
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

function dowMonFirst(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7; // 0=Pzt … 6=Paz
}

function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAY_LABELS[dowMonFirst(iso)]} ${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function dailyCapacityOf(line: LineOption): Decimal | null {
  if (!line.capacityPerHour) return null;
  return new Decimal(line.capacityPerHour).mul(line.shiftMinutes).div(60);
}

export function PlanningBoard({
  lines,
  workOrders,
  startIso,
  todayIso,
  days = 7,
}: {
  lines: LineOption[];
  workOrders: PlanningWorkOrderRow[];
  startIso: string;
  /** Europe/Istanbul takvim günü (`YYYY-MM-DD`) — bugünün sütununu işaretlemek ve mount'ta ona kaydırmak için */
  todayIso: string;
  days?: number;
}) {
  const [items, setItems] = useState(workOrders);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const dayHeaderRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

  type MobileSegment =
    | { kind: 'day'; date: string; items: Array<{ wo: PlanningWorkOrderRow; line: LineOption }> }
    | { kind: 'empty'; from: string; to: string };

  const mobileSegments = useMemo<MobileSegment[]>(() => {
    const segments: MobileSegment[] = [];
    let emptyStart: string | null = null;
    const flushEmpty = (toDate: string) => {
      if (emptyStart !== null) {
        segments.push({ kind: 'empty', from: emptyStart, to: toDate });
        emptyStart = null;
      }
    };
    dateCols.forEach((d, i) => {
      const dayItems = lines.flatMap((line) => (byCell.get(`${line.id}:${d}`) ?? []).map((wo) => ({ wo, line })));
      if (dayItems.length === 0 && d !== todayIso) {
        if (emptyStart === null) emptyStart = d;
      } else {
        if (emptyStart !== null) flushEmpty(dateCols[i - 1]!);
        segments.push({ kind: 'day', date: d, items: dayItems });
      }
    });
    if (emptyStart !== null) flushEmpty(dateCols[dateCols.length - 1]!);
    return segments;
  }, [dateCols, lines, byCell, todayIso]);

  // Bugünün sütununu görünüre kaydır — 390px mobilde (desktop grid) bugün 4. sütunda başlayıp
  // kenarda kalabiliyordu, iki iş emri de kaydırma dışında kalıyordu.
  useEffect(() => {
    dayHeaderRefs.current[todayIso]?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [todayIso, startIso]);

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

  // 14 günlük görünümde 84px min sütun genişliği (110+14×84+92=1378px) 1440px masaüstünde içerik
  // alanına (~1096px) hiçbir zaman sığmıyordu (Tur 2 bulgusu) — 7 gün ve altında ferah 84px, 8+
  // günde dar 60px (110+14×60+92=1042px ≤ 1096px).
  const dayColWidth = dateCols.length > 7 ? 60 : 84;
  const gridTemplate = `110px repeat(${dateCols.length}, minmax(${dayColWidth}px, 1fr)) 92px`;

  return (
    <DndContext sensors={sensors} onDragStart={(e) => setActiveId(e.active.id as string)} onDragEnd={handleDragEnd} onDragCancel={() => setActiveId(null)}>
      {/* Masaüstü ızgara. scroll-fade-x: kaydırılabilir olduğuna dair kenar ipucu. */}
      <div className="scroll-fade-x scrollbar-thin hidden overflow-x-auto rounded-lg border border-border/70 bg-card md:block">
        <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
          <div className="sticky left-0 z-10 border-r border-b border-border/60 bg-muted/40 p-2 text-xs font-medium text-muted-foreground">Hat</div>
          {dateCols.map((d) => {
            const isToday = d === todayIso;
            const isWeekend = dowMonFirst(d) >= 5;
            return (
              <div
                key={d}
                ref={(el) => {
                  dayHeaderRefs.current[d] = el;
                }}
                className={cn(
                  'border-b border-border/60 p-2 text-center text-[11px] font-medium whitespace-nowrap text-muted-foreground',
                  isWeekend && !isToday && 'bg-muted/25',
                  isToday && 'border-t-2 border-t-primary bg-primary/[0.04] font-semibold text-foreground',
                )}
              >
                {fmtDay(d)}
              </div>
            );
          })}
          <div className="border-b border-border/60 bg-muted/40 p-2 text-right text-[11px] font-medium text-muted-foreground">Toplam</div>

          {lines.map((line) => (
            <PlanningLineRow key={line.id} line={line} dateCols={dateCols} byCell={byCell} todayIso={todayIso} />
          ))}
        </div>
      </div>

      {/* Mobil: ızgara yerine bugünden başlayan gün listesi (yatay kaydırmayı tamamen ortadan
          kaldırır — 390px'te 110px + 14×92px'lik bir ızgara asla sığmaz). Sürükle-bırak yalnızca
          masaüstü ızgarada; burada kartlar salt okunur, iş emri detayına bağlanır. Ardışık boş
          günler (bugün hariç) tek satırda birleşir — aksi halde 14 günün 12'si aynı "Planlanan yok"
          çerçevesini tekrarlayıp sayfanın ~%87'sini bilgisiz boşluğa çeviriyordu (Tur 2 bulgusu). */}
      <div className="space-y-2 md:hidden">
        {mobileSegments.map((seg) =>
          seg.kind === 'empty' ? (
            <div key={`empty-${seg.from}`} className="flex h-[34px] items-center gap-1.5 rounded-md border border-border/40 px-2.5 text-[12px] text-muted-foreground/70">
              <span>{seg.from === seg.to ? fmtDay(seg.from) : `${fmtDay(seg.from)} – ${fmtDay(seg.to)}`}</span>
              <span aria-hidden>·</span>
              <span>planlanan yok</span>
            </div>
          ) : (
            <div key={seg.date} className={cn('rounded-lg border border-border/60 p-2.5', seg.date === todayIso && 'border-primary/40 bg-primary/[0.04]')}>
              <div className="mb-2 flex items-center gap-2 px-0.5">
                <span className={cn('text-[12px] font-medium text-muted-foreground', seg.date === todayIso && 'text-primary')}>{fmtDay(seg.date)}</span>
                {seg.date === todayIso ? <span className="rounded-full bg-primary/10 px-1.5 py-px text-[11px] font-medium text-primary">Bugün</span> : null}
                <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">{seg.items.length ? `${seg.items.length} iş emri` : ''}</span>
              </div>
              {seg.items.length === 0 ? (
                <div className="px-0.5 py-1.5 text-xs text-muted-foreground/60">Planlanan yok</div>
              ) : (
                <div className="space-y-1.5">
                  {seg.items.map(({ wo, line }) => (
                    <MobileWoCard key={wo.id} wo={wo} lineCode={line.code} />
                  ))}
                </div>
              )}
            </div>
          ),
        )}
      </div>

      <DragOverlay>{active ? <WoCard wo={active} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}

function PlanningLineRow({
  line,
  dateCols,
  byCell,
  todayIso,
}: {
  line: LineOption;
  dateCols: string[];
  byCell: Map<string, PlanningWorkOrderRow[]>;
  todayIso: string;
}) {
  const dailyCapacity = dailyCapacityOf(line);
  const rowTotal = dateCols.reduce((acc, d) => {
    const cellQty = (byCell.get(`${line.id}:${d}`) ?? []).reduce((a, w) => a.plus(new Decimal(w.plannedQty)), new Decimal(0));
    return acc.plus(cellQty);
  }, new Decimal(0));

  return (
    <>
      <div className="sticky left-0 z-10 border-r border-b border-border/60 bg-card p-2">
        <div className="font-mono text-xs font-medium">{line.code}</div>
        <div className="truncate text-[11px] text-muted-foreground">{line.name}</div>
      </div>
      {dateCols.map((d) => (
        <PlanningCell key={d} lineId={line.id} dateIso={d} items={byCell.get(`${line.id}:${d}`) ?? []} isToday={d === todayIso} isWeekend={dowMonFirst(d) >= 5} dailyCapacity={dailyCapacity} />
      ))}
      <div className="flex items-center justify-end border-b border-border/60 bg-muted/10 px-2">
        <QtyCell value={rowTotal.toFixed(4)} className="text-xs font-medium" />
      </div>
    </>
  );
}

function PlanningCell({
  lineId,
  dateIso,
  items,
  isToday,
  isWeekend,
  dailyCapacity,
}: {
  lineId: string;
  dateIso: string;
  items: PlanningWorkOrderRow[];
  isToday: boolean;
  isWeekend: boolean;
  dailyCapacity: Decimal | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${lineId}::${dateIso}` });
  const cellQty = items.reduce((a, w) => a.plus(new Decimal(w.plannedQty)), new Decimal(0));
  const fillPct = dailyCapacity && dailyCapacity.gt(0) && items.length > 0 ? Math.round(cellQty.div(dailyCapacity).mul(100).toNumber()) : null;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative min-h-16 space-y-1.5 border-b border-border/40 p-1.5 pb-4 transition-colors',
        isWeekend && !isToday && 'bg-muted/25',
        isToday && 'bg-primary/[0.03]',
        isOver && 'bg-primary/8',
      )}
    >
      {items.map((wo) => (
        <WoCard key={wo.id} wo={wo} />
      ))}
      {/* text-[11px] text-muted-foreground/70: 9px %50 opaklık okunabilirlik tabanının (11px) altındaydı
          (Tur 2 bulgusu) — pratikte görünmezdi. */}
      {fillPct !== null ? <span className="pointer-events-none absolute right-1.5 bottom-1 font-mono text-[11px] text-muted-foreground/70">%{fillPct}</span> : null}
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
        {/* Tam iş emri no yerine son 3 hane: dar sütunlarda (60-84px) "WO-2026-000008" → "WO-202…"
            elipsleniyordu (Tur 2 bulgusu) — tam numara title tooltip'te kalır. */}
        <Link href={`/uretim/is-emirleri/${wo.id}`} title={wo.docNo} className="truncate font-mono text-[11px] text-muted-foreground hover:text-foreground" onClick={(e) => e.stopPropagation()}>
          #{wo.docNo.slice(-3)}
        </Link>
      </div>
      <div className="mt-0.5 truncate font-medium" title={wo.productName}>{wo.productName}</div>
      <div className="mt-0.5 flex items-center justify-between gap-1">
        <QtyCell value={wo.plannedQty} className="text-[10px]" />
        {/* text-[11px]: 9px okunabilirlik tabanının (Linear'da 11px) altındaydı (Tur 2 bulgusu). */}
        <StatusBadge status={wo.status} kind="work_order" dot={false} className="h-4 px-1 text-[11px]" />
      </div>
    </div>
  );
}

/** Mobil gün listesi kartı — sürüklenemez (masaüstü ızgaranın aksine), hat rozeti taşır. */
function MobileWoCard({ wo, lineCode }: { wo: PlanningWorkOrderRow; lineCode: string }) {
  return (
    <Link href={`/uretim/is-emirleri/${wo.id}`} data-pressable className="flex items-center gap-2 rounded-md border border-border/60 bg-card px-2.5 py-2 text-[13px] active:bg-accent/50">
      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{lineCode}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{wo.productName}</div>
        <div className="font-mono text-[10px] text-muted-foreground">{wo.docNo}</div>
      </div>
      <QtyCell value={wo.plannedQty} className="shrink-0 text-xs" />
      <StatusBadge status={wo.status} kind="work_order" dot={false} className="h-4 shrink-0 px-1 text-[9px]" />
    </Link>
  );
}
