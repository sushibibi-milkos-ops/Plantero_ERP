'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { formatDate } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import type { JournalEntryRow } from '../queries';

export function JournalEntriesTable({ rows, journalOptions }: { rows: JournalEntryRow[]; journalOptions: Array<{ value: string; label: string }> }) {
  const columns = useMemo<ColumnDef<JournalEntryRow, unknown>[]>(
    () => [
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'Fiş no', meta: { mobile: 'title', className: 'font-mono' } },
      { accessorKey: 'description', header: 'Açıklama', meta: { mobile: 'subtitle', flex: true } },
      { accessorKey: 'journalCode', header: 'Yevmiye', meta: { width: 90, mobile: 'hidden' } },
      { accessorKey: 'partnerName', header: 'Cari', meta: { width: 160, mobile: 'hidden' }, cell: ({ row }) => row.original.partnerName ?? <span className="text-muted-foreground">—</span> },
      { accessorKey: 'totalDebit', header: 'Tutar', meta: { align: 'right', width: 130 }, cell: ({ row }) => <MoneyCell value={row.original.totalDebit} /> },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 110, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="journal_entry" /> },
      { accessorKey: 'entryDate', header: 'Tarih', meta: { width: 110 }, cell: ({ row }) => formatDate(row.original.entryDate) },
    ],
    [],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'status', title: 'Durum', options: statusOptions('journal_entry') },
    { columnId: 'journalCode', title: 'Yevmiye', options: journalOptions },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      rowHref={(r) => `/muhasebe/yevmiye/${r.id}`}
      searchPlaceholder="Fiş no, açıklama ara…"
      filters={filters}
      initialSorting={[{ id: 'entryDate', desc: true }]}
      emptyTitle="Bu defterde kayıt yok"
    />
  );
}
