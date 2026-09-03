'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
import type { TransferRow } from '../queries';

export function TransfersTable({ transfers }: { transfers: TransferRow[] }) {
  const columns = useMemo<ColumnDef<TransferRow, unknown>[]>(
    () => [
      // 16 karakterlik mono bir dizge (TR-2026-000001) sabit genişlikte tutulur — genişliksiz
      // bırakıldığında (Tur 1) tablo genişliğine göre orantısız büyüyordu (~500-800px arası kayıyordu).
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'Belge no', meta: { width: 150, mobile: 'title', className: 'font-mono' } },
      {
        id: 'route',
        accessorFn: (r) => `${r.fromWarehouseCode} → ${r.toWarehouseCode}`,
        header: 'Güzergah',
        meta: { mobile: 'subtitle' },
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.fromWarehouseCode} → {row.original.toWarehouseCode}</span>,
      },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 130, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="transfer" /> },
      { accessorKey: 'lineCount', header: 'Satır', meta: { align: 'right', width: 60, mobile: 'hidden' } },
      { accessorKey: 'value', header: 'Değer', meta: { align: 'right', width: 120, mobile: 'hidden' }, cell: ({ row }) => <MoneyCell value={row.original.value} /> },
      { accessorKey: 'scheduledDate', header: 'Planlanan tarih', meta: { width: 150, mobile: 'hidden' }, cell: ({ row }) => (row.original.scheduledDate ? formatDate(row.original.scheduledDate) : '—') },
      { accessorKey: 'createdAt', header: 'Oluşturma', meta: { width: 130 }, cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.createdAt)}</span> },
    ],
    [],
  );

  const filters: DataTableFilter[] = [{ columnId: 'status', title: 'Durum', options: statusOptions('transfer') }];

  return (
    <DataTable
      columns={columns}
      data={transfers}
      getRowId={(r) => r.id}
      rowHref={(r) => `/depo/transfer/${r.id}`}
      searchPlaceholder="Belge no ara…"
      filters={filters}
      initialSorting={[{ id: 'createdAt', desc: true }]}
      emptyTitle="Henüz transfer yok"
    />
  );
}
