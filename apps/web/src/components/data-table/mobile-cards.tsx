'use client';

import { flexRender, type Row, type Table } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { DataTableRowActions } from './row-actions';
import type { RowAction } from './types';

function headerLabel<T>(row: Row<T>, cellColumnId: string): string {
  const col = row.getVisibleCells().find((c) => c.column.id === cellColumnId)?.column;
  if (!col) return cellColumnId;
  return col.columnDef.meta?.label ?? (typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id);
}

/**
 * Mobil kart görünümü: sütun meta'sına göre başlık/alt başlık/rozet/satır düzeni.
 * Özel `renderCard` verilirse o kullanılır.
 */
export function DataTableMobileCards<T>({
  table,
  onRowClick,
  rowActions,
  renderCard,
}: {
  table: Table<T>;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => RowAction<T>[];
  renderCard?: (row: T) => React.ReactNode;
}) {
  const rows = table.getRowModel().rows;
  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        if (renderCard) {
          return (
            <li key={row.id} onClick={() => onRowClick?.(row.original)}>
              {renderCard(row.original)}
            </li>
          );
        }
        const cells = row.getVisibleCells().filter((c) => c.column.id !== '__actions');
        const title = cells.find((c) => c.column.columnDef.meta?.mobile === 'title') ?? cells[0];
        const subtitle = cells.find((c) => c.column.columnDef.meta?.mobile === 'subtitle');
        const badges = cells.filter((c) => c.column.columnDef.meta?.mobile === 'badge');
        // 'meta': masaüstünde `hidden` olan ama kartta bağlam için gerekli alanlar (hat, tarih…) —
        // etiketsiz, tek satır, soluk/mono ("HAT1 · 04.09.2026").
        const metaCells = cells.filter((c) => c.column.columnDef.meta?.mobile === 'meta');
        const rest = cells.filter((c) => c !== title && c !== subtitle && !badges.includes(c) && !metaCells.includes(c) && c.column.columnDef.meta?.mobile !== 'hidden');
        const actions = rowActions?.(row.original) ?? [];
        return (
          <li
            key={row.id}
            onClick={() => onRowClick?.(row.original)}
            className={cn(
              'rounded-lg border border-border/70 bg-card p-3',
              onRowClick && 'cursor-pointer active:bg-accent/50',
            )}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                {title ? <div className="truncate text-[14px] font-medium">{flexRender(title.column.columnDef.cell, title.getContext())}</div> : null}
                {subtitle ? (
                  <div className="truncate text-xs text-muted-foreground">{flexRender(subtitle.column.columnDef.cell, subtitle.getContext())}</div>
                ) : null}
                {metaCells.length ? (
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 truncate font-mono text-[11px] text-muted-foreground/70">
                    {metaCells.map((c, i) => (
                      <span key={c.id} className="inline-flex items-center gap-1.5">
                        {i > 0 ? <span aria-hidden>·</span> : null}
                        {flexRender(c.column.columnDef.cell, c.getContext())}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              {badges.map((b) => (
                <div key={b.id} className="shrink-0">
                  {flexRender(b.column.columnDef.cell, b.getContext())}
                </div>
              ))}
              {actions.length ? <DataTableRowActions row={row.original} actions={actions} /> : null}
            </div>
            {rest.length ? (
              // Tek ayraç kartın tam genişliğinde: her öğeye ayrı border-t vermek yerine (grid-cols-2'de
              // tek elemanlı son satırda kartın yalnızca yarısını kaplayan "kırık" bir çizgiye yol açardı)
              // <dl>'nin kendisine üstten tek bir hairline veriliyor.
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border/40 pt-2 text-[13px]">
                {rest.map((c) => (
                  <div key={c.id} className="flex min-w-0 items-baseline justify-between gap-2">
                    <dt className="truncate text-[11px] text-muted-foreground">{headerLabel(row, c.column.id)}</dt>
                    <dd className="truncate text-right">{flexRender(c.column.columnDef.cell, c.getContext())}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
