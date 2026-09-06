'use client';

import { useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { BoardCard } from './board-card';
import { ColumnMenu } from './column-menu';
import type { BoardCardRow, BoardColumnRow } from '../queries';

export function BoardColumn({
  column, projectId, cards, onOpenCard, onAddCard,
}: {
  column: BoardColumnRow;
  projectId: string;
  cards: BoardCardRow[];
  onOpenCard: (id: string) => void;
  onAddCard: (columnId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id, data: { type: 'column' } });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: column.id, data: { type: 'column' } });

  const style = { transform: CSS.Transform.toString(transform), transition };
  const atLimit = column.wipLimit != null && cards.length >= column.wipLimit;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('flex h-full w-64 shrink-0 snap-start flex-col rounded-xl border border-border/60 bg-muted/30', isDragging && 'opacity-50')}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        {/* size-11 md:size-6: mobilde gerçek 44×44 dokunma hedefi, masaüstünde eski kompakt boyut
            (Tur 1 P1 arge-board-01) — data-table/row-actions.tsx ile aynı desen. */}
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="grid size-11 shrink-0 cursor-grab place-items-center rounded text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground active:cursor-grabbing md:size-6"
          aria-label="Kolonu sürükle"
        >
          <GripVertical className="size-4" />
        </button>
        {column.isDone ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : null}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{column.name}</span>
        <span className={cn('shrink-0 rounded-full px-1.5 py-px text-[11px] tabular-nums', atLimit ? 'bg-warning/15 text-[oklch(0.5_0.14_70)] dark:text-warning' : 'bg-muted text-muted-foreground')}>
          {cards.length}{column.wipLimit != null ? `/${column.wipLimit}` : ''}
        </span>
        <ColumnMenu column={column} projectId={projectId} />
      </div>

      {/* flex-1 + flex-col: kolon `h-full` olduğundan gövde kalan tüm dikey alanı kaplar → tüm
          kolonlar eşit yükseklikte görünür. "Kart ekle" artık AYRI bir alt şerit DEĞİL, kart
          yığınının hemen ardında akışın içinde (Tur 2 P1 arge-board-11 kök neden düzeltmesi):
          eskiden footer'a sabitlendiği için son karttan 278–450px aşağıda kalıyor, gövdenin büyük
          kısmı görsel olarak ölü alan gibi duruyordu. Kalan boşluk artık `flex-1` dolgu — hem boş
          kolonda bırakma ipucu taşır (Tur 2 P2 arge-board-13) hem de tüm gövde tek droppable alan
          olarak kalır (son kartın altına ya da kolonun herhangi bir boş noktasına bırakılabilir). */}
      <div
        ref={setDropRef}
        className={cn('flex min-h-52 flex-1 flex-col overflow-y-auto rounded-lg px-3 pb-2 transition-colors duration-150', isOver && 'bg-primary/5')}
      >
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {cards.map((c) => (
              <BoardCard key={c.id} card={c} onOpen={() => onOpenCard(c.id)} />
            ))}
          </div>
        </SortableContext>

        <div className="pt-2">
          {/* h-11 md:h-9: 390px'te gerçek 44px dokunma hedefi, masaüstünde eski kompakt boyut
              (Tur 2 P1 arge-board-10) — depoda kabul edilen `size-11 md:size-8`/`h-11 md:h-9` deseni. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 w-full justify-start text-muted-foreground md:h-9"
            disabled={atLimit}
            title={atLimit ? `WIP limiti (${column.wipLimit}) doldu` : undefined}
            onClick={() => onAddCard(column.id)}
          >
            <Plus className="size-4" /> Kart ekle
          </Button>
        </div>

        {cards.length === 0 ? (
          <div className="mt-2 flex flex-1 min-h-24 items-center justify-center rounded-lg border border-dashed border-border/60 px-2 text-center text-[11px] text-muted-foreground">
            Kart yok — sürükleyip bırakın
          </div>
        ) : (
          <div className="flex-1" />
        )}
      </div>
    </div>
  );
}
