'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { toast } from 'sonner';
import { LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { moveOpportunityAction } from '../actions';
import { OpportunityCard } from './opportunity-card';
import { OpportunityDrawer } from './opportunity-drawer';
import { OpportunitiesListView } from './opportunities-list-view';
import type { OpportunityCardRow } from '../queries';
import type { opportunityStages } from '@plantero/db';
/** Sunucu bileşeninden istemciye yalnızca serileştirilebilir alanlar geçirilir (Decimal aktarılamaz). */
export type FunnelSummary = { stages: Array<{ stageId: string; name: string; count: number }>; winRate: number | null };

type Stage = typeof opportunityStages.$inferSelect;

function Column({ stage, cards, onOpen }: { stage: Stage; cards: OpportunityCardRow[]; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = cards.reduce((sum, c) => sum + Number(c.expectedAmount), 0);

  return (
    <div ref={setNodeRef} className={cn('flex w-72 shrink-0 flex-col rounded-xl border border-border/60 bg-muted/30 transition-colors', isOver && 'border-primary/50 bg-primary/5')}>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[13px] font-medium">
          {stage.name}
          <span className="rounded-full bg-muted px-1.5 py-px text-[11px] text-muted-foreground">{cards.length}</span>
        </div>
        <span className="text-[11px] text-muted-foreground">{formatMoney(total, 'TRY', { digits: 0, compact: true })}</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2" style={{ maxHeight: 'calc(100vh - 260px)' }}>
        {cards.map((c) => (
          <OpportunityCard key={c.id} row={c} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

export function KanbanBoard({ stages, cards, funnel }: { stages: Stage[]; cards: OpportunityCardRow[]; funnel: FunnelSummary }) {
  const router = useRouter();
  const [rows, setRows] = useState(cards);
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byStage = useMemo(() => {
    const map = new Map<string, OpportunityCardRow[]>();
    for (const s of stages) map.set(s.id, []);
    for (const r of rows) map.get(r.stageId)?.push(r);
    return map;
  }, [rows, stages]);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const targetStageId = String(over.id);
    const card = rows.find((r) => r.id === active.id);
    if (!card || card.stageId === targetStageId) return;
    const prev = rows;
    setRows((cur) => cur.map((r) => (r.id === card.id ? { ...r, stageId: targetStageId } : r)));
    moveOpportunityAction({ id: card.id, stageId: targetStageId }).then((res) => {
      if (!res.ok) {
        setRows(prev);
        toast.error(res.error);
      } else {
        router.refresh();
      }
    });
  }

  if (stages.length === 0) {
    return <EmptyState title="Fırsat aşaması tanımlı değil" description="Satış seed'i çalıştırılmalı." />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-4 text-[13px]">
          {funnel.stages.map((s) => (
            <div key={s.stageId} className="flex items-baseline gap-1.5">
              <span className="text-muted-foreground">{s.name}</span>
              <span className="font-mono font-medium tabular-nums">{s.count}</span>
            </div>
          ))}
          {funnel.winRate !== null ? (
            <div className="flex items-baseline gap-1.5 border-l border-border/60 pl-4">
              <span className="text-muted-foreground">Kazanma oranı</span>
              <span className="font-mono font-medium tabular-nums text-success">%{funnel.winRate.toFixed(0)}</span>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border/70 p-0.5">
          <Button variant={view === 'kanban' ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => setView('kanban')} aria-label="Kanban görünümü"><LayoutGrid className="size-3.5" /></Button>
          <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => setView('list')} aria-label="Liste görünümü"><List className="size-3.5" /></Button>
        </div>
      </div>

      {view === 'kanban' ? (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-2">
            {stages.map((s) => (
              <Column key={s.id} stage={s} cards={byStage.get(s.id) ?? []} onOpen={setOpenId} />
            ))}
          </div>
        </DndContext>
      ) : (
        <OpportunitiesListView rows={rows} stages={stages} onOpen={setOpenId} />
      )}

      <OpportunityDrawer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
