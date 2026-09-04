'use client';

import { useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { EyeOff } from 'lucide-react';
import { DataTable, type ColumnDef, type DataTableFilter, type RowAction } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
import { ignoreBankTransactionAction } from '../actions';
import type { BankTransactionRow } from '../queries';

export function BankTransactionsTable({ rows }: { rows: BankTransactionRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  async function ignore(id: string) {
    const res = await ignoreBankTransactionAction({ bankTransactionId: id });
    if (res.ok) {
      toast.success('Hareket mutabakat dışı bırakıldı');
      startTransition(() => router.refresh());
    } else {
      toast.error(res.error);
    }
  }

  const columns = useMemo<ColumnDef<BankTransactionRow, unknown>[]>(
    () => [
      { accessorKey: 'txDate', header: 'Tarih', meta: { width: 110, mobile: 'meta' }, cell: ({ row }) => formatDate(row.original.txDate) },
      { accessorKey: 'description', header: 'Açıklama', meta: { mobile: 'title', flex: true }, cell: ({ row }) => (
        <div>
          <div>{row.original.description}</div>
          {row.original.counterpartyName ? <div className="text-[12px] text-muted-foreground">{row.original.counterpartyName}</div> : null}
        </div>
      ) },
      { accessorKey: 'bankAccountCode', header: 'Hesap', meta: { width: 110, mobile: 'hidden' } },
      { accessorKey: 'amount', header: 'Tutar', meta: { align: 'right', width: 130 }, cell: ({ row }) => <MoneyCell value={row.original.amount} currency={row.original.currency} signed /> },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 120, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="bank_tx" /> },
    ],
    [],
  );

  const filters: DataTableFilter[] = [{ columnId: 'status', title: 'Durum', options: statusOptions('bank_tx') }];

  const rowActions = (row: BankTransactionRow): RowAction<BankTransactionRow>[] => {
    const actions: RowAction<BankTransactionRow>[] = [];
    if (row.status === 'suggested') actions.push({ label: 'Mutabakatta incele', href: '/muhasebe/mutabakat' });
    if (row.status === 'unmatched' || row.status === 'suggested') actions.push({ label: 'Yok say', icon: EyeOff, destructive: true, onSelect: () => ignore(row.id) });
    return actions;
  };

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      searchPlaceholder="Açıklama, karşı taraf ara…"
      filters={filters}
      initialSorting={[{ id: 'txDate', desc: true }]}
      rowActions={rowActions}
      emptyTitle="Henüz banka hareketi yok"
      emptyDescription="Ekstre içe aktarın."
    />
  );
}
