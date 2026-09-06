'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { LotBadge } from '@/components/lot-badge';
import { statusOptions } from '@/lib/status';
import { formatDateTime } from '@/lib/format';
import type { RecallRow } from '../queries';

export function RecallsTable({ recalls }: { recalls: RecallRow[] }) {
  const columns = useMemo<ColumnDef<RecallRow, unknown>[]>(
    () => [
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'Geri çağırma no', meta: { mobile: 'title', className: 'font-mono' } },
      { id: 'lot', accessorFn: (r) => `${r.productName} · ${r.lotNo}`, header: 'Ürün / Lot', meta: { mobile: 'subtitle', flex: true }, cell: ({ row }) => <span>{row.original.productName} <LotBadge lotNo={row.original.lotNo} className="ml-1" /></span> },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 130, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="recall" /> },
      { accessorKey: 'reason', header: 'Gerekçe', meta: { mobile: 'hidden', width: 320 }, cell: ({ row }) => <span className="inline-block max-w-full truncate align-bottom text-[13px] text-muted-foreground md:w-[296px]" title={row.original.reason}>{row.original.reason}</span> },
      { id: 'createdAt', accessorFn: (r) => r.createdAt, header: 'Oluşturulma', meta: { width: 150 }, cell: ({ row }) => formatDateTime(row.original.createdAt) },
    ],
    [],
  );

  const filters = [{ columnId: 'status', title: 'Durum', options: statusOptions('recall') }];

  return (
    <DataTable
      columns={columns}
      data={recalls}
      getRowId={(r) => r.id}
      rowHref={(r) => `/kalite/geri-cagirma/${r.id}`}
      searchPlaceholder="Geri çağırma no, lot ara…"
      filters={filters}
      initialSorting={[{ id: 'createdAt', desc: true }]}
      emptyTitle="Henüz geri çağırma yok"
      emptyDescription="Bir lot için etkiyi simüle edip gerekiyorsa geri çağırmayı başlatın."
    />
  );
}
