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
  // stock-table.tsx / deliveries-table.tsx / transfers-table.tsx ile aynı kök nedenle (Tur 3 P2):
  // "Satır" neredeyse her satırda "1" — bilgi taşımıyorsa sütun hiç render edilmez.
  const showLineCount = useMemo(() => new Set(receipts.map((r) => r.lineCount)).size > 1, [receipts]);

  const columns = useMemo<ColumnDef<ReceiptRow, unknown>[]>(
    () => {
      const cols: ColumnDef<ReceiptRow, unknown>[] = [
        { id: 'docNo', accessorFn: (r) => r.docNo, header: 'Belge no', meta: { mobile: 'title', className: 'font-mono' } },
        { accessorKey: 'partnerName', header: 'Tedarikçi', meta: { mobile: 'subtitle' }, cell: ({ row }) => row.original.partnerName ?? <span className="text-muted-foreground">—</span> },
        { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 140, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="receipt" /> },
        { accessorKey: 'totalValue', header: 'Toplam tutar', meta: { align: 'right', width: 140 }, cell: ({ row }) => <MoneyCell value={row.original.totalValue} /> },
        { accessorKey: 'supplierDeliveryNo', header: 'İrsaliye no', meta: { mobile: 'hidden' }, cell: ({ row }) => row.original.supplierDeliveryNo ?? '—' },
        // Bu tabloda ayrı bir "planlanan"/"audit" tarihi yok — "Tarih" tek ve birincil tarih (kardeş
        // ekranlardaki "Sevk tarihi"/"Planlanan tarih" ile eşdeğer), ama önceden ikincil/audit tarihi
        // gibi soluk gri basılıyordu — aynı veri tipi tablolar arası farklı kontrastta görünüyordu
        // (Tur 3 P2 bulgusu). Birincil tarih kuralı: normal kontrast (text-foreground).
        { accessorKey: 'createdAt', header: 'Tarih', meta: { width: 110 }, cell: ({ row }) => formatDate(row.original.createdAt) },
      ];
      if (showWarehouseColumn) {
        cols.splice(3, 0, { accessorKey: 'warehouseCode', header: 'Depo', meta: { width: 90, mobile: 'hidden' }, cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span> });
      }
      if (showLineCount) {
        cols.splice(3, 0, { accessorKey: 'lineCount', header: 'Satır', meta: { align: 'right', width: 80, mobile: 'hidden' } });
      }
      return cols;
    },
    [showWarehouseColumn, showLineCount],
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
