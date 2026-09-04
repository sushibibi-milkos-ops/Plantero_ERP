'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import type { QcTemplateRow } from '../queries';

const TYPE_LABELS: Record<string, string> = { raw_material: 'Hammadde', packaging: 'Ambalaj', semi_finished: 'Yarı mamul', finished: 'Mamul', merchandise: 'Ticari mal' };

export function TemplatesTable({ templates }: { templates: QcTemplateRow[] }) {
  const columns = useMemo<ColumnDef<QcTemplateRow, unknown>[]>(
    () => [
      { id: 'code', accessorFn: (r) => r.code, header: 'Kod', meta: { mobile: 'title', className: 'font-mono' } },
      { accessorKey: 'name', header: 'Ad', meta: { mobile: 'subtitle', flex: true } },
      { id: 'scope', accessorFn: (r) => r.productName ?? r.productType ?? '', header: 'Kapsam', meta: { width: 180 }, cell: ({ row }) => row.original.productName ?? (row.original.productType ? TYPE_LABELS[row.original.productType] ?? row.original.productType : <span className="text-muted-foreground">Tümü</span>) },
      { accessorKey: 'itemCount', header: 'Kalem', meta: { align: 'right', width: 80 }, cell: ({ row }) => <span className="num">{row.original.itemCount}</span> },
      { id: 'isActive', accessorFn: (r) => r.isActive, header: 'Durum', meta: { width: 110, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<boolean>() ? 'active' : 'inactive'} /> },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={templates}
      getRowId={(r) => r.id}
      rowHref={(r) => `/kalite/sablonlar/${r.id}`}
      searchPlaceholder="Kod, ad ara…"
      emptyTitle="Henüz kalite şablonu yok"
      emptyDescription="Yeni şablon oluşturup kontrol kalemlerini tanımlayın."
    />
  );
}
