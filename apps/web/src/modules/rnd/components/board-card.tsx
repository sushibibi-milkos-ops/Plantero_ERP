'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CheckSquare, MessageSquare, Paperclip, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import type { BoardCardRow } from '../queries';

const LABEL_COLORS = ['bg-primary/15 text-primary', 'bg-info/15 text-info', 'bg-warning/15 text-[oklch(0.5_0.14_70)] dark:text-warning', 'bg-destructive/12 text-destructive', 'bg-muted text-muted-foreground'];
function labelClass(label: string) {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) % LABEL_COLORS.length;
  return LABEL_COLORS[hash]!;
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

export function BoardCard({ card, onOpen, dragging = false }: { card: BoardCardRow; onOpen: () => void; dragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, data: { type: 'card', columnId: card.columnId } });

  const style = { transform: CSS.Transform.toString(transform), transition };
  const overdue = card.dueDate ? card.dueDate < new Date().toISOString().slice(0, 10) : false;

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      type="button"
      onClick={onOpen}
      className={cn(
        'w-full min-h-11 rounded-lg border border-border/60 bg-card p-2.5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
        'transition-[transform,box-shadow,opacity] duration-150 ease-out hover:border-border hover:shadow-sm active:scale-[0.98]',
        (isDragging || dragging) && 'shadow-lg ring-1 ring-primary/40 opacity-90',
      )}
    >
      {card.labels.length > 0 ? (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {card.labels.map((l) => (
            <span key={l} className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', labelClass(l))}>{l}</span>
          ))}
        </div>
      ) : null}
      <p className="text-[13px] leading-snug font-medium text-foreground">{card.title}</p>
      {card.trialVersionLabel ? (
        <span className="mt-1.5 inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
          <FlaskConical className="size-3" /> {card.trialVersionLabel}
        </span>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <div className="flex flex-wrap items-center gap-2.5">
          {card.dueDate ? <span className={cn(overdue && 'font-medium text-destructive')}>{formatDate(card.dueDate)}</span> : null}
          {card.checklistTotal > 0 ? (
            <span className={cn('inline-flex items-center gap-1', card.checklistDone === card.checklistTotal && 'text-success')}>
              <CheckSquare className="size-3" /> {card.checklistDone}/{card.checklistTotal}
            </span>
          ) : null}
          {card.commentCount > 0 ? <span className="inline-flex items-center gap-1"><MessageSquare className="size-3" /> {card.commentCount}</span> : null}
          {card.attachmentCount > 0 ? <span className="inline-flex items-center gap-1"><Paperclip className="size-3" /> {card.attachmentCount}</span> : null}
        </div>
        {card.assigneeName ? (
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[9px] font-medium text-foreground/80" title={card.assigneeName}>
            {initials(card.assigneeName)}
          </span>
        ) : null}
      </div>
    </button>
  );
}
