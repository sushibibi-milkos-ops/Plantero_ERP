'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { formatQty } from '@/lib/format';
import { D } from '@plantero/core';
import type { getShipmentDetail } from '../queries';

type OrderLines = NonNullable<Awaited<ReturnType<typeof getShipmentDetail>>>['orderLines'];
type OrderLineRow = OrderLines[number];

/**
 * Sevkiyata bağlı siparişin satırları — paylaşılan `DataTable` üzerinden (Tur 1 P1 kök neden
 * düzeltmesi, ihracat-detay-02/05: elle yazılmış `<table>` UPPERCASE başlık + kapalı kutu çerçevesi
 * taşıyordu, aynı sayfadaki "Belgeler" sekmesinin `DataTable`'ından anatomi olarak sapıyordu).
 * Satır sayısı tipik olarak tek haneli olduğundan arama/sayfalama gösterilmez.
 */
export function OrderLinesTable({ lines, currency }: { lines: OrderLines; currency?: string | null }) {
  const columns = useMemo<ColumnDef<OrderLineRow, unknown>[]>(
    () => [
      {
        id: 'product', accessorFn: (r) => r.productName, header: 'Ürün', meta: { mobile: 'title' },
        cell: ({ row }) => <span className="font-medium">{row.original.productName}</span>,
      },
      { id: 'sku', accessorFn: (r) => r.sku, header: 'SKU', meta: { width: 120, className: 'font-mono text-xs text-muted-foreground', mobile: 'subtitle' } },
      {
        id: 'qty', accessorFn: (r) => r.line.qty, header: 'Miktar', meta: { align: 'right', width: 110, mobile: 'meta' },
        cell: ({ row }) => <span className="font-mono tabular-nums">{formatQty(row.original.line.qty, row.original.uomCode)}</span>,
      },
      {
        id: 'deliveredQty', accessorFn: (r) => r.line.deliveredQty, header: 'Sevk edilen', meta: { align: 'right', width: 110, mobile: 'hidden' },
        cell: ({ row }) => {
          const full = D(row.original.line.deliveredQty).gte(D(row.original.line.qty));
          return <span className={`font-mono tabular-nums ${full ? 'text-success' : 'text-muted-foreground'}`}>{formatQty(row.original.line.deliveredQty)}</span>;
        },
      },
      {
        id: 'unitPrice', accessorFn: (r) => r.line.unitPrice, header: 'Birim fiyat', meta: { align: 'right', width: 120, mobile: 'hidden' },
        cell: ({ row }) => <MoneyCell value={row.original.line.unitPrice} currency={currency ?? undefined} />,
      },
      {
        id: 'lineTotal', accessorFn: (r) => r.line.lineTotal, header: 'Tutar', meta: { align: 'right', width: 130 },
        cell: ({ row }) => <MoneyCell value={row.original.line.lineTotal} currency={currency ?? undefined} />,
      },
    ],
    [currency],
  );

  if (lines.length === 0) return <EmptyState compact title="Sipariş bulunamadı" />;

  return (
    <DataTable
      columns={columns}
      data={lines}
      getRowId={(r) => r.line.id}
      searchable={false}
      columnToggle={false}
      pagination={false}
      emptyTitle="Sipariş bulunamadı"
    />
  );
}
