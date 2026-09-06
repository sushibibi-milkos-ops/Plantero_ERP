'use client';

import type { Column } from '@tanstack/react-table';
import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Sıralanabilir sütun başlığı. Tıklama: artan → azalan → sırasız. */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: {
  column: Column<TData, TValue>;
  title: React.ReactNode;
  className?: string;
}) {
  const align = column.columnDef.meta?.align;
  // Başlık metni asla kırpılmaz — sütun genişliğini gövde hücreleri belirler (whitespace-nowrap),
  // dar sütunlar meta.width ile açıkça genişletilir; aksi halde "Kalite Skoru" gibi başlıklar kesilip
  // altındaki dar gövde ile tutarsız görünürdü.
  if (!column.getCanSort() || column.columnDef.meta?.noSort) {
    return <span className={cn('block whitespace-nowrap', align === 'right' && 'text-right', className)}>{title}</span>;
  }
  const sorted = column.getIsSorted();
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={cn(
        'group/th -mx-1.5 inline-flex h-7 max-w-full items-center gap-1 rounded px-1.5 text-left whitespace-nowrap select-none',
        'hover:bg-muted/70 hover:text-foreground',
        // Kök neden (P2 shell-datatable-sortheader-focus-01, kriter 8): odak halkası token'ı yoktu,
        // klavye odağı UA'nın varsayılan `outline: auto 1px`'ine düşüyordu — uygulamanın geri kalanı
        // (Button, DateField vb.) hep aynı 3px `ring-ring/50` verir; sıralama başlığı tek istisnaydı.
        'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        align === 'right' && 'flex-row-reverse',
        sorted && 'text-foreground',
        className,
      )}
      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
    >
      <span className="whitespace-nowrap">{title}</span>
      {/* Sırasız durumdaki ChevronsUpDown yalnızca hover/focus'ta belirir — kalıcı süs ikonu 11 sütun
          başlığında birikince kırpılmaya yol açıyordu (16px geri kazanılır). Sıralı oktan (`sorted`)
          her zaman görünür kalır. */}
      <Icon className={cn('size-3 shrink-0', sorted ? 'text-primary' : 'text-muted-foreground/50 opacity-0 group-hover/th:opacity-100 group-focus-visible/th:opacity-100')} />
    </button>
  );
}
