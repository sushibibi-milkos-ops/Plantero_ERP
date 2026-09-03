'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { formatDate } from '@/lib/format';
import type { OpportunityCardRow } from '../queries';
import type { opportunityStages } from '@plantero/db';

export function OpportunitiesListView({ rows, stages, onOpen }: { rows: OpportunityCardRow[]; stages: Array<typeof opportunityStages.$inferSelect>; onOpen: (id: string) => void }) {
  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);

  const columns = useMemo<ColumnDef<OpportunityCardRow, unknown>[]>(
    () => [
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'No', meta: { width: 110, mobile: 'hidden', className: 'font-mono text-xs' } },
      { id: 'title', accessorFn: (r) => r.title, header: 'Başlık', meta: { mobile: 'title' } },
      { id: 'partnerName', accessorFn: (r) => r.partnerName ?? '', header: 'Cari', meta: { mobile: 'subtitle' }, cell: ({ row }) => row.original.partnerName ?? '—' },
      { id: 'stageId', accessorFn: (r) => stageById.get(r.stageId)?.name ?? r.stageId, header: 'Aşama', meta: { width: 140, mobile: 'badge' }, cell: ({ row }) => {
        const stage = stageById.get(row.original.stageId);
        return <StatusBadge status={row.original.stageId} label={stage?.name ?? '—'} tone={stage?.isWon ? 'success' : stage?.isLost ? 'danger' : 'info'} />;
      } },
      {
        // digits={0}: kanban kartıyla (opportunity-card.tsx) aynı hassasiyet — görünüm anahtarına
        // basınca aynı fırsatın tutarı "₺45.000" ↔ "₺45.000,00" arasında değişmemeli; fırsat tutarı
        // zaten tahmini bir büyüklük, kuruş hassasiyeti taşımıyor (Tur 4 P1 bulgusu). Genişlik
        // 130 → 110: ondalıksız gösterimde 130px gereğinden fazla boşluk bırakıyordu.
        id: 'expectedAmount', accessorFn: (r) => r.expectedAmount, header: 'Beklenen tutar', meta: { align: 'right', width: 110 }, cell: ({ row }) => <MoneyCell value={row.original.expectedAmount} currency={row.original.currency} digits={0} /> },
      { id: 'probability', accessorFn: (r) => r.probability, header: 'Olasılık', meta: { align: 'right', width: 90, mobile: 'hidden' }, cell: ({ row }) => `%${row.original.probability}` },
      { id: 'nextActivityDate', accessorFn: (r) => r.nextActivityDate ?? '', header: 'Sonraki aktivite', meta: { width: 130, mobile: 'hidden' }, cell: ({ row }) => (row.original.nextActivityDate ? formatDate(row.original.nextActivityDate) : '—') },
    ],
    [stageById],
  );

  const filters: DataTableFilter[] = [{ columnId: 'stageId', title: 'Aşama', options: stages.map((s) => ({ value: s.name, label: s.name })) }];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      onRowClick={(r) => onOpen(r.id)}
      searchPlaceholder="Başlık, cari ara…"
      filters={filters}
      emptyTitle="Henüz fırsat yok"
    />
  );
}
