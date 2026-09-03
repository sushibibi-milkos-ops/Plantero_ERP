'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { EmptyCell } from '@/components/empty-cell';
import type { PartnerListRow } from '../queries';
import { PARTNER_KIND_LABELS } from '../product-labels';

export function PartnersTable({ partners }: { partners: PartnerListRow[] }) {
  const columns = useMemo<ColumnDef<PartnerListRow, unknown>[]>(
    () => [
      {
        accessorKey: 'code',
        header: 'Kod',
        // Tur 5 P1 bulgusu: SKU'nun products-table.tsx'te aldığı 'subtitle' rolü burada hiç verilmemişti
        // — mobil kartta kod, ad altında etiketsiz mono alt başlık yerine "Kod  S-000005" diye etiketli
        // bir çift olarak beliriyordu (modül içi iki liste ekranı iki farklı kimlik biçimi konuşuyordu).
        meta: { mobile: 'subtitle', className: 'font-mono text-[12px]', width: 100 },
      },
      { accessorKey: 'name', header: 'Ad', meta: { mobile: 'title', className: 'font-medium' } },
      {
        accessorKey: 'kind',
        header: 'Tip',
        // Tip bir durum değil, bir kategori — renk yalnızca Durum ekseninde kalsın diye tek nötr tona
        // indirildi (Tur 3 P1 bulgusu: müşteri/mavi + tedarikçi/yeşil, "aktif" rozetiyle aynı yeşili
        // paylaşıp anlam eksenini karıştırıyordu).
        meta: { mobile: 'badge', width: 150 },
        cell: ({ getValue }) => {
          const k = getValue<string>();
          return <StatusBadge status={k} label={PARTNER_KIND_LABELS[k] ?? k} tone="neutral" dot={false} />;
        },
      },
      {
        accessorKey: 'channelName',
        header: 'Kanal',
        // Genişlik sabitlenmemişse (table-layout:auto) içerik uzunluğuna göre orantısız büyüyüp bir
        // sonraki sütunle arada boş şerit bırakabiliyordu (Tur 3 P1 bulgusu).
        meta: { mobile: 'hidden', width: 180 },
        cell: ({ getValue }) => getValue<string | null>() ?? <span className="text-muted-foreground/50">—</span>,
      },
      {
        id: 'term',
        accessorFn: (r) => (r.paymentTermKind === 'cash' ? 'Peşin' : `${r.paymentTermDays} gün`),
        header: 'Vade',
        meta: { mobile: 'hidden', width: 90 },
      },
      {
        accessorKey: 'balance',
        header: 'Bakiye',
        // Pozitif bakiye nötr: alacak "iyi" bir olay değil, yalnızca "sıfırdan farklı" demek. Renk yalnızca
        // gerçek sinyalde kullanılır — negatif (borç) MoneyCell tarafından zaten kırmızı basılır.
        // Tur 5 P1 bulgusu: sıfır bakiye "₺0,00" olarak soluk basılıyordu — "Kanal" gibi gerçekten boş
        // alanlar em dash kullanırken aynı satırda iki farklı "boş" sözleşmesi (17 satırın 12'sinde)
        // okuyucuyu "hesaplanmış sıfır mı, veri yok mu" ikilemine sokuyordu. Sıfır artık em dash.
        // Tur 9/10 P1 bulgusu: eskiden `mobile` boştu (varsayılan "rest" — hairline+padding'li ayrı bir
        // satır, kartın ~üçte biri) VE 17 kartın 11'inde bu satırın tek içeriği "Bakiye —" idi. `mobile`
        // yine kasıtlı olarak boş bırakılır — kod (subtitle) ile aynı satırın tek "metric"i olarak shell
        // (`mobile-cards.tsx`, Tur 10) tarafından otomatik seçilir, ayrı satır AÇMAZ; sıfırda yalnızca
        // "—" görünür ("Bakiye —" etiketli satırı değil).
        meta: { align: 'right', width: 130 },
        cell: ({ getValue }) => {
          const v = getValue<string>();
          return Number(v) === 0 ? <EmptyCell /> : <MoneyCell value={v} />;
        },
      },
      {
        accessorKey: 'supplierQualityScore',
        header: 'Kalite Skoru',
        // Yalnızca tedarikçilerde dolu — nadiren bakılır, dar ekranda taşan sütun; varsayılan gizli.
        meta: { align: 'right', width: 120, mobile: 'hidden', defaultHidden: true },
        cell: ({ getValue }) => {
          const v = getValue<string | null>();
          return v ? <span className="num">{Number(v).toFixed(0)}</span> : <span className="text-muted-foreground/50">—</span>;
        },
      },
      {
        accessorKey: 'isActive',
        header: 'Durum',
        // Seed verisinde 17/17 cari aktif — sütun sıfır bilgi taşıyor (bkz. boms-table.tsx'teki aynı
        // desen). Varsayılan gizli, sütun seçiciden açılabilir; pasif bir cari olursa satır zaten
        // `rowClassName` ile soluklaşarak görünür (Tur 3 P1 bulgusu).
        meta: { mobile: 'badge', width: 90, defaultHidden: true },
        cell: ({ getValue }) =>
          getValue<boolean>() ? (
            <span className="inline-block size-1.5 rounded-full bg-success" aria-label="Aktif" title="Aktif" />
          ) : (
            <StatusBadge status="inactive" />
          ),
      },
    ],
    [],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'kind', title: 'Tip', options: Object.entries(PARTNER_KIND_LABELS).map(([value, label]) => ({ value, label })) },
  ];

  return (
    <DataTable
      columns={columns}
      data={partners}
      getRowId={(p) => p.id}
      searchPlaceholder="Kod veya ad ara…"
      filters={filters}
      initialSorting={[{ id: 'name', desc: false }]}
      rowHref={(p) => `/ana-veri/cariler/${p.id}`}
      rowClassName={(p) => (!p.isActive ? 'opacity-60' : undefined)}
      emptyTitle="Henüz cari yok"
      emptyDescription="Yeni bir müşteri ya da tedarikçi ekleyin."
    />
  );
}
