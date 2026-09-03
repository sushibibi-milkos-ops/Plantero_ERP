'use client';

import { useMemo } from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { formatDate } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import type { PaymentRow } from '../queries';

const METHOD_LABEL: Record<string, string> = {
  bank_transfer: 'Havale/EFT', cash: 'Kasa', credit_card: 'Kredi kartı', cheque: 'Çek', marketplace_payout: 'Pazaryeri', other: 'Diğer',
};

export function PaymentsTable({ payments }: { payments: PaymentRow[] }) {
  const columns = useMemo<ColumnDef<PaymentRow, unknown>[]>(
    () => [
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'No', meta: { mobile: 'title', className: 'font-mono' } },
      {
        id: 'direction', accessorFn: (r) => r.direction, header: '', meta: { width: 28, mobile: 'hidden' },
        cell: ({ row }) =>
          row.original.direction === 'inbound' ? (
            <ArrowDownLeft className="size-3.5 text-success" aria-label="Tahsilat" />
          ) : (
            <ArrowUpRight className="size-3.5 text-muted-foreground" aria-label="Ödeme" />
          ),
      },
      { accessorKey: 'partnerName', header: 'Cari', meta: { mobile: 'subtitle' } },
      { id: 'method', accessorFn: (r) => METHOD_LABEL[r.method] ?? r.method, header: 'Yöntem', meta: { width: 110, mobile: 'hidden' } },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 110, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="payment" /> },
      { accessorKey: 'amountTry', header: 'Tutar (TL)', meta: { align: 'right', width: 130 }, cell: ({ row }) => <MoneyCell value={row.original.amountTry} /> },
      {
        id: 'allocated', accessorFn: (r) => r.allocationCount, header: 'Tahsis', meta: { align: 'right', width: 90, mobile: 'hidden' },
        cell: ({ row }) => <span className="num text-xs text-muted-foreground">{row.original.allocationCount} fatura</span>,
      },
      {
        id: 'fx', accessorFn: (r) => r.fxDifference, header: 'Kur farkı', meta: { align: 'right', width: 110, mobile: 'hidden' },
        cell: ({ row }) => (Number(row.original.fxDifference) !== 0 ? <MoneyCell value={row.original.fxDifference} signed /> : <span className="text-muted-foreground/60">—</span>),
      },
      { accessorKey: 'paymentDate', header: 'Tarih', meta: { width: 110 }, cell: ({ row }) => formatDate(row.original.paymentDate) },
    ],
    [],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'status', title: 'Durum', options: statusOptions('payment') },
    { columnId: 'direction', title: 'Yön', options: [{ value: 'inbound', label: 'Tahsilat' }, { value: 'outbound', label: 'Ödeme' }] },
  ];

  return (
    <DataTable
      columns={columns}
      data={payments}
      getRowId={(r) => r.id}
      searchPlaceholder="Fatura no, cari ara…"
      filters={filters}
      initialSorting={[{ id: 'paymentDate', desc: true }]}
      emptyTitle="Henüz tahsilat/ödeme yok"
      emptyDescription="Faturaları tahsil etmek veya tedarikçi ödemesi kaydetmek için “Yeni tahsilat” ile başlayın."
    />
  );
}
