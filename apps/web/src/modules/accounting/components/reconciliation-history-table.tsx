'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { formatDateTime } from '@/lib/format';
import type { ReconciliationHistoryRow } from '../queries';

const KIND_LABELS: Record<string, string> = {
  invoice: 'Fatura', partner_on_account: 'Cari avans', loan_installment: 'Kredi taksiti', expense: 'Gider', fee: 'Banka masrafı',
  marketplace_payout: 'Pazaryeri hakedişi', transfer: 'Transfer', tax: 'Vergi', unknown: 'Bilinmiyor',
};

export function ReconciliationHistoryTable({ rows }: { rows: ReconciliationHistoryRow[] }) {
  const columns = useMemo<ColumnDef<ReconciliationHistoryRow, unknown>[]>(
    () => [
      { accessorKey: 'description', header: 'Açıklama', meta: { mobile: 'title', flex: true } },
      { id: 'kind', accessorFn: (r) => KIND_LABELS[r.kind] ?? r.kind, header: 'Tür', meta: { width: 130 } },
      { accessorKey: 'amount', header: 'Tutar', meta: { align: 'right', width: 120 }, cell: ({ row }) => <MoneyCell value={row.original.amount} signed /> },
      { id: 'confidence', accessorFn: (r) => Number(r.confidence), header: 'Güven', meta: { align: 'right', width: 90 }, cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums text-muted-foreground">%{Math.round(Number(row.original.confidence) * 100)}</span> },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 120, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="recon_match" /> },
      { accessorKey: 'decidedAt', header: 'Karar zamanı', meta: { width: 160, mobile: 'hidden' }, cell: ({ row }) => (row.original.decidedAt ? formatDateTime(row.original.decidedAt) : '—') },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      searchable={false}
      pagination={false}
      initialSorting={[{ id: 'decidedAt', desc: true }]}
      emptyTitle="Henüz karar verilmiş mutabakat yok"
    />
  );
}
