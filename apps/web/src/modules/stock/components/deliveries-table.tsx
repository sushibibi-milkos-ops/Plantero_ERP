'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
import type { DeliveryRow } from '../queries';

/** Sıralama/gösterim için tek bir "sevk tarihi": planlanan tarih varsa o, yoksa (seed verisinde
 *  `scheduledDate` hiç doldurulmamış — gerçek tarih yalnızca `shippedAt`'te) fiilen sevk edildiği an. */
function effectiveDate(r: DeliveryRow): string | null {
  return r.scheduledDate ?? (r.shippedAt ? r.shippedAt.toISOString() : null);
}

export function DeliveriesTable({ deliveries }: { deliveries: DeliveryRow[] }) {
  const columns = useMemo<ColumnDef<DeliveryRow, unknown>[]>(
    () => [
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'Belge no', meta: { mobile: 'title', className: 'font-mono' } },
      { accessorKey: 'partnerName', header: 'Müşteri', meta: { mobile: 'subtitle' } },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 140, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="delivery" /> },
      { accessorKey: 'warehouseCode', header: 'Depo', meta: { width: 90, mobile: 'hidden' }, cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span> },
      // "Satır" 27 satırın 23'ünde "1" taşıyordu — bilgi yoğunluğu düşük, dar tutulur ve mobilde hiç
      // gösterilmez (zaten kart başlığında satır sayısına ihtiyaç yok).
      { accessorKey: 'lineCount', header: 'Satır', meta: { align: 'right', width: 44, mobile: 'hidden' } },
      {
        accessorKey: 'salesOrderDocNo',
        header: 'Sipariş',
        meta: { mobile: 'hidden' },
        cell: ({ row }) => (row.original.salesOrderId ? <Link href={`/satis/siparisler/${row.original.salesOrderId}`} className="font-mono text-xs text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{row.original.salesOrderDocNo}</Link> : '—'),
      },
      // Sevk/planlanan tarih hiç gösterilmiyordu — 27 satırlık bir listede sıralanamaz/filtrelenemez
      // haldeydi. Kardeş ekran /depo/mal-kabul'de "Tarih" zaten var; tutarlılık için burada da varsayılan
      // sıralama bu sütunda (en yeni önce). `scheduledDate` planlanmışsa onu, fiilen sevk edilmişse
      // (seed verisinde planlanan tarih hiç set edilmiyor, yalnızca gerçek sevk anı var) `shippedAt`'i
      // gösterir — aksi halde sütun anlamsızca hep "—" kalırdı.
      {
        id: 'scheduledDate',
        accessorFn: (r) => effectiveDate(r) ?? '',
        header: 'Sevk tarihi',
        meta: { align: 'right', width: 110 },
        cell: ({ row }) => {
          const d = effectiveDate(row.original);
          if (!d) return <span className="text-muted-foreground/60">—</span>;
          return row.original.scheduledDate ? formatDate(d) : <span title="Fiilen sevk edildi">{formatDate(d)}</span>;
        },
      },
      // Tutar da hiç yoktu (kardeş ekran /depo/mal-kabul'de "Toplam tutar" var) — modül içi tutarsızlık.
      // Lot maliyeti × toplanan miktar (SMM'in temeli); satış fiyatı değil (irsaliye bir depo belgesi).
      { accessorKey: 'value', header: 'Tutar', meta: { align: 'right', width: 130 }, cell: ({ row }) => <MoneyCell value={row.original.value} /> },
      { accessorKey: 'carrier', header: 'Kargo', meta: { mobile: 'hidden' }, cell: ({ row }) => row.original.carrier ?? '—' },
    ],
    [],
  );

  // Depo (tek depo, hep aynı değer) ve Kargo çoğu satırda boş/tek değerli — varsayılan gizli,
  // sütun menüsünden açılabilir. Sevk tarihi ve Tutar artık her zaman görünür (P1 bulgusu).
  const initialColumnVisibility = { warehouseCode: false, carrier: false };

  const filters: DataTableFilter[] = [{ columnId: 'status', title: 'Durum', options: statusOptions('delivery') }];

  return (
    <DataTable
      columns={columns}
      data={deliveries}
      getRowId={(r) => r.id}
      rowHref={(r) => `/depo/sevkiyat/${r.id}`}
      searchPlaceholder="Belge no, müşteri ara…"
      filters={filters}
      initialSorting={[{ id: 'scheduledDate', desc: true }]}
      initialColumnVisibility={initialColumnVisibility}
      emptyTitle="Henüz sevkiyat yok"
      emptyDescription="Satış siparişi onaylandığında irsaliye buradan oluşturulur."
    />
  );
}
