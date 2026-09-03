'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { EmptyCell } from '@/components/empty-cell';
import { SubtleStatusBadge } from './subtle-status-badge';
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
        // Tur 4 P2: araç çubuğunda Durum filtresi vardı ama sütun `initialColumnVisibility` ile
        // gizleniyordu — kullanıcı göremediği bir sütuna göre filtreliyordu. O turda çözüm sütunu
        // varsayılan görünür yapmak, dolgusuz nokta rozeti kullanmaktı. Tur 5 P1 bulgusu: nötr tona
        // çevrilmiş olsa bile (bkz. cell aşağıda) 38/38 satır "Aktif" olduğu için sütun sıfır ayırt
        // edici bilgi taşıyor, sayfa alanını gerekçesiz tüketiyor (outputQty/expectedYieldPct'teki aynı
        // desen). Toolbar'daki facet filtre TanStack table state üzerinde çalışır, sütun görünürlüğünden
        // bağımsızdır — sütun varsayılan gizliyken de filtrelenebilir kalır, sütun seçiciden açılabilir.
        meta: { mobile: 'badge', width: 90, defaultHidden: true },
        cell: ({ getValue }) => {
          const s = getValue<string>();
          if (s === 'active') return <SubtleStatusBadge tone="muted" label={BOM_STATUS_LABELS[s] ?? s} />;
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
        // Tur 5 P1 bulgusu: seed verisinde 38/38 satır "45 dk" — sıfır varyanslı ikinci bir sütun, aynı
        // satırda Durum ile birlikte ~200px yatay alan tüketip Reçete Kodu ile Durum arası boş şerit
        // bırakıyordu. outputQty/expectedYieldPct'teki aynı desen: varsayılan gizli, gerçek varyans
        // oluştuğunda (farklı süreli reçeteler eklendiğinde) sütun seçiciden hâlâ erişilebilir kalır.
        meta: { align: 'right', width: 80, mobile: 'hidden', defaultHidden: true },
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
        // Tur 5 P1 bulgusu (partners-table.tsx ile aynı sözleşme): sıfır maliyet ile "veri yok" farklı
        // anlamlar — hesaplanmış gerçek bir sıfır değil, henüz maliyetlendirilmemiş demektir; em dash bu
        // belirsizliği çözer, soluk "₺0,00" çözmez.
        cell: ({ getValue }) => {
          const v = getValue<string>();
          return Number(v) === 0 ? <EmptyCell /> : <MoneyCell value={v} digits={2} />;
        },
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
      initialSorting={[{ id: 'sku', desc: false }]}
      rowHref={(b) => `/ana-veri/receteler/${b.id}`}
      emptyTitle="Henüz reçete yok"
      emptyDescription="Mamul veya yarı mamul bir ürün için yeni reçete oluşturun."
    />
  );
}
