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
        align === 'right' && 'flex-row-reverse',
        sorted && 'text-foreground',
        className,
      )}
      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
    >
      <span className="whitespace-nowrap">{title}</span>
      <Icon className={cn('size-3 shrink-0', sorted ? 'text-primary' : 'text-muted-foreground/50 group-hover/th:text-muted-foreground')} />
    </button>
  );
}
