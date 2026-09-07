'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { formatQty } from '@/lib/format';
// `@plantero/core`'un `D` sarmalayıcısı DEĞİL, doğrudan `decimal.js` — bu 'use client' bileşeni
// tarayıcıda paketlenir; `@plantero/core` (`bcryptjs`/`node:crypto` kullanan auth alt modülleri
// dahil) istemci demetine karışınca `UnhandledSchemeError: node:crypto` build hatasıyla çöküyordu
// (form/number-input.tsx, sales-doc-lines.tsx gibi diğer istemci bileşenleri de aynı nedenle
// `@plantero/core` yerine doğrudan `decimal.js` kullanır).
import Decimal from 'decimal.js';
import type { getShipmentDetail } from '../queries';

type OrderLines = NonNullable<Awaited<ReturnType<typeof getShipmentDetail>>>['orderLines'];
type OrderLineRow = OrderLines[number];

/**
 * Sevkiyata bağlı siparişin satırları — paylaşılan `DataTable` üzerinden (Tur 1 P1 kök neden
 * düzeltmesi, ihracat-detay-02/05: elle yazılmış `<table>` UPPERCASE başlık + kapalı kutu çerçevesi
 * taşıyordu, aynı sayfadaki "Belgeler" sekmesinin `DataTable`'ından anatomi olarak sapıyordu).
 * Satır sayısı tipik olarak tek haneli olduğundan arama/sayfalama gösterilmez.
 */
export function OrderLinesTable({ lines, currency }: { lines: OrderLines; currency?: string | null }) {
  const columns = useMemo<ColumnDef<OrderLineRow, unknown>[]>(
    () => [
      // Tur 7 P2 ihracat-detay-18 kök neden düzeltmesi: meta.width taşımayan tek sütun burasıydı —
      // auto table-layout kalan genişliğin tamamını (562px, en uzun içerik yalnızca ~182px) buraya
      // yığıyordu. satis modülünün Tur 11 kalıbı (channels-table.tsx 'Kanal'): TD'ye sabit
      // `meta.width` + içerik span'ine BİREBİR aynı `max-w-[…] truncate` — değer, bu tablodaki 5
      // sabit sütunun toplamıyla (590px) birlikte 1152px'e oransal esneme uygulandığında dahi en
      // uzun ürün adında slack'in ≤120px kalacağı şekilde kalibre edildi (scripts/probe-ihracat-r8-fix.ts).
      {
        id: 'product', accessorFn: (r) => r.productName, header: 'Ürün', meta: { mobile: 'title', width: 190, className: 'max-w-[280px] truncate' },
        cell: ({ row }) => <span className="block max-w-[280px] truncate font-medium" title={row.original.productName}>{row.original.productName}</span>,
      },
      { id: 'sku', accessorFn: (r) => r.sku, header: 'SKU', meta: { width: 120, className: 'font-mono text-xs text-muted-foreground', mobile: 'subtitle' } },
      {
        id: 'qty', accessorFn: (r) => r.line.qty, header: 'Miktar', meta: { align: 'right', width: 110, mobile: 'meta' },
        cell: ({ row }) => <span className="font-mono tabular-nums">{formatQty(row.original.line.qty, row.original.uomCode)}</span>,
      },
      {
        id: 'deliveredQty', accessorFn: (r) => r.line.deliveredQty, header: 'Sevk edilen', meta: { align: 'right', width: 110, mobile: 'hidden' },
        cell: ({ row }) => {
          const full = new Decimal(row.original.line.deliveredQty).gte(new Decimal(row.original.line.qty));
          return <span className={`font-mono tabular-nums ${full ? 'text-success' : 'text-muted-foreground'}`}>{formatQty(row.original.line.deliveredQty)}</span>;
        },
      },
      {
        id: 'unitPrice', accessorFn: (r) => r.line.unitPrice, header: 'Birim fiyat', meta: { align: 'right', width: 120, mobile: 'hidden' },
        cell: ({ row }) => <MoneyCell value={row.original.line.unitPrice} currency={currency ?? undefined} />,
      },
      {
        id: 'lineTotal', accessorFn: (r) => r.line.lineTotal, header: 'Tutar', meta: { align: 'right', width: 130 },
        cell: ({ row }) => <MoneyCell value={row.original.line.lineTotal} currency={currency ?? undefined} />,
      },
    ],
    [currency],
  );

  if (lines.length === 0) return <EmptyState compact title="Sipariş bulunamadı" />;

  return (
    <DataTable
      columns={columns}
      data={lines}
      getRowId={(r) => r.line.id}
      searchable={false}
      columnToggle={false}
      pagination={false}
      emptyTitle="Sipariş bulunamadı"
    />
  );
}
