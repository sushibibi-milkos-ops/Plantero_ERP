'use client';

import { useMemo } from 'react';
import { Eye } from 'lucide-react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import type { BomListRow } from '../queries';
import { BOM_STATUS_LABELS } from '../product-labels';

export function BomsTable({ boms }: { boms: BomListRow[] }) {
  const columns = useMemo<ColumnDef<BomListRow, unknown>[]>(
    () => [
      { accessorKey: 'sku', header: 'SKU', meta: { className: 'font-mono text-[12px]', width: 104 } },
      { accessorKey: 'productName', header: 'Ürün', meta: { mobile: 'title', className: 'font-medium' } },
      { accessorKey: 'code', header: 'Reçete Kodu', meta: { mobile: 'subtitle', className: 'font-mono text-[12px] text-muted-foreground' } },
      { accessorKey: 'version', header: 'Versiyon', meta: { width: 90 }, cell: ({ getValue }) => `v${getValue<number>()}` },
      {
        accessorKey: 'status',
        header: 'Durum',
        meta: { mobile: 'badge', width: 100 },
        cell: ({ getValue }) => {
          const s = getValue<string>();
          return <StatusBadge status={s} label={BOM_STATUS_LABELS[s] ?? s} kind="bom" />;
        },
      },
      {
        accessorKey: 'outputQty',
        header: 'Çıktı',
        meta: { align: 'right', width: 110 },
        cell: ({ row }) => <QtyCell value={row.original.outputQty} uom={row.original.outputUomCode} />,
      },
      {
        accessorKey: 'unitCost',
        header: 'Birim Maliyet',
        meta: { align: 'right', width: 120 },
        cell: ({ getValue }) => <MoneyCell value={getValue<string>()} digits={2} />,
      },
    ],
    [],
  );

  const filters: DataTableFilter[] = [
    {
      columnId: 'status',
      title: 'Durum',
      options: Object.entries(BOM_STATUS_LABELS).map(([value, label]) => ({ value, label })),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={boms}
      getRowId={(b) => b.id}
      searchPlaceholder="SKU, ürün adı ya da reçete kodu ara…"
      filters={filters}
      initialSorting={[{ id: 'sku', desc: false }]}
      rowHref={(b) => `/ana-veri/receteler/${b.id}`}
      emptyTitle="Henüz reçete yok"
      emptyDescription="Mamul veya yarı mamul bir ürün için yeni reçete oluşturun."
      rowActions={(b) => [{ label: 'Görüntüle', icon: Eye, href: `/ana-veri/receteler/${b.id}` }]}
    />
  );
}
