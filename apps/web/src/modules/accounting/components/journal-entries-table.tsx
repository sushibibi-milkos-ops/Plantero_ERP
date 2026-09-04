'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { formatDate } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import type { JournalEntryRow } from '../queries';

export function JournalEntriesTable({ rows, journalOptions }: { rows: JournalEntryRow[]; journalOptions: Array<{ value: string; label: string }> }) {
  const columns = useMemo<ColumnDef<JournalEntryRow, unknown>[]>(
    () => [
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'Fiş no', meta: { width: 140, mobile: 'title', className: 'font-mono' } },
      // width + iç DIV genişliği (tur 2 P0 muhasebe-yevmiye-01 kök nedeni — DÜZELTME 2): td'nin kendi
      // `meta.width`/`truncate`'ı YETMEDİ — `table-layout:auto`'da bir td'nin min-content genişliği
      // İÇERİĞİNDEN (burada `white-space:nowrap` bir `<span>`, tek satır ~900px'lik makine metni)
      // hesaplanır, td'ye verilen `width` yalnızca bir İPUCUdur ve içerik onu aşınca göz ardı edilir
      // (ölçüldü: satır 1570px'e çıkıyordu, td width'i etkisizdi). Kesin çözüm: hücrenin TEK çocuğu
      // olarak KENDİ AÇIK CSS genişliği olan bir blok (`div w-[380px]`) — blok kutular normal akışta
      // belirtilen genişliği İÇERİĞE GÖRE KÜÇÜLTMEZ, bu yüzden td'nin min-content'ine katkısı tam
      // olarak 380px'tir; taşan metin `truncate` ile bu sabit kutunun İÇİNDE kırpılır (tam metin
      // `title` özniteliğinde). `flex` diğer sütunları içeriğe sıkıştırmayı sürdürür.
      // inline-block (DİV/BLOCK DEĞİL): masaüstünde `md:w-[380px]` açık genişliği td'nin min-content
      // hesabını sabitler (yukarıdaki not) AMA `inline-block` satır içi kaldığından `<td>`'nin normal
      // tek-satır akışını bozmaz. Mobil kartta (bu hücre `subtitle` rolüyle bir `<span>` sarmalayıcının
      // içine gömülür) sabit genişlik YOKTUR — `max-w-full` + `truncate` üst flex bağlamının kendi
      // genişliğine göre küçülür (bkz. invoices-table.tsx Vade sütunu aynı "div mobilde kartı 2.
      // satıra taşırıyordu" kök nedeni — burada baştan `inline-block` kullanılarak önlendi).
      { accessorKey: 'description', header: 'Açıklama', meta: { mobile: 'subtitle', flex: true, width: 380 }, cell: ({ row }) => <span className="inline-block max-w-full truncate align-bottom md:w-[380px]" title={row.original.description}>{row.original.description}</span> },
      // defaultHidden (kritik bulgu muhasebe-yevmiye-05 — kök neden, tahsilatlar tablosuyla aynı
      // kalıp): bu seed'de VUK/UFRS sekmelerinin her ikisinde de 50/50 satır aynı yevmiye kodunu
      // ("STK") taşıyor — sütun filtre çubuğunda zaten seçilebilir (bkz. `journalOptions`), varsayılan
      // görünümde tekrar eden değer başlangıçta kapalı, sütun görünürlük menüsünden açılabilir.
      { accessorKey: 'journalCode', header: 'Yevmiye', meta: { width: 90, mobile: 'hidden', defaultHidden: true } },
      // mobile:'hidden' → yalnızca masaüstünde render edilir, bu yüzden truncate her zaman blok
      // (`<div>`, `inline-block` gerekmez) olabilir. Aynı kök neden (meta.width, uzun cari adında
      // yoksayılıyordu — "Trendyol Pazaryeri" 140px yerine 263.7px ölçüldü).
      { accessorKey: 'partnerName', header: 'Cari', meta: { width: 140, mobile: 'hidden' }, cell: ({ row }) => row.original.partnerName ? <div className="w-[116px] truncate" title={row.original.partnerName}>{row.original.partnerName}</div> : <span className="text-muted-foreground">—</span> },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 110, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="journal_entry" /> },
      // entryDate mobile:'meta' (tur 2 P1 muhasebe-yevmiye-02 kök nedeni): tarih önceden "rest"
      // grubunun SONUNCUSUYDU (mobil metrik oradan alınır) — 50/50 kartta tutar hiç görünmüyordu.
      { accessorKey: 'entryDate', header: 'Tarih', meta: { width: 110, mobile: 'meta' }, cell: ({ row }) => formatDate(row.original.entryDate) },
      { accessorKey: 'totalDebit', header: 'Tutar', meta: { align: 'right', width: 130 }, cell: ({ row }) => <MoneyCell value={row.original.totalDebit} /> },
    ],
    [],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'status', title: 'Durum', options: statusOptions('journal_entry') },
    { columnId: 'journalCode', title: 'Yevmiye', options: journalOptions },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      rowHref={(r) => `/muhasebe/yevmiye/${r.id}`}
      searchPlaceholder="Fiş no, açıklama ara…"
      filters={filters}
      initialSorting={[{ id: 'entryDate', desc: true }]}
      emptyTitle="Bu defterde kayıt yok"
    />
  );
}
