'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
import type { CountRow } from '../queries';

export function CountsTable({ counts }: { counts: CountRow[] }) {
  const columns = useMemo<ColumnDef<CountRow, unknown>[]>(
    () => [
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'Belge no', meta: { mobile: 'title', className: 'font-mono' } },
      { accessorKey: 'warehouseCode', header: 'Depo', meta: { width: 90, mobile: 'subtitle' }, cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span> },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 130, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="count" /> },
      { accessorKey: 'lineCount', header: 'Satır', meta: { align: 'right', width: 80, mobile: 'hidden' } },
      { accessorKey: 'countDate', header: 'Sayım tarihi', meta: { width: 130 }, cell: ({ row }) => formatDate(row.original.countDate) },
      { accessorKey: 'varianceValue', header: 'Fark değeri', meta: { align: 'right', width: 130 }, cell: ({ row }) => <MoneyCell value={row.original.varianceValue} signed /> },
    ],
    [],
  );

  const filters: DataTableFilter[] = [{ columnId: 'status', title: 'Durum', options: statusOptions('count') }];

  return (
    <DataTable
      columns={columns}
      data={counts}
      getRowId={(r) => r.id}
      rowHref={(r) => `/depo/sayim/${r.id}`}
      searchPlaceholder="Belge no ara…"
      filters={filters}
      initialSorting={[{ id: 'countDate', desc: true }]}
      emptyTitle="Henüz sayım yok"
    />
  );
}
