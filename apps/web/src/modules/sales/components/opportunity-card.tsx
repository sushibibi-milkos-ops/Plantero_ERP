'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { CalendarClock } from 'lucide-react';
import { MoneyCell } from '@/components/money-cell';
import { formatDate, initials } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { OpportunityCardRow } from '../queries';

export function OpportunityCard({ row, onOpen }: { row: OpportunityCardRow; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: row.id, data: { stageId: row.stageId } });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => !isDragging && onOpen(row.id)}
      className={cn(
        'cursor-grab space-y-2 rounded-lg border border-border/60 bg-card p-3 text-left shadow-[0_1px_2px_rgb(0_0_0/0.03)] select-none active:cursor-grabbing',
        'hover:border-border hover:shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_20px_-12px_rgb(0_0_0/0.15)]',
        isDragging && 'opacity-40',
      )}
    >
      <div className="line-clamp-2 text-[13px] font-medium">{row.title}</div>
      {/* Cari adı yoksa satır boş bırakılmaz — soluk "cari bağlı değil" ile aynı yükseklik korunur,
          aksi halde kart kart yükseklikleri zıplayıp eksik veri hata gibi okunuyordu. */}
      <div className="truncate text-xs text-muted-foreground">{row.partnerName || <span className="text-muted-foreground/40">— cari bağlı değil</span>}</div>
      <div className="flex items-center justify-between gap-2">
        {/* Kolon başlığındaki toplam da ondalıksız (kanban-board.tsx `formatMoney(...,{digits:0})`) —
            kartta kuruş bilgisi taşımıyor; iki farklı hassasiyet aynı ekranda karışmasın. */}
        <MoneyCell value={row.expectedAmount} currency={row.currency} digits={0} className="text-[13px] font-semibold text-foreground" />
        <span className="font-mono text-[11px] text-muted-foreground">%{row.probability}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        {row.nextActivityDate ? (
          row.isOverdue ? (
            // ExpiryBadge deseniyle uyumlu küçük rozet: ham kırmızı metin "hata" gibi okunuyordu,
            // rozet + "gecikti" etiketi nedenini açıklıyor.
            <span
              title={`Sonraki aktivite: ${formatDate(row.nextActivityDate)} (gecikti)`}
              className="inline-flex h-4 items-center gap-1 rounded bg-destructive/10 px-1 text-[10px] font-medium whitespace-nowrap text-destructive tabular-nums"
            >
              <CalendarClock className="size-2.5" /> gecikti · {formatDate(row.nextActivityDate).slice(0, 5)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <CalendarClock className="size-3" /> {formatDate(row.nextActivityDate)}
            </span>
          )
        ) : <span />}
        {row.ownerName ? (
          <span className="grid size-5 place-items-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground" title={row.ownerName}>
            {initials(row.ownerName)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
