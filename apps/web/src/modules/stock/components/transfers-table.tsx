'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
import type { TransferRow } from '../queries';

/** Güzergahı LOKASYON seviyesinde gösterir (ör. "TIRE/HAM/R01/A → TIRE/HAM/R02/B") — depo kodları
 *  (ör. "TIRE → TIRE") depo içi transferlerde her zaman aynı ve hiçbir bilgi taşımıyordu (Tur 4 P1
 *  bulgusu). Depolar farklıysa (Tire → Buca) daha kısa/okunabilir olan depo kodu çifti gösterilir —
 *  hangi ambardan hangi ambara gittiği lokasyon detayından daha önemli bir sinyaldir. */
function routeLabel(r: TransferRow): string {
  if (r.fromWarehouseCode !== r.toWarehouseCode) return `${r.fromWarehouseCode} → ${r.toWarehouseCode}`;
  return `${r.fromLocationCode} → ${r.toLocationCode}`;
}

export function TransfersTable({ transfers }: { transfers: TransferRow[] }) {
  // stock-table.tsx / deliveries-table.tsx ile aynı kök nedenle (Tur 3 P2): "Satır" neredeyse her
  // satırda "1" — bilgi taşımıyorsa sütun hiç render edilmez.
  const showLineCount = useMemo(() => new Set(transfers.map((t) => t.lineCount)).size > 1, [transfers]);

  const columns = useMemo<ColumnDef<TransferRow, unknown>[]>(
    () => {
      const cols: ColumnDef<TransferRow, unknown>[] = [
      // 16 karakterlik mono bir dizge (TR-2026-000001) sabit genişlikte tutulur — genişliksiz
      // bırakıldığında (Tur 1) tablo genişliğine göre orantısız büyüyordu (~500-800px arası kayıyordu).
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'Belge no', meta: { width: 150, mobile: 'title', className: 'font-mono' } },
      {
        // meta.width tanımsızdı — TanStack'te genişliksiz tek sütun tüm artan alanı yutuyordu
        // (1440px'te ~650px'lik ölü kolon, içerik 15 karakter). Ayrıca ambar kodu ("TIRE → TIRE")
        // depo içi transferlerde hiç bilgi taşımıyordu; artık lokasyon seviyesinde gösterilir
        // (Tur 4 P1 bulgusu). Mobilde artık ayrı bir "meta" satırı (Tutar'ın yanında) — başlık altı
        // ikinci satır olan "subtitle" yerine, çünkü belge no zaten mono/kısa, güzergah daha uzun.
        id: 'route',
        accessorFn: (r) => routeLabel(r),
        header: 'Güzergah',
        meta: { width: 220, mobile: 'meta' },
        cell: ({ row }) => <span className="font-mono text-xs">{routeLabel(row.original)}</span>,
      },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 130, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="transfer" /> },
      // Sayfanın kendi KPI'ı "Transfer edilen değer" iken satır bazında Değer mobilde hiç
      // görünmüyordu — kardeş ekranlarla aynı kök nedenle (Tur 4 P1 bulgusu). `mobile` rolü
      // verilmez: varsayılan ("rest") mobil kartın alt `dl` alanına düşer — etiket solda ("Değer"),
      // değer sağa hizalı tek satırda (mobile-cards.tsx bunu otomatik yapar).
      { accessorKey: 'value', header: 'Değer', meta: { align: 'right', width: 120 }, cell: ({ row }) => <MoneyCell value={row.original.value} /> },
      // "Oluşturma" yerine "Planlanan tarih" mobilde birincil meta alanı — mobilde tarih tamamen
      // gizliydi (Tur 4 P1 bulgusu). Güzergah'la aynı ("meta") rolde — tek satırda "GÜZERGAH · TARİH".
      { accessorKey: 'scheduledDate', header: 'Planlanan tarih', meta: { width: 150, mobile: 'meta' }, cell: ({ row }) => (row.original.scheduledDate ? formatDate(row.original.scheduledDate) : <span className="text-muted-foreground/60">—</span>) },
      { accessorKey: 'createdAt', header: 'Oluşturma', meta: { width: 130, mobile: 'hidden' }, cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.createdAt)}</span> },
      ];
      if (showLineCount) {
        cols.splice(3, 0, { accessorKey: 'lineCount', header: 'Satır', meta: { align: 'right', width: 60, mobile: 'hidden' } });
      }
      return cols;
    },
    [showLineCount],
  );

  const filters: DataTableFilter[] = [{ columnId: 'status', title: 'Durum', options: statusOptions('transfer') }];

  return (
    <DataTable
      columns={columns}
      data={transfers}
      getRowId={(r) => r.id}
      rowHref={(r) => `/depo/transfer/${r.id}`}
      searchPlaceholder="Belge no ara…"
      filters={filters}
      initialSorting={[{ id: 'createdAt', desc: true }]}
      emptyTitle="Henüz transfer yok"
    />
  );
}
