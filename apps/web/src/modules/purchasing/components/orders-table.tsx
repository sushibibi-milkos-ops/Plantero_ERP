'use client';

import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
import type { PurchaseOrderRow } from '../queries';

export function OrdersTable({ orders }: { orders: PurchaseOrderRow[] }) {
  const columns = useMemo<ColumnDef<PurchaseOrderRow, unknown>[]>(
    () => [
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'Sipariş no', meta: { mobile: 'title', className: 'font-mono' } },
      { accessorKey: 'partnerName', header: 'Tedarikçi', meta: { mobile: 'subtitle' } },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 160, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="purchase_order" /> },
      {
        id: 'ai', accessorFn: (r) => r.isAiGenerated, header: '', meta: { width: 36, mobile: 'hidden' },
        cell: ({ row }) => (row.original.isAiGenerated ? <Sparkles className="size-3.5 text-primary" aria-label="AI taslağı" /> : null),
      },
      { accessorKey: 'receivedPct', header: 'Alınan', meta: { align: 'right', width: 90 }, cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums text-muted-foreground">%{Math.round(row.original.receivedPct)}</span> },
      { accessorKey: 'expectedDate', header: 'Beklenen tarih', meta: { width: 130, mobile: 'hidden' }, cell: ({ row }) => (row.original.expectedDate ? formatDate(row.original.expectedDate) : <span className="text-muted-foreground">—</span>) },
      // Tur 1 P1 tedarik-siparisler-01/02 kök neden: mobil kartın tek metriği "rest" hücrelerinin
      // SONUNCUSU (DataTableMobileCards) — `orderDate` tutardan SONRA tanımlıydı ve mobil rolü yoktu,
      // metrik yuvasına tutar yerine sipariş tarihi düşüyordu. `mobile:'meta'` ile tarih artık 2.
      // satırda cari adının yanında bir ipucu olarak görünür (muhasebe/invoices-table.tsx'teki
      // `dueDate` ile aynı kalıp — kriter 11), `grandTotal` tabloda SONA alınarak "rest" grubunun
      // son (ve tek gösterilen) elemanı, dolayısıyla mobil metrik, oldu.
      { accessorKey: 'orderDate', header: 'Sipariş tarihi', meta: { width: 120, mobile: 'meta' }, cell: ({ row }) => formatDate(row.original.orderDate) },
      { accessorKey: 'grandTotal', header: 'Tutar', meta: { align: 'right', width: 130 }, cell: ({ row }) => <MoneyCell value={row.original.grandTotal} /> },
    ],
    [],
  );

  const filters: DataTableFilter[] = [{ columnId: 'status', title: 'Durum', options: statusOptions('purchase_order') }];

  return (
    <DataTable
      columns={columns}
      data={orders}
      getRowId={(r) => r.id}
      rowHref={(r) => `/satin-alma/siparisler/${r.id}`}
      searchPlaceholder="Sipariş no, tedarikçi ara…"
      filters={filters}
      initialSorting={[{ id: 'orderDate', desc: true }]}
      emptyTitle="Henüz satın alma siparişi yok"
      emptyDescription="Yeni sipariş oluşturun veya kritik stok motorunu çalıştırın."
    />
  );
}
