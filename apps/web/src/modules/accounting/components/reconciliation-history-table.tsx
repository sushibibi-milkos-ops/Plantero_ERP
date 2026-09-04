'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatDateTime } from '@/lib/format';
import { SignedAmount } from './signed-amount';
import type { ReconciliationHistoryRow } from '../queries';

const KIND_LABELS: Record<string, string> = {
  invoice: 'Fatura', partner_on_account: 'Cari avans', loan_installment: 'Kredi taksiti', expense: 'Gider', fee: 'Banka masrafı',
  marketplace_payout: 'Pazaryeri hakedişi', transfer: 'Transfer', tax: 'Vergi', unknown: 'Bilinmiyor',
};

export function ReconciliationHistoryTable({ rows }: { rows: ReconciliationHistoryRow[] }) {
  const columns = useMemo<ColumnDef<ReconciliationHistoryRow, unknown>[]>(
    () => [
      // width + inline-block truncate: aynı kök neden (banka/yevmiye tabloları) — genişliksiz `flex`
      // sütunu uzun banka ekstresi açıklamalarında taşabilir.
      { accessorKey: 'description', header: 'Açıklama', meta: { mobile: 'title', flex: true, width: 300 }, cell: ({ row }) => <span className="inline-block max-w-full truncate align-bottom md:w-[276px]" title={row.original.description}>{row.original.description}</span> },
      { id: 'kind', accessorFn: (r) => KIND_LABELS[r.kind] ?? r.kind, header: 'Tür', meta: { width: 130 } },
      // `signed` kaldırıldı (muhasebe-banka-01/muhasebe-mutabakat-03 ile aynı kök neden): mutabakat
      // geçmişinde tutar bir sayım farkı değil, banka hareketinin normal yönüdür.
      { accessorKey: 'amount', header: 'Tutar', meta: { align: 'right', width: 120 }, cell: ({ row }) => <SignedAmount value={row.original.amount} /> },
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
