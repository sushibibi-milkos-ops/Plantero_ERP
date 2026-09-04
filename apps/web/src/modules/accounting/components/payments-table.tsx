'use client';

import { useMemo } from 'react';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Undo2 } from 'lucide-react';
import { DataTable, type ColumnDef, type DataTableFilter, type RowAction } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
import { unapplyAccountingPaymentAction } from '../actions';
import type { AccountingPaymentRow } from '../queries';

const METHOD_LABELS: Record<string, string> = { bank_transfer: 'Havale/EFT', cash: 'Kasa', credit_card: 'Kredi kartı', cheque: 'Çek', marketplace_payout: 'Pazaryeri', other: 'Diğer' };

export function PaymentsTable({ rows, canManage }: { rows: AccountingPaymentRow[]; canManage: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  async function unapply(id: string, docNo: string) {
    const res = await unapplyAccountingPaymentAction({ id });
    if (res.ok) {
      toast.success(`${docNo} geri alındı`);
      startTransition(() => router.refresh());
    } else {
      toast.error(res.error);
    }
  }

  const columns = useMemo<ColumnDef<AccountingPaymentRow, unknown>[]>(
    () => [
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'Belge no', meta: { mobile: 'title', className: 'font-mono' } },
      { accessorKey: 'partnerName', header: 'Cari', meta: { mobile: 'subtitle' } },
      { id: 'direction', accessorFn: (r) => r.direction, header: 'Yön', meta: { width: 110 }, cell: ({ row }) => <span className={row.original.direction === 'inbound' ? 'text-success' : 'text-muted-foreground'}>{row.original.direction === 'inbound' ? 'Tahsilat' : 'Ödeme'}</span> },
      { id: 'method', accessorFn: (r) => METHOD_LABELS[r.method] ?? r.method, header: 'Yöntem', meta: { width: 120, mobile: 'hidden' } },
      { accessorKey: 'amountTry', header: 'Tutar (₺)', meta: { align: 'right', width: 130 }, cell: ({ row }) => <MoneyCell value={row.original.amountTry} /> },
      { accessorKey: 'unallocatedAmount', header: 'Tahsissiz', meta: { align: 'right', width: 110, mobile: 'hidden' }, cell: ({ row }) => <MoneyCell value={row.original.unallocatedAmount} currency={row.original.currency} muted={Number(row.original.unallocatedAmount) <= 0} /> },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 110, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="payment" /> },
      { accessorKey: 'paymentDate', header: 'Tarih', meta: { width: 110 }, cell: ({ row }) => formatDate(row.original.paymentDate) },
    ],
    [],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'status', title: 'Durum', options: statusOptions('payment') },
    { columnId: 'direction', title: 'Yön', options: [{ value: 'inbound', label: 'Tahsilat' }, { value: 'outbound', label: 'Ödeme' }] },
  ];

  const rowActions: (row: AccountingPaymentRow) => RowAction<AccountingPaymentRow>[] = (row) =>
    canManage && row.status === 'posted'
      ? [{ label: 'Geri al', icon: Undo2, destructive: true, onSelect: () => unapply(row.id, row.docNo) }]
      : [];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      searchPlaceholder="Belge no, cari ara…"
      filters={filters}
      initialSorting={[{ id: 'paymentDate', desc: true }]}
      rowActions={canManage ? rowActions : undefined}
      emptyTitle="Henüz tahsilat/ödeme yok"
      emptyDescription="Yeni tahsilat/ödeme kaydedin."
    />
  );
}
