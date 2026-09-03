'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
import type { ReceiptRow } from '../queries';

export function ReceiptsTable({ receipts }: { receipts: ReceiptRow[] }) {
  // Depo neredeyse hep tek değer — sütun tabloyu kaba (clientWidth) genişliğine sığdırmıyordu
  // (1197 > 1152, "Tarih" sütunu kırpılıyordu). Tek depo varsa sütun render edilmez.
  const distinctWarehouses = useMemo(() => new Set(receipts.map((r) => r.warehouseCode)), [receipts]);
  const showWarehouseColumn = distinctWarehouses.size > 1;

  const columns = useMemo<ColumnDef<ReceiptRow, unknown>[]>(
    () => {
      const cols: ColumnDef<ReceiptRow, unknown>[] = [
        { id: 'docNo', accessorFn: (r) => r.docNo, header: 'Belge no', meta: { mobile: 'title', className: 'font-mono' } },
        { accessorKey: 'partnerName', header: 'Tedarikçi', meta: { mobile: 'subtitle' }, cell: ({ row }) => row.original.partnerName ?? <span className="text-muted-foreground">—</span> },
        { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 140, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="receipt" /> },
        { accessorKey: 'lineCount', header: 'Satır', meta: { align: 'right', width: 80, mobile: 'hidden' } },
        { accessorKey: 'totalValue', header: 'Toplam tutar', meta: { align: 'right', width: 140 }, cell: ({ row }) => <MoneyCell value={row.original.totalValue} /> },
        { accessorKey: 'supplierDeliveryNo', header: 'İrsaliye no', meta: { mobile: 'hidden' }, cell: ({ row }) => row.original.supplierDeliveryNo ?? '—' },
        { accessorKey: 'createdAt', header: 'Tarih', meta: { width: 110 }, cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.createdAt)}</span> },
      ];
      if (showWarehouseColumn) {
        cols.splice(3, 0, { accessorKey: 'warehouseCode', header: 'Depo', meta: { width: 90, mobile: 'hidden' }, cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span> });
      }
      return cols;
    },
    [showWarehouseColumn],
  );

  const filters: DataTableFilter[] = [{ columnId: 'status', title: 'Durum', options: statusOptions('receipt') }];

  return (
    <DataTable
      columns={columns}
      data={receipts}
      getRowId={(r) => r.id}
      rowHref={(r) => `/depo/mal-kabul/${r.id}`}
      searchPlaceholder="Belge no, tedarikçi ara…"
      filters={filters}
      initialSorting={[{ id: 'createdAt', desc: true }]}
      emptyTitle="Henüz mal kabul yok"
      emptyDescription="Tedarikçiden gelen sevkiyatlar burada listelenir."
    />
  );
}
