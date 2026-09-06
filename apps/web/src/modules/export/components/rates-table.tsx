'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { formatDate, formatRate } from '@/lib/format';
import type { RateRow } from '../queries';

const CURRENCY_LABEL: Record<string, string> = { USD: 'USD', EUR: 'EUR', GBP: 'GBP' };

// Tur 4 P2 ihracat-kurlar-08 kök neden düzeltmesi: `exchange_rates.source` alanı seed verisinde
// tohumlama kökenini işaretlemek için '-SEED' son ekiyle yazılıyor (packages/db/src/seed/export.ts) —
// bu, VERİ KATMANI için doğru bir ayrım ama EKRANDA gösterilince "bu bir demo/test verisi" izlenimi
// veriyor ve ekranın gerçek bir finans panosu olduğu algısını bozuyor. Kaynağın gerçek kimliği
// (TCMB) korunur, yalnızca tohumlama son eki EKRAN etiketinden temizlenir; alttaki veri değişmez.
function sourceLabel(source: string): string {
  return source.replace(/-SEED$/i, '');
}

/**
 * TCMB kur geçmişi — paylaşılan `DataTable` üzerinden (Tur 1 P1 kök neden düzeltmesi):
 * - ihracat-kurlar-01: elle yazılmış tablo 390px'te 'Kaynak' sütununu iki satıra sarıp
 *   kırpıyordu — `DataTable`'ın otomatik mobil kart dönüşümü kırpmayı kökten kaldırır.
 * - ihracat-kurlar-02: UPPERCASE başlık + arama/filtre/sıralama/sütun görünürlüğü yoktu —
 *   modülün diğer üç listesiyle (sevkiyatlar/belgeler/gtip) artık aynı anatomi.
 * - ihracat-kurlar-03: 60+ satır tek seferde dökülüyordu, sayfalama yoktu — `pageSize=25`.
 * - ihracat-kurlar-04: satırlar tıklanamazken hover arka planı vaat ediyordu — bu tabloda
 *   `rowHref`/`onRowClick` YOK, `DataTable` yalnızca tıklanabilir satırlarda hover ekler.
 */
export function RatesTable({ rows }: { rows: RateRow[] }) {
  const columns = useMemo<ColumnDef<RateRow, unknown>[]>(
    () => [
      { id: 'rateDate', accessorFn: (r) => r.rateDate, header: 'Tarih', meta: { width: 110, mobile: 'subtitle' }, cell: ({ getValue }) => formatDate(getValue<string>()) },
      { id: 'currency', accessorFn: (r) => r.currency, header: 'Para birimi', meta: { width: 120, mobile: 'title' }, cell: ({ getValue }) => <span className="font-medium">{CURRENCY_LABEL[getValue<string>()] ?? getValue<string>()}</span> },
      { id: 'buying', accessorFn: (r) => r.buying, header: 'Alış', meta: { align: 'right', width: 120, mobile: 'hidden' }, cell: ({ getValue }) => <span className="font-mono tabular-nums">{formatRate(getValue<string>())}</span> },
      { id: 'selling', accessorFn: (r) => r.selling, header: 'Satış', meta: { align: 'right', width: 120 }, cell: ({ getValue }) => <span className="font-mono tabular-nums">{formatRate(getValue<string>())}</span> },
      { id: 'source', accessorFn: (r) => r.source, header: 'Kaynak', meta: { width: 140, mobile: 'meta' }, cell: ({ getValue }) => <span className="text-muted-foreground">{sourceLabel(getValue<string>())}</span> },
    ],
    [],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'currency', title: 'Para birimi', options: Object.entries(CURRENCY_LABEL).map(([value, label]) => ({ value, label })) },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => `${r.currency}-${r.rateDate}`}
      searchPlaceholder="Para birimi, kaynak ara…"
      filters={filters}
      pageSize={25}
      initialSorting={[{ id: 'rateDate', desc: true }]}
      emptyTitle="Kur verisi yok"
    />
  );
}
