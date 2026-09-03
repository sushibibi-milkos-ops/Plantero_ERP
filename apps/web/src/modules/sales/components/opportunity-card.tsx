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
      // focus-visible eklendi (Tur 5 P2 bulgusu): dnd-kit useDraggable attributes kartı tabIndex=0
      // yapıyor, önceden hiçbir odak halkası yoktu — klavye odağı kartlar arasında görünmez dolaşıyordu.
      className={cn(
        'cursor-grab space-y-1.5 rounded-lg border border-border/60 bg-card p-3 text-left select-none active:cursor-grabbing',
        // İkinci gölge katmanı (20px blur, modal seviyesi yükseklik sinyali) kaldırıldı — Linear board
        // kartları gölgesizdir, hover'da yalnızca kenarlık koyulaşır (Tur 5 P2 bulgusu).
        'hover:border-foreground/15',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        isDragging && 'opacity-40',
      )}
    >
      <div className="line-clamp-2 text-[13px] font-medium">{row.title}</div>
      {/* Cari adı yoksa satır boş bırakılmaz — soluk "cari bağlı değil" ile aynı yükseklik korunur,
          aksi halde kart kart yükseklikleri zıplayıp eksik veri hata gibi okunuyordu. */}
      <div className="truncate text-xs text-muted-foreground">{row.partnerName || <span className="text-muted-foreground/40">— cari bağlı değil</span>}</div>
      {/* Tur 5 P1 bulgusu: para+olasılık satırı ile tarih+sahip satırı ayrı ayrı 2×20px alan
          kaplıyordu (kart ~116px, sütun başına 1440px'te yalnızca 3 kart) — tek 20px'lik meta
          satırında birleştirildi: sol tutar+olasılık, sağ gecikti rozeti (yalnızca varsa) + sahip
          avatarı. Hedef kart yüksekliği ~76px. */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-1.5">
          {/* Kolon başlığındaki toplam da ondalıksız (kanban-board.tsx `formatMoney(...,{digits:0})`) —
              kartta kuruş bilgisi taşımıyor; iki farklı hassasiyet aynı ekranda karışmasın. */}
          <MoneyCell value={row.expectedAmount} currency={row.currency} digits={0} className="text-[13px] font-semibold text-foreground" />
          <span className="font-mono text-[11px] text-muted-foreground">%{row.probability}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {row.nextActivityDate && row.isOverdue ? (
            // ExpiryBadge deseniyle uyumlu küçük rozet: ham kırmızı metin "hata" gibi okunuyordu,
            // rozet + "gecikti" etiketi nedenini açıklıyor.
            <span
              title={`Sonraki aktivite: ${formatDate(row.nextActivityDate)} (gecikti)`}
              className="inline-flex h-4 items-center gap-1 rounded bg-destructive/10 px-1 text-[10px] font-medium whitespace-nowrap text-destructive tabular-nums"
            >
              <CalendarClock className="size-2.5" /> gecikti · {formatDate(row.nextActivityDate).slice(0, 5)}
            </span>
          ) : null}
          {row.ownerName ? (
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground" title={row.ownerName}>
              {initials(row.ownerName)}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
