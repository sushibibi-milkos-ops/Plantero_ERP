'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { LotBadge } from '@/components/lot-badge';
import { ExpiryBadge } from '@/components/expiry-badge';
import { QtyCell } from '@/components/qty-cell';
import type { getDeliveryDetail } from '../queries';

type DeliveryDetail = NonNullable<Awaited<ReturnType<typeof getDeliveryDetail>>>;
type DeliveryLineRow = DeliveryDetail['lines'][number];

/**
 * Sevkiyat detay satır tablosu. `DataTable` client bileşenidir — sütun/hücre tanımları (fonksiyon
 * içeren) bir server component'ten doğrudan prop olarak geçilemez (RSC serileştirme hatası: "Functions
 * cannot be passed directly to Client Components"). Bu yüzden diğer modül tabloları (deliveries-table.tsx
 * vb.) gibi kendi 'use client' sarmalayıcısında tanımlanır; sayfa yalnızca serileştirilebilir veri geçer.
 *
 * Liste sayfalarıyla aynı tablo dili: kutulu `<Table>` yerine `DataTable` — mobilde otomatik kart
 * görünümüne düşer, masaüstünde `scroll-fade-x` ile kaydırma ipucu verir (Tur 3 P0/P1 bulguları).
 */
export function DeliveryLinesTable({ lines }: { lines: DeliveryLineRow[] }) {
  const columns = useMemo<ColumnDef<DeliveryLineRow, unknown>[]>(
    () => [
      { id: 'productName', accessorFn: (r) => r.productName, header: 'Ürün', meta: { mobile: 'title' }, cell: ({ row }) => <span className="font-medium">{row.original.productName}</span> },
      { id: 'sku', accessorFn: (r) => r.sku, header: 'SKU', meta: { mobile: 'subtitle', className: 'font-mono text-xs text-muted-foreground' } },
      { id: 'qty', accessorFn: (r) => r.line.qty, header: 'Talep', meta: { align: 'right', width: 100 }, cell: ({ row }) => <QtyCell value={row.original.line.qty} uom={row.original.uomCode} /> },
      { id: 'pickedQty', accessorFn: (r) => r.line.pickedQty, header: 'Toplanan', meta: { align: 'right', width: 100 }, cell: ({ row }) => <QtyCell value={row.original.line.pickedQty} uom={row.original.uomCode} /> },
      {
        id: 'lot',
        accessorFn: (r) => r.lotNo,
        header: 'Lot',
        meta: { mobile: 'badge' },
        cell: ({ row }) => (row.original.lotNo ? <LotBadge lotNo={row.original.lotNo} status={row.original.lotStatus} id={row.original.line.lotId ?? undefined} /> : <span className="text-xs text-muted-foreground">Lotsuz</span>),
      },
      {
        id: 'expiryDate',
        accessorFn: (r) => r.expiryDate,
        header: 'SKT',
        meta: { width: 110 },
        cell: ({ row }) => (row.original.expiryDate ? <ExpiryBadge date={row.original.expiryDate} showDate={false} /> : <span className="text-xs text-muted-foreground/60">—</span>),
      },
      { id: 'locationCode', accessorFn: (r) => r.locationCode, header: 'Kaynak lokasyon', meta: { width: 130, className: 'font-mono text-xs text-muted-foreground' }, cell: ({ getValue }) => getValue<string | null>() ?? '—' },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={lines}
      getRowId={(l) => l.line.id}
      searchable={false}
      columnToggle={false}
      pagination={false}
      emptyTitle="Satır yok"
    />
  );
}
