'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type Row,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { TableVirtuoso } from 'react-virtuoso';
import { SearchX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/empty-state';
import { DataTableColumnHeader } from './column-header';
import { DataTableToolbar } from './toolbar';
import { DataTablePagination } from './pagination';
import { DataTableRowActions } from './row-actions';
import { DataTableSkeleton } from './skeleton';
import { DataTableMobileCards } from './mobile-cards';
import type { DataTableFilter, RowAction } from './types';

export type DataTableProps<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  isLoading?: boolean;
  getRowId?: (row: T) => string;
  /** Arama kutusu */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Faceted sütun filtreleri */
  filters?: DataTableFilter[];
  columnToggle?: boolean;
  toolbarExtra?: React.ReactNode;
  /** Sayfalama (varsayılan açık, 50 satır). `virtualize` ile kapatılır. */
  pagination?: boolean;
  pageSize?: number;
  /** Büyük listelerde Virtuoso (sayfalama devre dışı) */
  virtualize?: boolean;
  virtualHeight?: number;
  initialSorting?: SortingState;
  initialColumnVisibility?: VisibilityState;
  onRowClick?: (row: T) => void;
  /** Satır bağlantısı (router.push) — onRowClick'ten önce gelir */
  rowHref?: (row: T) => string;
  rowActions?: (row: T) => RowAction<T>[];
  rowClassName?: (row: T) => string | undefined;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
  emptyAction?: React.ReactNode;
  /** Mobil kart özel çizimi */
  renderMobileCard?: (row: T) => React.ReactNode;
  /** Mobilde de tablo göster (kart yerine) */
  mobileTable?: boolean;
  className?: string;
};

function trIncludes(hay: unknown, needle: string): boolean {
  if (hay === null || hay === undefined) return false;
  return String(hay).toLocaleLowerCase('tr-TR').includes(needle);
}

/**
 * Linear yoğunluğunda veri tablosu: 36px satır, 13px metin, hairline ayraç.
 * Sıralama, global arama (TR duyarsız), faceted filtreler, sütun gizleme,
 * sayfalama ya da sanallaştırma, satır tıklama, satır aksiyon menüsü,
 * yükleniyor iskeleti, boş durum, mobilde kart görünümü.
 */
export function DataTable<T>({
  columns,
  data,
  isLoading = false,
  getRowId,
  searchable = true,
  searchPlaceholder = 'Ara…',
  filters = [],
  columnToggle = true,
  toolbarExtra,
  pagination = true,
  pageSize = 50,
  virtualize = false,
  virtualHeight = 560,
  initialSorting = [],
  initialColumnVisibility = {},
  onRowClick,
  rowHref,
  rowActions,
  rowClassName,
  emptyTitle = 'Kayıt yok',
  emptyDescription,
  emptyAction,
  renderMobileCard,
  mobileTable = false,
  className,
}: DataTableProps<T>) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(initialColumnVisibility);
  const [globalFilter, setGlobalFilter] = useState('');

  const filterColumnIds = useMemo(() => new Set(filters.map((f) => f.columnId)), [filters]);

  const cols = useMemo<ColumnDef<T, unknown>[]>(() => {
    const mapped = columns.map((c) => {
      const id = c.id ?? ('accessorKey' in c ? String(c.accessorKey) : undefined);
      const next: ColumnDef<T, unknown> = { ...c };
      // String başlık → sıralanabilir başlık bileşeni
      if (typeof c.header === 'string') {
        const title = c.header;
        next.header = ({ column }) => <DataTableColumnHeader column={column} title={title} />;
        next.meta = { label: title, ...c.meta };
      }
      if (id && filterColumnIds.has(id) && !c.filterFn) next.filterFn = 'arrIncludesSome';
      return next;
    });
    if (rowActions) {
      mapped.push({
        id: '__actions',
        header: () => <span className="sr-only">Eylemler</span>,
        enableSorting: false,
        enableHiding: false,
        meta: { align: 'right', width: 40, mobile: 'hidden', className: 'pr-1' },
        cell: ({ row }) => <DataTableRowActions row={row.original} actions={rowActions(row.original)} />,
      });
    }
    return mapped;
  }, [columns, filterColumnIds, rowActions]);

  const usePagination = pagination && !virtualize;

  const table = useReactTable({
    data,
    columns: cols,
    state: { sorting, columnFilters, columnVisibility, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, columnId, value) => trIncludes(row.getValue(columnId), String(value).toLocaleLowerCase('tr-TR')),
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    ...(usePagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    initialState: { pagination: { pageSize } },
    autoResetPageIndex: true,
  });

  const handleRowClick = (row: T) => {
    if (rowHref) router.push(rowHref(row));
    else onRowClick?.(row);
  };
  const clickable = Boolean(rowHref || onRowClick);
  const rows = table.getRowModel().rows;
  const visibleCols = table.getVisibleLeafColumns();
  const filtered = Boolean(globalFilter) || columnFilters.length > 0;

  const headerRow = () => (
    <tr className="border-b border-border/60 bg-muted/40">
      {table.getHeaderGroups().flatMap((hg) =>
        hg.headers.map((h) => {
          const meta = h.column.columnDef.meta;
          return (
            <th
              key={h.id}
              scope="col"
              style={meta?.width ? { width: meta.width, minWidth: meta.width } : undefined}
              className={cn(
                'h-9 px-3 text-left align-middle text-[12px] font-medium whitespace-nowrap text-muted-foreground',
                meta?.align === 'right' && 'text-right',
                meta?.align === 'center' && 'text-center',
                meta?.headerClassName,
              )}
            >
              {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
            </th>
          );
        }),
      )}
    </tr>
  );

  const rowCells = (row: Row<T>) =>
    row.getVisibleCells().map((cell) => {
      const meta = cell.column.columnDef.meta;
      return (
        <td
          key={cell.id}
          className={cn(
            'h-9 px-3 align-middle text-[13px] whitespace-nowrap',
            meta?.align === 'right' && 'text-right',
            meta?.align === 'center' && 'text-center',
            meta?.className,
          )}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      );
    });

  const rowProps = (row: Row<T>) => ({
    'data-row-id': row.id,
    onClick: clickable ? () => handleRowClick(row.original) : undefined,
    onKeyDown: clickable
      ? (e: React.KeyboardEvent) => {
          if (e.key === 'Enter') handleRowClick(row.original);
        }
      : undefined,
    tabIndex: clickable ? 0 : undefined,
    className: cn(
      'group/row h-9 border-b border-border/50 last:border-0',
      clickable && 'cursor-pointer hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none',
      rowClassName?.(row.original),
    ),
  });

  const bodyRow = (row: Row<T>) => (
    <tr key={row.id} {...rowProps(row)}>
      {rowCells(row)}
    </tr>
  );

  const empty = (
    <EmptyState
      compact
      icon={filtered ? SearchX : undefined}
      title={filtered ? 'Eşleşen kayıt yok' : emptyTitle}
      description={filtered ? 'Arama ya da filtreleri değiştirmeyi deneyin.' : emptyDescription}
      action={filtered ? undefined : emptyAction}
    />
  );

  if (isLoading) {
    return (
      <div className={className}>
        <DataTableToolbar table={table} searchable={searchable} searchPlaceholder={searchPlaceholder} filters={filters} columnToggle={columnToggle} extra={toolbarExtra} />
        <DataTableSkeleton columns={Math.min(visibleCols.length, 6)} />
      </div>
    );
  }

  return (
    <div className={className}>
      <DataTableToolbar
        table={table}
        searchable={searchable}
        searchPlaceholder={searchPlaceholder}
        filters={filters}
        columnToggle={columnToggle}
        extra={toolbarExtra}
        total={table.getFilteredRowModel().rows.length}
      />

      {/* Masaüstü tablo */}
      <div className={cn('overflow-hidden rounded-lg border border-border/70 bg-card', !mobileTable && 'hidden md:block')}>
        {rows.length === 0 ? (
          <div>
            <table className="w-full">
              <thead>{headerRow()}</thead>
            </table>
            {empty}
          </div>
        ) : virtualize ? (
          <TableVirtuoso
            style={{ height: virtualHeight }}
            data={rows}
            components={{
              Table: (props) => <table {...props} className="w-full border-collapse" />,
              TableRow: ({ item, ...props }) => <tr {...props} {...rowProps(item)} />,
            }}
            fixedHeaderContent={headerRow}
            itemContent={(_i, row) => rowCells(row)}
          />
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>{headerRow()}</thead>
              <tbody>{rows.map(bodyRow)}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mobil kartlar */}
      {!mobileTable ? (
        <div className="md:hidden">
          {rows.length === 0 ? (
            <div className="rounded-lg border border-border/70 bg-card">{empty}</div>
          ) : (
            <DataTableMobileCards
              table={table}
              onRowClick={clickable ? handleRowClick : undefined}
              rowActions={rowActions}
              renderCard={renderMobileCard}
            />
          )}
        </div>
      ) : null}

      {usePagination ? <DataTablePagination table={table} /> : null}
    </div>
  );
}
