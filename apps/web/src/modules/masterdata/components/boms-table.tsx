'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { formatPctFixed } from '../format-pct';
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
        // Birincil tanımlayıcı (SKU'dan sonra ikinci kimlik alanı) — text-muted-foreground'dan biraz
        // daha koyu, salt "ikincil bilgi" gibi görünmesin diye (Tur 3 P1 bulgusu).
        meta: { mobile: 'subtitle', className: 'font-mono text-[12px] text-foreground/80' },
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
        // 38 satırın 38'i de "1 ADET" — sıfır varyanslı sütun, sıfır bilgi taşıyor (SQL kanıtı: Tur 3
        // P1 bulgusu). Varsayılan gizli, sütun seçiciden açılabilir.
        meta: { align: 'right', width: 100, defaultHidden: true },
        cell: ({ row }) => <QtyCell value={row.original.outputQty} uom={row.original.outputUomCode} />,
      },
      {
        accessorKey: 'expectedYieldPct',
        header: 'Verim',
        // Aynı şekilde 38/38 satır "%97" — sıfır varyans, varsayılan gizli.
        meta: { align: 'right', width: 80, mobile: 'hidden', defaultHidden: true },
        cell: ({ getValue }) => <span className="num text-muted-foreground">{formatPctFixed(getValue<string>(), 1)}</span>,
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
      searchPlaceholder="SKU ya da reçete kodu ara…"
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
