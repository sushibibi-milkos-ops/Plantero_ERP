'use client';

import { useMemo } from 'react';
import { Package } from 'lucide-react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { LotBadge } from '@/components/lot-badge';
import { EmptyState } from '@/components/empty-state';
import { formatQty } from '@/lib/format';
// `@plantero/core` barrel (`src/index.ts`) `auth/session.ts` üzerinden `node:crypto` içe aktarır —
// istemci paketine (bu dosya 'use client') sızınca webpack'i kırar. `@plantero/core/money` alt yolu
// (`package.json` `exports: "./*"`) yalnızca saf `money.ts`'i (decimal.js) getirir, barrel'ı atlar.
import { D } from '@plantero/core/money';
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
      // Tur 4 P2 ihracat-detay-12 kök neden düzeltmesi: aynı sayfadaki "Sipariş satırları" sekmesi
      // miktarı birimle basıyordu ("40 ADET"), bu sütun çıplak sayı basıyordu ("40") — tek kural:
      // ikisi de `formatQty(qty, uomCode)`.
      { id: 'qty', accessorFn: (r) => r.qty, header: 'Miktar', meta: { align: 'right', width: 110 }, cell: ({ row }) => <span className="font-mono tabular-nums">{formatQty(row.original.qty, row.original.uomCode)}</span> },
      { id: 'hsCode', accessorFn: (r) => r.hsCode ?? '', header: 'GTİP', meta: { width: 100, mobile: 'hidden' }, cell: ({ getValue }) => <span className="font-mono text-muted-foreground">{getValue<string>() || '—'}</span> },
      // Tur 2 P2 ihracat-detay-09 kök neden düzeltmesi: bu hücreler sıfır ağırlığı (numeric(18,4)
      // string'i "0.0000" — her zaman truthy) `formatQty` ile "0" basıyordu, aynı sayfadaki
      // "Proforma & gümrük" panelindeki `weightCell` helper'ı ise `D(v).isZero()` ile aynı sıfırı '—'
      // gösteriyordu — tek ekranda sıfır ağırlık için iki farklı glif. Artık tek kural: boş/sıfır → '—'.
      { id: 'netWeightKg', accessorFn: (r) => r.netWeightKg ?? '', header: 'Net kg', meta: { align: 'right', width: 90, mobile: 'hidden' }, cell: ({ getValue }) => { const v = getValue<string>(); return <span className="font-mono tabular-nums text-muted-foreground">{v && !D(v).isZero() ? formatQty(v) : '—'}</span>; } },
      { id: 'grossWeightKg', accessorFn: (r) => r.grossWeightKg ?? '', header: 'Brüt kg', meta: { align: 'right', width: 90, mobile: 'hidden' }, cell: ({ getValue }) => { const v = getValue<string>(); return <span className="font-mono tabular-nums text-muted-foreground">{v && !D(v).isZero() ? formatQty(v) : '—'}</span>; } },
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
