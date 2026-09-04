'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
import type { InvoiceRow } from '../queries';

export function InvoicesTable({ rows, emptyTitle }: { rows: InvoiceRow[]; emptyTitle: string }) {
  const columns = useMemo<ColumnDef<InvoiceRow, unknown>[]>(
    () => [
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'Belge no', meta: { mobile: 'title', className: 'font-mono' } },
      { accessorKey: 'partnerName', header: 'Cari', meta: { mobile: 'subtitle' } },
      {
        accessorKey: 'dueDate', header: 'Vade', meta: { width: 150 },
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <span>{formatDate(row.original.dueDate)}</span>
            {row.original.daysOverdue > 0 ? <span className="text-[11px] font-medium text-destructive">{row.original.daysOverdue} gün gecikti</span> : null}
          </div>
        ),
      },
      { accessorKey: 'grandTotal', header: 'Tutar', meta: { align: 'right', width: 130 }, cell: ({ row }) => <MoneyCell value={row.original.grandTotal} currency={row.original.currency} /> },
      { accessorKey: 'residual', header: 'Kalan', meta: { align: 'right', width: 130 }, cell: ({ row }) => <MoneyCell value={row.original.residual} currency={row.original.currency} muted={Number(row.original.residual) <= 0} /> },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 130, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="invoice" /> },
      { id: 'eInvoiceStatus', accessorFn: (r) => r.eInvoiceStatus, header: 'e-Belge', meta: { width: 140, mobile: 'hidden' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="e_invoice" /> },
      { accessorKey: 'channelName', header: 'Kanal', meta: { width: 120, mobile: 'hidden' }, cell: ({ row }) => row.original.channelName ?? <span className="text-muted-foreground">—</span> },
      { accessorKey: 'invoiceDate', header: 'Tarih', meta: { width: 110, mobile: 'hidden' }, cell: ({ row }) => formatDate(row.original.invoiceDate) },
    ],
    [],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'status', title: 'Durum', options: statusOptions('invoice') },
    { columnId: 'eInvoiceStatus', title: 'e-Belge', options: statusOptions('e_invoice') },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      rowHref={(r) => `/muhasebe/faturalar/${r.id}`}
      searchPlaceholder="Belge no, cari ara…"
      filters={filters}
      initialSorting={[{ id: 'invoiceDate', desc: true }]}
      emptyTitle={emptyTitle}
      emptyDescription="Kayıt oluştuğunda burada listelenecek."
    />
  );
}
