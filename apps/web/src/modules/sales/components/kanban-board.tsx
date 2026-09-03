'use client';

import { useMemo, useRef, useState } from 'react';
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
import { OpportunitiesListView, OpportunitiesMobileGroupedList } from './opportunities-list-view';
import type { OpportunityCardRow } from '../queries';
import type { opportunityStages } from '@plantero/db';
/** Sunucu bileşeninden istemciye yalnızca serileştirilebilir alanlar geçirilir (Decimal aktarılamaz). */
export type FunnelSummary = { stages: Array<{ stageId: string; name: string; count: number }>; winRate: number | null };

type Stage = typeof opportunityStages.$inferSelect;

function Column({ stage, cards, onOpen, columnRef }: { stage: Stage; cards: OpportunityCardRow[]; onOpen: (id: string) => void; columnRef: (el: HTMLDivElement | null) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = cards.reduce((sum, c) => sum + Number(c.expectedAmount), 0);

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        columnRef(el);
      }}
      className={cn('flex w-64 shrink-0 snap-start flex-col rounded-xl border border-border/60 bg-muted/30 transition-colors', isOver && 'border-primary/50 bg-primary/5')}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[13px] font-medium">
          {stage.name}
          <span className="rounded-full bg-muted px-1.5 py-px text-[11px] text-muted-foreground">{cards.length}</span>
        </div>
        {/* Kart içindeki tutarla aynı biçim (tam, ondalıksız kısaltma yok) — "197 B ₺" vs "₺45.000,00"
            gibi iki farklı para gösterimi karıştırılmasın. */}
        <span className="text-[11px] text-muted-foreground">{formatMoney(total, 'TRY', { digits: 0 })}</span>
      </div>
      {/* Kolon içeriği kısa olunca sabit bir 'sihirli' viewport yüksekliğine zorlanmıyor (yalnızca üst
          sınır — max-h); satır hizası kardeş kolonlarla align-items:stretch üzerinden değil, her kolon
          kendi içeriği kadar yükseklik alır (bkz. dış kaydırma kabındaki items-start). */}
      <div className="min-h-0 space-y-2 overflow-y-auto px-2 pb-2" style={{ maxHeight: 'min(560px, calc(100dvh - 18rem))' }}>
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
  const columnRefs = useRef(new Map<string, HTMLDivElement>());

  function goToStage(stageId: string) {
    setView('kanban');
    // Görünüm 'list' idiyse kanban ilk çizilsin diye kaydırmayı bir sonraki frame'e bırak.
    requestAnimationFrame(() => {
      columnRefs.current.get(stageId)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    });
  }

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
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-2.5">
        {/* Sarınca (flex-wrap) "Kazanma oranı" önündeki border-l öksüz kalıyordu — tek satır, yatay
            kayan bir şeride sabitlendi (390px'te de başlık/filtre/görünüm satırı bozulmaz). */}
        <div className="scrollbar-thin flex items-center gap-4 overflow-x-auto text-[13px] whitespace-nowrap">
          {funnel.stages.map((s) => (
            <button
              key={s.stageId}
              type="button"
              onClick={() => goToStage(s.stageId)}
              className="flex shrink-0 items-baseline gap-1.5 rounded px-1 -mx-1 hover:bg-muted/70"
              title={`${s.name} sütununa git`}
            >
              <span className="text-muted-foreground">{s.name}</span>
              <span className="font-mono font-medium tabular-nums">{s.count}</span>
            </button>
          ))}
          {funnel.winRate !== null ? (
            <div className="flex shrink-0 items-baseline gap-1.5 border-l border-border/60 pl-4">
              <span className="text-muted-foreground">Kazanma oranı</span>
              <span className="font-mono font-medium tabular-nums text-success">%{funnel.winRate.toFixed(0)}</span>
            </div>
          ) : null}
        </div>
        {/* Görünüm değiştirici yalnızca md+'ta anlamlı — 390px'te kanban zaten kullanılamaz olduğundan
            (aşağıda her koşulda liste zorlanır) burada gösterilmesi kafa karıştırırdı. */}
        <div className="hidden shrink-0 items-center gap-1 rounded-md border border-border/70 p-0.5 md:flex">
          <Button variant={view === 'kanban' ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => setView('kanban')} aria-label="Kanban görünümü"><LayoutGrid className="size-3.5" /></Button>
          <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => setView('list')} aria-label="Liste görünümü"><List className="size-3.5" /></Button>
        </div>
      </div>

      {/* 250px'lik sütunlar 390px genişlikte kart başlıklarını ortadan kesiyordu — kanban md altında
          hiç render edilmez, liste görünümü zorlanır (masaüstünde `view` state'i geçerli kalır). */}
      {/* Tur 5 P1 bulgusu: mobil düz liste kanban'ın aşama gruplamasını hiç yansıtmıyordu — sahada
          (390px, kanban hiç render edilmez) tek gerçek görünüm bu olduğundan aşama modeli burada da
          korunur (sticky grup başlıkları). Masaüstü "Liste" görünümü (aşağıda) bilinçli olarak
          gruplamasız kalır — orada kullanıcı zaten Kanban'a bir tık uzakta. */}
      <div className="md:hidden">
        <OpportunitiesMobileGroupedList rows={rows} stages={stages} onOpen={setOpenId} />
      </div>
      <div className="hidden md:block">
        {view === 'kanban' ? (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div className="scrollbar-thin scroll-fade-x flex snap-x snap-mandatory items-start gap-3 overflow-x-auto pb-2">
              {stages.map((s) => (
                <Column
                  key={s.id}
                  stage={s}
                  cards={byStage.get(s.id) ?? []}
                  onOpen={setOpenId}
                  columnRef={(el) => {
                    if (el) columnRefs.current.set(s.id, el);
                    else columnRefs.current.delete(s.id);
                  }}
                />
              ))}
            </div>
          </DndContext>
        ) : (
          <OpportunitiesListView rows={rows} stages={stages} onOpen={setOpenId} />
        )}
      </div>

      <OpportunityDrawer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
