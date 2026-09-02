'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { LotBadge } from '@/components/lot-badge';
import { ExpiryBadge } from '@/components/expiry-badge';
import { QtyCell } from '@/components/qty-cell';
import { MoneyCell } from '@/components/money-cell';
import { statusOptions } from '@/lib/status';
import type { LotRow } from '../queries';

export function LotsTable({ lots }: { lots: LotRow[] }) {
  const columns = useMemo<ColumnDef<LotRow, unknown>[]>(
    () => [
      { id: 'lotNo', accessorFn: (r) => r.lotNo, header: 'Lot no', meta: { mobile: 'title' }, cell: ({ row }) => <LotBadge lotNo={row.original.lotNo} status={row.original.status} id={row.original.id} /> },
      { accessorKey: 'productName', header: 'Ürün', meta: { mobile: 'subtitle' }, cell: ({ row }) => <span>{row.original.productName} <span className="font-mono text-xs text-muted-foreground">· {row.original.sku}</span></span> },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 130, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="lot" /> },
      { accessorKey: 'onHandQty', header: 'Eldeki', meta: { align: 'right', width: 110 }, cell: ({ row }) => <QtyCell value={row.original.onHandQty} uom={row.original.uomCode} /> },
      { accessorKey: 'unitCost', header: 'Maliyet', meta: { align: 'right', width: 110, mobile: 'hidden' }, cell: ({ row }) => <MoneyCell value={row.original.unitCost} digits={4} /> },
      { accessorKey: 'locationCount', header: 'Lokasyon', meta: { align: 'right', width: 90, mobile: 'hidden' } },
      {
        accessorKey: 'expiryDate',
        header: 'SKT',
        meta: { width: 150 },
        sortingFn: (a, b) => (a.original.expiryDate ?? '').localeCompare(b.original.expiryDate ?? ''),
        cell: ({ row }) => (row.original.expiryDate ? <ExpiryBadge date={row.original.expiryDate} /> : <span className="text-xs text-muted-foreground/60">—</span>),
      },
      { accessorKey: 'supplierName', header: 'Kaynak', meta: { mobile: 'hidden' }, cell: ({ row }) => <span className="truncate text-xs text-muted-foreground">{row.original.supplierName ?? (row.original.originWorkOrderId ? 'Üretim' : '—')}</span> },
    ],
    [],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'status', title: 'Durum', options: statusOptions('lot') },
  ];

  return (
    <DataTable
      columns={columns}
      data={lots}
      getRowId={(l) => l.id}
      rowHref={(l) => `/depo/lotlar/${l.id}`}
      searchPlaceholder="Lot no, ürün ara…"
      filters={filters}
      initialSorting={[{ id: 'expiryDate', desc: false }]}
      emptyTitle="Henüz lot yok"
      emptyDescription="Mal kabul veya üretim çıktısı ile lot oluşur."
    />
  );
}
