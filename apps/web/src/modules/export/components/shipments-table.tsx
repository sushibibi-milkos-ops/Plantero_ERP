'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
import type { ShipmentRow } from '../queries';

const REGIME_LABEL: Record<string, string> = { standard: 'Standart', etgb: 'ETGB' };

export function ShipmentsTable({ shipments }: { shipments: ShipmentRow[] }) {
  const columns = useMemo<ColumnDef<ShipmentRow, unknown>[]>(
    () => [
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'Sevkiyat no', meta: { mobile: 'title', className: 'font-mono' } },
      { accessorKey: 'partnerName', header: 'Müşteri', meta: { mobile: 'subtitle' } },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 140, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="export" /> },
      { accessorKey: 'destinationCountry', header: 'Ülke', meta: { width: 70 } },
      { id: 'regime', accessorFn: (r) => r.regime, header: 'Rejim', meta: { width: 90 }, cell: ({ getValue }) => <span className="text-[13px] text-muted-foreground">{REGIME_LABEL[getValue<string>()] ?? getValue<string>()}</span> },
      {
        id: 'docs', accessorFn: (r) => (r.docsTotal === 0 ? 0 : r.docsDone / r.docsTotal), header: 'Belgeler', meta: { width: 90, mobile: 'hidden' },
        cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{row.original.docsDone}/{row.original.docsTotal}</span>,
      },
      { accessorKey: 'amountTry', header: 'Tutar (₺)', meta: { align: 'right', width: 130 }, cell: ({ row }) => <MoneyCell value={row.original.amountTry} /> },
      { id: 'proformaAmount', accessorFn: (r) => r.proformaAmount, header: 'Tutar (döviz)', meta: { align: 'right', width: 130, mobile: 'hidden' }, cell: ({ row }) => <MoneyCell value={row.original.proformaAmount} currency={row.original.currency} /> },
      { accessorKey: 'etd', header: 'ETD', meta: { width: 100, mobile: 'hidden' }, cell: ({ row }) => (row.original.etd ? formatDate(row.original.etd) : <span className="text-muted-foreground">—</span>) },
      { accessorKey: 'createdAt', header: 'Oluşturma', meta: { width: 110 }, cell: ({ row }) => formatDate(row.original.createdAt) },
    ],
    [],
  );

  const filters: DataTableFilter[] = [{ columnId: 'status', title: 'Durum', options: statusOptions('export') }];

  return (
    <DataTable
      columns={columns}
      data={shipments}
      getRowId={(r) => r.id}
      rowHref={(r) => `/ihracat/sevkiyatlar/${r.id}`}
      searchPlaceholder="Sevkiyat no, müşteri ara…"
      filters={filters}
      initialSorting={[{ id: 'createdAt', desc: true }]}
      emptyTitle="Henüz ihracat sevkiyatı yok"
      emptyDescription="İhracat siparişinden yeni bir sevkiyat açın."
    />
  );
}
