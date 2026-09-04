'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { LotBadge } from '@/components/lot-badge';
import { statusOptions } from '@/lib/status';
import { formatDateTime } from '@/lib/format';
import type { QcCheckRow } from '../queries';

const KIND_LABELS: Record<string, string> = { incoming: 'Girdi', in_process: 'Ara', final: 'Final' };

export function ChecksTable({ checks }: { checks: QcCheckRow[] }) {
  const columns = useMemo<ColumnDef<QcCheckRow, unknown>[]>(
    () => [
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'Kontrol no', meta: { mobile: 'title', className: 'font-mono' } },
      { id: 'productName', accessorFn: (r) => `${r.productName} · ${r.sku}`, header: 'Ürün', meta: { mobile: 'subtitle', flex: true } },
      { id: 'lotNo', accessorFn: (r) => r.lotNo ?? '', header: 'Lot', meta: { width: 160 }, cell: ({ row }) => <LotBadge lotNo={row.original.lotNo} id={row.original.lotId ?? undefined} /> },
      { id: 'result', accessorFn: (r) => r.result, header: 'Sonuç', meta: { width: 130, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="qc" /> },
      { id: 'kind', accessorFn: (r) => r.kind, header: 'Tür', meta: { width: 90, mobile: 'hidden' }, cell: ({ getValue }) => <span className="text-[13px] text-muted-foreground">{KIND_LABELS[getValue<string>()] ?? getValue<string>()}</span> },
      { accessorKey: 'supplierName', header: 'Tedarikçi', meta: { width: 180, mobile: 'hidden' }, cell: ({ row }) => row.original.supplierName ?? <span className="text-muted-foreground">—</span> },
      { accessorKey: 'receiptDocNo', header: 'Mal kabul', meta: { width: 140, mobile: 'hidden', className: 'font-mono' }, cell: ({ row }) => row.original.receiptDocNo ?? <span className="text-muted-foreground">—</span> },
      { id: 'createdAt', accessorFn: (r) => r.createdAt, header: 'Açılış', meta: { width: 150 }, cell: ({ row }) => formatDateTime(row.original.createdAt) },
    ],
    [],
  );

  const filters: DataTableFilter[] = [{ columnId: 'result', title: 'Sonuç', options: statusOptions('qc') }];

  return (
    <DataTable
      columns={columns}
      data={checks}
      getRowId={(r) => r.id}
      rowHref={(r) => `/kalite/kontroller/${r.id}`}
      searchPlaceholder="Kontrol no, ürün, lot, tedarikçi ara…"
      filters={filters}
      initialSorting={[{ id: 'createdAt', desc: true }]}
      emptyTitle="Henüz kalite kontrolü yok"
      emptyDescription="Mal kabulde girdi kalite kontrolü gereken bir ürün geldiğinde burada otomatik açılır."
    />
  );
}
