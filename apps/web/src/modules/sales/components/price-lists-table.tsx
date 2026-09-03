'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { PriceListDrawer } from './price-list-drawer';
import { formatDate } from '@/lib/format';
import type { listPriceListsWithCounts, SellableProductRow } from '../queries';

type Row = Awaited<ReturnType<typeof listPriceListsWithCounts>>[number];

export function PriceListsTable({ rows, products }: { rows: Row[]; products: SellableProductRow[] }) {
  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        id: 'name', accessorFn: (r) => r.name, header: 'Liste', meta: { mobile: 'title' },
        cell: ({ row }) => (
          <div className="flex items-baseline gap-2">
            <span className="font-medium">{row.original.name}</span>
            <span className="font-mono text-xs text-muted-foreground">{row.original.code}</span>
          </div>
        ),
      },
      { id: 'channelName', accessorFn: (r) => r.channelName ?? '—', header: 'Kanal', meta: { mobile: 'hidden', defaultHidden: true } },
      { id: 'currency', accessorFn: (r) => r.currency, header: 'Para birimi', meta: { width: 100, className: 'font-mono text-xs', mobile: 'meta' } },
      { id: 'includesVat', header: 'KDV', meta: { width: 80, mobile: 'hidden' }, cell: ({ row }) => (row.original.includesVat ? 'Dahil' : 'Hariç') },
      {
        id: 'validity', header: 'Geçerlilik', meta: { mobile: 'hidden', className: 'text-xs text-muted-foreground' },
        cell: ({ row }) => (row.original.validFrom ? formatDate(row.original.validFrom) : 'Süresiz') + (row.original.validTo ? ` → ${formatDate(row.original.validTo)}` : ''),
      },
      {
        id: 'items', header: 'Satırlar', enableSorting: false, meta: { align: 'right', width: 96, mobile: 'row' },
        cell: ({ row }) => <PriceListDrawer listId={row.original.id} listName={row.original.name} currency={row.original.currency} itemCount={row.original.itemCount} products={products} />,
      },
    ],
    [products],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      searchPlaceholder="Liste adı, kod, kanal ara…"
      emptyTitle="Henüz fiyat listesi yok"
      emptyDescription="Kanal bazlı fiyat listesi seed ile yüklenir."
    />
  );
}
