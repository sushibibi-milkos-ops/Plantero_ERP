'use client';

import { useMemo } from 'react';
import { Package } from 'lucide-react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { LotBadge } from '@/components/lot-badge';
import { EmptyState } from '@/components/empty-state';
import { formatQty } from '@/lib/format';
import type { getShipmentDetail } from '../queries';

type Packages = NonNullable<Awaited<ReturnType<typeof getShipmentDetail>>>['packages'];
type PackageRow = Packages[number];

/**
 * Çeki listesi (packing list): kap/koli bazında ürün+lot+ağırlık+GTİP — `buildPackingList`'in
 * ürettiği taslak. Paylaşılan `DataTable` üzerinden (Tur 1 P1 kök neden düzeltmesi,
 * ihracat-detay-01/02/05: elle yazılmış 7 sütunlu `<table>` 390px'te 134px kırpılıyordu — 'Brüt kg'
 * sütunu hiç görünmüyordu — ayrıca UPPERCASE başlık + kapalı kutu çerçevesi aynı sayfadaki
 * "Belgeler" sekmesinin `DataTable` anatomisinden sapıyordu). `DataTable`'ın otomatik mobil kart
 * dönüşümü kırpmayı kökten ortadan kaldırır.
 */
export function PackingListTable({ packages }: { packages: Packages }) {
  const columns = useMemo<ColumnDef<PackageRow, unknown>[]>(
    () => [
      { id: 'packageNo', accessorFn: (r) => r.packageNo, header: 'Kap no', meta: { width: 80, className: 'font-mono tabular-nums text-muted-foreground', mobile: 'meta' }, cell: ({ getValue }) => `#${getValue<number>()}` },
      { id: 'product', accessorFn: (r) => r.productName, header: 'Ürün', meta: { mobile: 'title' }, cell: ({ row }) => <span className="font-medium">{row.original.productName}</span> },
      { id: 'sku', accessorFn: (r) => r.sku, header: 'SKU', meta: { width: 120, className: 'font-mono text-xs text-muted-foreground', mobile: 'subtitle' } },
      {
        id: 'lot', accessorFn: (r) => r.lotNo ?? '', header: 'Lot', meta: { width: 150, mobile: 'badge' },
        cell: ({ row }) => (row.original.lotId ? <LotBadge lotNo={row.original.lotNo} status={row.original.lotStatus} id={row.original.lotId} /> : <span className="text-muted-foreground">—</span>),
      },
      { id: 'qty', accessorFn: (r) => r.qty, header: 'Miktar', meta: { align: 'right', width: 100 }, cell: ({ row }) => <span className="font-mono tabular-nums">{formatQty(row.original.qty)}</span> },
      { id: 'hsCode', accessorFn: (r) => r.hsCode ?? '', header: 'GTİP', meta: { width: 100, mobile: 'hidden' }, cell: ({ getValue }) => <span className="font-mono text-muted-foreground">{getValue<string>() || '—'}</span> },
      { id: 'netWeightKg', accessorFn: (r) => r.netWeightKg ?? '', header: 'Net kg', meta: { align: 'right', width: 90, mobile: 'hidden' }, cell: ({ getValue }) => <span className="font-mono tabular-nums text-muted-foreground">{getValue<string>() ? formatQty(getValue<string>()) : '—'}</span> },
      { id: 'grossWeightKg', accessorFn: (r) => r.grossWeightKg ?? '', header: 'Brüt kg', meta: { align: 'right', width: 90, mobile: 'hidden' }, cell: ({ getValue }) => <span className="font-mono tabular-nums text-muted-foreground">{getValue<string>() ? formatQty(getValue<string>()) : '—'}</span> },
    ],
    [],
  );

  if (packages.length === 0) {
    return <EmptyState compact icon={Package} title="Çeki listesi henüz kurulmadı" description="Sevkiyat bir irsaliyeye bağlandıktan sonra “Çeki listesi oluştur” ile üretilir." />;
  }

  return (
    <DataTable
      columns={columns}
      data={packages}
      getRowId={(r) => r.id}
      searchable={false}
      columnToggle={false}
      pagination={false}
      emptyTitle="Çeki listesi henüz kurulmadı"
    />
  );
}
