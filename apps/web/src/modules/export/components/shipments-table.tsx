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
      { accessorKey: 'destinationCountry', header: 'Ülke', meta: { width: 56 } },
      { id: 'regime', accessorFn: (r) => r.regime, header: 'Rejim', meta: { width: 72 }, cell: ({ getValue }) => <span className="text-[13px] text-muted-foreground">{REGIME_LABEL[getValue<string>()] ?? getValue<string>()}</span> },
      {
        id: 'docs', accessorFn: (r) => (r.docsTotal === 0 ? 0 : r.docsDone / r.docsTotal), header: 'Belgeler', meta: { width: 72, mobile: 'hidden' },
        cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{row.original.docsDone}/{row.original.docsTotal}</span>,
      },
      { id: 'proformaAmount', accessorFn: (r) => r.proformaAmount, header: 'Tutar (döviz)', meta: { align: 'right', width: 120, mobile: 'hidden' }, cell: ({ row }) => <MoneyCell value={row.original.proformaAmount} currency={row.original.currency} /> },
      // `etd`/`createdAt`: mobil kartta `rest` alanı SAYILMASIN diye `mobile:'meta'` (mobile-cards.tsx —
      // aksi halde `rest`in SONUNCUSU (en "parasal" alan sayılır) `createdAt` olur ve tutar hiç
      // görünmezdi, ihracat-sevk-02 kök nedeni). `amountTry` artık `rest`teki TEK/son alan.
      { accessorKey: 'etd', header: 'ETD', meta: { width: 96, mobile: 'meta' }, cell: ({ row }) => (row.original.etd ? formatDate(row.original.etd) : <span className="text-muted-foreground">—</span>) },
      { accessorKey: 'createdAt', header: 'Oluşturma', meta: { width: 96, mobile: 'meta' }, cell: ({ row }) => formatDate(row.original.createdAt) },
      { accessorKey: 'amountTry', header: 'Tutar (₺)', meta: { align: 'right', width: 120 }, cell: ({ row }) => <MoneyCell value={row.original.amountTry} /> },
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
