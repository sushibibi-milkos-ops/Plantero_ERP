'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
import type { DeliveryRow } from '../queries';

export function DeliveriesTable({ deliveries }: { deliveries: DeliveryRow[] }) {
  const columns = useMemo<ColumnDef<DeliveryRow, unknown>[]>(
    () => [
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'Belge no', meta: { mobile: 'title', className: 'font-mono' } },
      { accessorKey: 'partnerName', header: 'Müşteri', meta: { mobile: 'subtitle' } },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 140, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="delivery" /> },
      { accessorKey: 'warehouseCode', header: 'Depo', meta: { width: 90, mobile: 'hidden' }, cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span> },
      { accessorKey: 'lineCount', header: 'Satır', meta: { align: 'right', width: 80, mobile: 'hidden' } },
      {
        accessorKey: 'salesOrderDocNo',
        header: 'Sipariş',
        meta: { mobile: 'hidden' },
        cell: ({ row }) => (row.original.salesOrderId ? <Link href={`/satis/siparisler/${row.original.salesOrderId}`} className="font-mono text-xs text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{row.original.salesOrderDocNo}</Link> : '—'),
      },
      { accessorKey: 'scheduledDate', header: 'Planlanan tarih', meta: { width: 130 }, cell: ({ row }) => (row.original.scheduledDate ? formatDate(row.original.scheduledDate) : '—') },
      { accessorKey: 'carrier', header: 'Kargo', meta: { mobile: 'hidden' }, cell: ({ row }) => row.original.carrier ?? '—' },
    ],
    [],
  );

  const filters: DataTableFilter[] = [{ columnId: 'status', title: 'Durum', options: statusOptions('delivery') }];

  return (
    <DataTable
      columns={columns}
      data={deliveries}
      getRowId={(r) => r.id}
      rowHref={(r) => `/depo/sevkiyat/${r.id}`}
      searchPlaceholder="Belge no, müşteri ara…"
      filters={filters}
      initialSorting={[{ id: 'scheduledDate', desc: false }]}
      emptyTitle="Henüz sevkiyat yok"
      emptyDescription="Satış siparişi onaylandığında irsaliye buradan oluşturulur."
    />
  );
}
