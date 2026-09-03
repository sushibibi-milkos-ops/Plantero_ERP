'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { LotBadge } from '@/components/lot-badge';
import { ExpiryBadge } from '@/components/expiry-badge';
import { QtyCell } from '@/components/qty-cell';
import { MoneyCell } from '@/components/money-cell';
import { statusOptions } from '@/lib/status';
import type { LotRow } from '../queries';

export function LotsTable({ lots }: { lots: LotRow[] }) {
  const columns = useMemo<ColumnDef<LotRow, unknown>[]>(
    () => [
      { id: 'lotNo', accessorFn: (r) => r.lotNo, header: 'Lot no', meta: { mobile: 'title' }, cell: ({ row }) => <LotBadge lotNo={row.original.lotNo} status={row.original.status} id={row.original.id} /> },
      { accessorKey: 'productName', header: 'Ürün', meta: { mobile: 'subtitle' }, cell: ({ row }) => <span>{row.original.productName} <span className="font-mono text-xs text-muted-foreground">· {row.original.sku}</span></span> },
      {
        id: 'status',
        accessorFn: (r) => r.status,
        header: 'Durum',
        meta: { width: 96, mobile: 'badge' },
        // Linear kuralı: renk yalnızca istisna taşır — ama başlığı olan bir sütun asla içeriksiz kalamaz
        // (Tur 3 P0: "Durum" boş hücreyle 195/200 satırda render ediliyordu, ~230px genişlik hiç bilgi
        // taşımadan gidiyordu). `released` artık sessiz/nötr bir rozet alır (bg-muted, dolgusuz nokta
        // yok sayılacak kadar düşük kontrast) — karantina/red gibi gerçek istisnalar hâlâ renkli
        // (warning/danger) kalıp göze çarpar, yalnızca "normal" durum bağırmayı bırakır.
        cell: ({ getValue }) => {
          const status = getValue<string>();
          return status === 'released' ? (
            <StatusBadge status={status} kind="lot" tone="muted" size="sm" className="h-5 text-[11px]" />
          ) : (
            <StatusBadge status={status} kind="lot" />
          );
        },
      },
      // Lokasyon/Durum/Maliyet mobilde hiç yoktu (Tur 3 P1 bulgusu) — masaüstünde değişiklik yok,
      // mobilde etiketli tek meta satırında toplanır (kart yüksekliği önceki dl grid'ine göre belirgin
      // şekilde iner). Durum zaten ayrı bir rozet (badge) olarak üstte gösteriliyor.
      {
        accessorKey: 'onHandQty',
        header: 'Eldeki',
        meta: { align: 'right', width: 110, mobile: 'meta' },
        cell: ({ row }) => (
          <>
            <span className="hidden md:inline-flex"><QtyCell value={row.original.onHandQty} uom={row.original.uomCode} /></span>
            <span className="inline-flex items-baseline gap-1 md:hidden">
              <span className="text-muted-foreground/70">Eldeki</span>
              <QtyCell value={row.original.onHandQty} uom={row.original.uomCode} />
            </span>
          </>
        ),
      },
      {
        accessorKey: 'unitCost',
        header: 'Maliyet',
        meta: { align: 'right', width: 110, mobile: 'meta' },
        cell: ({ row }) => (
          <>
            <span className="hidden md:inline-flex"><MoneyCell value={row.original.unitCost} /></span>
            <span className="inline-flex items-baseline gap-1 md:hidden">
              <span className="text-muted-foreground/70">Maliyet</span>
              <MoneyCell value={row.original.unitCost} />
            </span>
          </>
        ),
      },
      {
        accessorKey: 'locationCount',
        header: 'Lokasyon',
        meta: { width: 150, mobile: 'meta' },
        // Önceki sürüm başlığı "Lokasyon" iken değeri lokasyon SAYISI ("1"/"2") gösteriyordu — kullanıcı
        // bunu raf kodu sanıyordu (kardeş ekran /depo/skt gerçek kodu gösterir, çelişki yaratıyordu).
        // Tek lokasyonlu lotlarda gerçek kod, çok lokasyonlularda "<kod> +N" gösterilir.
        cell: ({ row }) => {
          const { firstLocationCode, locationCount } = row.original;
          if (!firstLocationCode) return <span className="text-xs text-muted-foreground/60">—</span>;
          return (
            <span className="font-mono text-xs">
              {firstLocationCode}
              {locationCount > 1 ? <span className="text-muted-foreground"> +{locationCount - 1}</span> : null}
            </span>
          );
        },
      },
      {
        accessorKey: 'expiryDate',
        header: 'SKT',
        // stock-table.tsx'teki aynı kök nedenle (Tur 3 P1) — geçmiş SKT'li lotlarda "N gün önce doldu ·
        // dd.MM.yyyy" 150px'te kırpılıyordu; masaüstünde 228px'e genişletildi. Mobilde (SKT kartta hiç
        // yoktu) sağ üstte kısa rozet olarak (`showDate={false}`) gösterilir.
        meta: { width: 228, mobile: 'badge' },
        sortingFn: (a, b) => (a.original.expiryDate ?? '').localeCompare(b.original.expiryDate ?? ''),
        cell: ({ row }) =>
          row.original.expiryDate ? (
            <>
              <span className="hidden md:inline-flex"><ExpiryBadge date={row.original.expiryDate} /></span>
              <span className="md:hidden"><ExpiryBadge date={row.original.expiryDate} showDate={false} /></span>
            </>
          ) : (
            <span className="hidden text-xs text-muted-foreground/60 md:inline">—</span>
          ),
      },
      { accessorKey: 'supplierName', header: 'Kaynak', meta: { mobile: 'hidden' }, cell: ({ row }) => <span className="truncate text-xs text-muted-foreground">{row.original.supplierName ?? (row.original.originWorkOrderId ? 'Üretim' : '—')}</span> },
    ],
    [],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'status', title: 'Durum', options: statusOptions('lot') },
  ];

  return (
    <DataTable
      columns={columns}
      data={lots}
      getRowId={(l) => l.id}
      rowHref={(l) => `/depo/lotlar/${l.id}`}
      searchPlaceholder="Lot no, ürün ara…"
      filters={filters}
      initialSorting={[{ id: 'expiryDate', desc: false }]}
      initialColumnVisibility={{ supplierName: false }}
      emptyTitle="Henüz lot yok"
      emptyDescription="Mal kabul veya üretim çıktısı ile lot oluşur."
    />
  );
}
