'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
import type { InvoiceRow } from '../queries';

export function InvoicesTable({ rows, emptyTitle }: { rows: InvoiceRow[]; emptyTitle: string }) {
  const columns = useMemo<ColumnDef<InvoiceRow, unknown>[]>(
    () => [
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'Belge no', meta: { width: 150, mobile: 'title', className: 'font-mono' } },
      // flex: true (tur 2 P0 muhasebe-faturalar-01 kök nedeni): bu sütun tek genişliksiz sütundu —
      // auto table-layout'ta cari adı sınırsız büyüyüp tabloyu 1152px kapsayıcıdan 210px taşırıyordu
      // (Kanal harf ortasından kesik, Tarih tamamen ekran dışı). `flex` diğer tüm sütunları içeriğe
      // sıkıştırır (types.ts), kalan genişlik yalnızca buraya akar — `truncate` üstündeki sınırı korur.
      { accessorKey: 'partnerName', header: 'Cari', meta: { mobile: 'subtitle', flex: true, className: 'truncate' } },
      {
        // mobile:'meta' (tur 2 P2 muhasebe-faturalar-02): vade artık mobil kartın 2. satırında
        // "· 22.09.2026" olarak görünür — önceden "rest" grubunun İLK elemanıydı, metrik onu değil
        // SONUNCUYU (residual) alıyordu, Tutar/Vade ikisi de mobilde hiç görünmüyordu.
        accessorKey: 'dueDate', header: 'Vade', meta: { width: 150, mobile: 'meta' },
        // inline-flex, DİV DEĞİL: mobil kartta bu hücre "meta" satırına (whitespace-nowrap +
        // text-ellipsis tek satır akışı) gömülür — bir `<div>` (blok kutu) o akışı bozup satırı
        // 2. bir satıra sarıyordu (kart 68.5→83px'e çıktı, ölçüldü). `inline-flex` metinle aynı
        // satırda kalır (bkz. payments-table.tsx Yön sütunu aynı desen).
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            <span>{formatDate(row.original.dueDate)}</span>
            {row.original.daysOverdue > 0 ? <span className="text-[11px] font-medium text-destructive">{row.original.daysOverdue} gün gecikti</span> : null}
          </span>
        ),
      },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 130, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="invoice" /> },
      // defaultHidden (tur 2 P0 muhasebe-faturalar-01): az bakılan iki sütun (e-belge durumu, kanal)
      // masaüstünde varsayılan gizli — sütun seçiciden açılabilir, taşmaya katkıları artık sıfır.
      { id: 'eInvoiceStatus', accessorFn: (r) => r.eInvoiceStatus, header: 'e-Belge', meta: { width: 140, mobile: 'hidden', defaultHidden: true }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="e_invoice" /> },
      { accessorKey: 'channelName', header: 'Kanal', meta: { width: 120, mobile: 'hidden', defaultHidden: true }, cell: ({ row }) => row.original.channelName ?? <span className="text-muted-foreground">—</span> },
      { accessorKey: 'invoiceDate', header: 'Tarih', meta: { width: 110, mobile: 'hidden' }, cell: ({ row }) => formatDate(row.original.invoiceDate) },
      { accessorKey: 'residual', header: 'Kalan', meta: { align: 'right', width: 130 }, cell: ({ row }) => <MoneyCell value={row.original.residual} currency={row.original.currency} muted={Number(row.original.residual) <= 0} /> },
      // Tutar en sona (tur 2 P2 muhasebe-faturalar-02): mobil kalıp "rest" grubunun SONUNCUSUNU tek
      // metrik yapar — bir fatura listesinde en belirleyici sayı Tutar'dır, Kalan değil.
      { accessorKey: 'grandTotal', header: 'Tutar', meta: { align: 'right', width: 130 }, cell: ({ row }) => <MoneyCell value={row.original.grandTotal} currency={row.original.currency} /> },
    ],
    [],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'status', title: 'Durum', options: statusOptions('invoice') },
    { columnId: 'eInvoiceStatus', title: 'e-Belge', options: statusOptions('e_invoice') },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      rowHref={(r) => `/muhasebe/faturalar/${r.id}`}
      searchPlaceholder="Belge no, cari ara…"
      filters={filters}
      initialSorting={[{ id: 'invoiceDate', desc: true }]}
      emptyTitle={emptyTitle}
      emptyDescription="Kayıt oluştuğunda burada listelenecek."
    />
  );
}
