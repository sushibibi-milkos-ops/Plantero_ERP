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
      className={cn('flex w-72 shrink-0 snap-start flex-col rounded-xl border border-border/60 bg-muted/30', isDragging && 'opacity-50')}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-2">
        <button {...attributes} {...listeners} type="button" className="grid size-6 shrink-0 cursor-grab place-items-center rounded text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground active:cursor-grabbing" aria-label="Kolonu sürükle">
          <GripVertical className="size-3.5" />
        </button>
        {column.isDone ? <CheckCircle2 className="size-3.5 shrink-0 text-success" /> : null}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{column.name}</span>
        <span className={cn('shrink-0 rounded-full px-1.5 py-px text-[11px] tabular-nums', atLimit ? 'bg-warning/15 text-[oklch(0.5_0.14_70)] dark:text-warning' : 'bg-muted text-muted-foreground')}>
          {cards.length}{column.wipLimit != null ? `/${column.wipLimit}` : ''}
        </span>
        <ColumnMenu column={column} projectId={projectId} />
      </div>

      <div
        ref={setDropRef}
        className={cn('min-h-16 flex-1 space-y-1.5 overflow-y-auto rounded-lg px-2 pb-1.5 transition-colors duration-150', isOver && 'bg-primary/5')}
        style={{ maxHeight: 'min(600px, calc(100dvh - 20rem))' }}
      >
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((c) => (
            <BoardCard key={c.id} card={c} onOpen={() => onOpenCard(c.id)} />
          ))}
        </SortableContext>
      </div>

      <div className="px-2 pb-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 w-full justify-start text-muted-foreground"
          disabled={atLimit}
          title={atLimit ? `WIP limiti (${column.wipLimit}) doldu` : undefined}
          onClick={() => onAddCard(column.id)}
        >
          <Plus className="size-3.5" /> Kart ekle
        </Button>
      </div>
    </div>
  );
}
