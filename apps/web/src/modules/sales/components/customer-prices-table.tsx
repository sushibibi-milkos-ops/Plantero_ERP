'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { formatDate } from '@/lib/format';
import type { listCustomerPrices } from '../queries';

type Row = Awaited<ReturnType<typeof listCustomerPrices>>[number];

export function CustomerPricesTable({ rows }: { rows: Row[] }) {
  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      { id: 'partnerName', accessorFn: (r) => r.partnerName, header: 'Müşteri', meta: { mobile: 'title' } },
      { id: 'productName', accessorFn: (r) => r.productName, header: 'Ürün', meta: { mobile: 'subtitle' }, cell: ({ row }) => (
        <div>
          <div>{row.original.productName}</div>
          <div className="font-mono text-xs text-muted-foreground">{row.original.sku}</div>
        </div>
      ) },
      { id: 'minQty', header: 'Min. miktar', meta: { align: 'right', width: 110 }, cell: ({ row }) => <QtyCell value={row.original.row.minQty} /> },
      { id: 'price', header: 'Fiyat', meta: { align: 'right', width: 120, mobile: 'row' }, cell: ({ row }) => <MoneyCell value={row.original.row.price} currency={row.original.row.currency} /> },
      { id: 'approvedByName', accessorFn: (r) => r.approvedByName ?? '—', header: 'Onaylayan', meta: { mobile: 'hidden' } },
      { id: 'validTo', header: 'Geçerlilik', meta: { mobile: 'hidden' }, cell: ({ row }) => (row.original.row.validTo ? `→ ${formatDate(row.original.row.validTo)}` : 'Süresiz') },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.row.id}
      searchPlaceholder="Müşteri, ürün ara…"
      emptyTitle="Müşteriye özel fiyat yok"
      emptyDescription="Bir müşteri için özel fiyat tanımlamak üzere yukarıdan ekleyin."
    />
  );
}
