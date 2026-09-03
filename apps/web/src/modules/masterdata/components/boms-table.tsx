'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { formatPct } from '@/lib/format';
import type { BomListRow } from '../queries';
import { BOM_STATUS_LABELS } from '../product-labels';

export function BomsTable({ boms }: { boms: BomListRow[] }) {
  const columns = useMemo<ColumnDef<BomListRow, unknown>[]>(
    () => [
      { accessorKey: 'sku', header: 'SKU', meta: { className: 'font-mono text-[12px]', width: 104 } },
      { accessorKey: 'productName', header: 'Ürün', meta: { mobile: 'title', className: 'font-medium' } },
      {
        accessorKey: 'code',
        header: 'Reçete Kodu',
        meta: { mobile: 'subtitle', className: 'font-mono text-[12px] text-muted-foreground' },
      },
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
        meta: { align: 'right', width: 100 },
        cell: ({ row }) => <QtyCell value={row.original.outputQty} uom={row.original.outputUomCode} />,
      },
      {
        accessorKey: 'expectedYieldPct',
        header: 'Verim',
        meta: { align: 'right', width: 80, mobile: 'hidden' },
        cell: ({ getValue }) => <span className="num text-muted-foreground">{formatPct(getValue<string>())}</span>,
      },
      {
        accessorKey: 'cycleMinutes',
        header: 'Çevrim',
        meta: { align: 'right', width: 80, mobile: 'hidden' },
        cell: ({ getValue }) => {
          const v = getValue<number | null>();
          return v ? <span className="num text-muted-foreground">{v} dk</span> : <span className="text-muted-foreground/50">—</span>;
        },
      },
      {
        accessorKey: 'lineCount',
        header: 'Bileşen',
        meta: { align: 'right', width: 80, mobile: 'hidden' },
        cell: ({ getValue }) => <span className="num text-muted-foreground">{getValue<number>()}</span>,
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
      // Durum neredeyse hep "Aktif" — sütun gürültüsü olmasın diye varsayılan gizli, filtre çipinden erişilir.
      initialColumnVisibility={{ status: false }}
      initialSorting={[{ id: 'sku', desc: false }]}
      rowHref={(b) => `/ana-veri/receteler/${b.id}`}
      emptyTitle="Henüz reçete yok"
      emptyDescription="Mamul veya yarı mamul bir ürün için yeni reçete oluşturun."
    />
  );
}
