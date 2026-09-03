'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import type { ProductListRow } from '../queries';
import { PRODUCT_TYPE_LABELS, PRODUCT_TYPE_TONE } from '../product-labels';

export function ProductsTable({ products }: { products: ProductListRow[] }) {
  // Tüm satırlarda maliyet sıfırsa (henüz maliyetlendirilmemiş katalog) sütun hiç render edilmez —
  // yalnızca genişlik tüketen, sıfır bilgi taşıyan bir sütun bırakmamak için (segments-table'daki
  // hasContext/hasReserved deseniyle aynı: veri yoksa sütun yok).
  const hasCost = useMemo(() => products.some((p) => Number(p.averageCost) !== 0), [products]);

  const columns = useMemo<ColumnDef<ProductListRow, unknown>[]>(() => {
    const cols: ColumnDef<ProductListRow, unknown>[] = [
      {
        accessorKey: 'sku',
        header: 'SKU',
        meta: { mobile: 'subtitle', className: 'font-mono text-[12px]', width: 92 },
      },
      {
        accessorKey: 'shortCode',
        header: 'Kısa Kod',
        // Nadiren bakılır, dar ekranda taşan sütun — masaüstünde varsayılan gizli, sütun seçiciden açılır.
        meta: { mobile: 'hidden', className: 'font-mono text-[12px] text-muted-foreground', width: 120, defaultHidden: true },
        cell: ({ getValue }) => getValue<string | null>() ?? <span className="text-muted-foreground/50">—</span>,
      },
      {
        accessorKey: 'name',
        header: 'Ürün Adı',
        meta: { mobile: 'title', className: 'font-medium max-w-[220px] truncate' },
        cell: ({ getValue }) => (
          <span className="block max-w-[220px] truncate" title={getValue<string>()}>
            {getValue<string>()}
          </span>
        ),
      },
      {
        id: 'category',
        accessorFn: (r) => r.category2 ?? r.category1 ?? '',
        header: 'Kategori',
        meta: { mobile: 'hidden', width: 160 },
        cell: ({ row }) => {
          const r = row.original;
          // Yalnızca en alt seviye gösterilir; tam yol (kategori1 → 2 → 3) title'da durur.
          const leaf = r.category3 ?? r.category2 ?? r.category1;
          if (!leaf) return <span className="text-muted-foreground/50">—</span>;
          const fullPath = [r.category1, r.category2, r.category3].filter(Boolean).join(' → ');
          return (
            <span className="block truncate text-[12px] text-muted-foreground" title={fullPath}>
              {leaf}
            </span>
          );
        },
      },
      {
        accessorKey: 'type',
        header: 'Tip',
        // Tek tip katalogda (100/100 'Mamul') sütun sıfır bilgi taşır — varsayılan gizli; tip bilgisi
        // zaten üstteki faceted filtreden erişilebilir. Mobil kartta da gizli.
        meta: { mobile: 'hidden', width: 110, defaultHidden: true },
        cell: ({ getValue }) => {
          const t = getValue<string>();
          return <StatusBadge status={t} label={PRODUCT_TYPE_LABELS[t] ?? t} tone={PRODUCT_TYPE_TONE[t] ?? 'neutral'} />;
        },
      },
      {
        accessorKey: 'packaging',
        header: 'Ambalaj',
        meta: { mobile: 'hidden', width: 100 },
        cell: ({ getValue }) => getValue<string | null>() ?? <span className="text-muted-foreground/50">—</span>,
      },
      {
        accessorKey: 'barcode',
        header: 'Barkod',
        meta: { mobile: 'hidden', className: 'font-mono text-[12px] text-muted-foreground', width: 130 },
        cell: ({ getValue }) => getValue<string | null>() ?? <span className="text-muted-foreground/50">—</span>,
      },
      {
        accessorKey: 'status',
        header: 'Durum',
        // Aktif = varsayılan durum, gürültü yaratmasın diye rozet yalnızca pasif/arşiv için gösterilir.
        meta: { mobile: 'badge', width: 90 },
        cell: ({ getValue }) => {
          const s = getValue<string>();
          if (s === 'active') return <span className="inline-block size-1.5 rounded-full bg-success" aria-label="Aktif" title="Aktif" />;
          return <StatusBadge status={s} kind="product" />;
        },
      },
      {
        accessorKey: 'onHandQty',
        header: 'Eldeki Stok',
        meta: { align: 'right', width: 130 },
        cell: ({ row }) => <QtyCell value={row.original.onHandQty} uom={row.original.uomCode} />,
      },
    ];
    if (hasCost) {
      cols.push({
        accessorKey: 'averageCost',
        header: 'Birim Maliyet',
        meta: { align: 'right', width: 120 },
        cell: ({ getValue }) => <MoneyCell value={getValue<string>()} muted />,
      });
    }
    cols.push({
      accessorKey: 'listPrice',
      header: 'Satış Fiyatı',
      meta: { align: 'right', width: 120, mobile: 'hidden' },
      cell: ({ getValue }) => <MoneyCell value={getValue<string>()} muted={getValue<string>() === '0'} />,
    });
    return cols;
  }, [hasCost]);

  const filters: DataTableFilter[] = useMemo(() => {
    const cats = Array.from(new Set(products.map((p) => p.category2).filter((c): c is string => Boolean(c)))).sort((a, b) => a.localeCompare(b, 'tr-TR'));
    return [
      {
        columnId: 'type',
        title: 'Tip',
        options: Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => ({ value, label })),
      },
      {
        columnId: 'status',
        title: 'Durum',
        options: [
          { value: 'active', label: 'Aktif', tone: 'success' },
          { value: 'draft', label: 'Taslak', tone: 'muted' },
          { value: 'cancelled', label: 'Kullanım dışı', tone: 'danger' },
        ],
      },
      { columnId: 'category', title: 'Kategori', options: cats.map((c) => ({ value: c, label: c })) },
    ];
  }, [products]);

  return (
    <DataTable
      columns={columns}
      data={products}
      getRowId={(p) => p.id}
      searchPlaceholder="Ad, SKU, barkod ya da kısa kod ara…"
      filters={filters}
      initialSorting={[{ id: 'sku', desc: false }]}
      rowHref={(p) => `/ana-veri/urunler/${p.id}`}
      virtualize={products.length > 300}
      emptyTitle="Henüz ürün yok"
      emptyDescription="Excel'den içe aktarın ya da yeni bir ürün oluşturun."
    />
  );
}
