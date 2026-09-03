'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { SalesDocRow } from '../queries';

function ProgressBar({ pct, tone }: { pct: number; tone: 'info' | 'success' }) {
  if (pct <= 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full', tone === 'success' ? 'bg-success' : 'bg-info')} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right font-mono text-[11px] text-muted-foreground tabular-nums">%{pct}</span>
    </div>
  );
}

export function SalesDocsTable({ rows, docType }: { rows: SalesDocRow[]; docType: 'quotation' | 'order' }) {
  const basePath = docType === 'quotation' ? '/satis/teklifler' : '/satis/siparisler';

  const columns = useMemo<ColumnDef<SalesDocRow, unknown>[]>(() => {
    const cols: ColumnDef<SalesDocRow, unknown>[] = [
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'Belge no', meta: { mobile: 'title', className: 'font-mono' } },
      { id: 'partnerName', accessorFn: (r) => r.partnerName, header: docType === 'quotation' ? 'Cari' : 'Müşteri', meta: { mobile: 'subtitle' } },
      {
        id: 'channelName', accessorFn: (r) => r.channelName, header: 'Kanal', meta: { width: 130, mobile: 'hidden' },
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: row.original.channelColor ?? 'var(--muted-foreground)' }} />
            {row.original.channelName}
          </span>
        ),
      },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 140, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="sales_order" /> },
      { id: 'orderDate', accessorFn: (r) => r.orderDate, header: docType === 'quotation' ? 'Tarih' : 'Sipariş tarihi', meta: { width: 110 }, cell: ({ row }) => formatDate(row.original.orderDate) },
    ];
    if (docType === 'quotation') {
      cols.push({ id: 'validUntil', accessorFn: (r) => r.validUntil, header: 'Geçerlilik', meta: { width: 110, mobile: 'hidden' }, cell: ({ row }) => (row.original.validUntil ? formatDate(row.original.validUntil) : '—') });
    } else {
      cols.push(
        { id: 'externalOrderNo', accessorFn: (r) => r.externalOrderNo ?? '', header: 'Dış sipariş no', meta: { mobile: 'hidden', className: 'font-mono text-xs' }, cell: ({ row }) => row.original.externalOrderNo ?? '—' },
        { id: 'deliveredPct', header: 'Teslim', meta: { width: 100, mobile: 'hidden' }, cell: ({ row }) => <ProgressBar pct={row.original.deliveredPct} tone="info" /> },
        { id: 'invoicedPct', header: 'Fatura', meta: { width: 100, mobile: 'hidden' }, cell: ({ row }) => <ProgressBar pct={row.original.invoicedPct} tone="success" /> },
        { id: 'netRevenue', accessorFn: (r) => r.netRevenue, header: 'Net ciro', meta: { align: 'right', width: 120 }, cell: ({ row }) => <MoneyCell value={row.original.netRevenue} currency={row.original.currency} /> },
      );
    }
    cols.push({ id: 'grandTotal', accessorFn: (r) => r.grandTotal, header: 'Genel toplam', meta: { align: 'right', width: 130 }, cell: ({ row }) => <MoneyCell value={row.original.grandTotal} currency={row.original.currency} /> });
    return cols;
  }, [docType]);

  const filters: DataTableFilter[] = [
    { columnId: 'status', title: 'Durum', options: statusOptions('sales_order') },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      rowHref={(r) => `${basePath}/${r.id}`}
      searchPlaceholder="Belge no, cari, dış sipariş no ara…"
      filters={filters}
      initialSorting={[{ id: 'orderDate', desc: true }]}
      emptyTitle={docType === 'quotation' ? 'Henüz teklif yok' : 'Henüz sipariş yok'}
      emptyDescription={docType === 'quotation' ? 'Fırsatlar ekranından ya da doğrudan yeni teklif oluşturun.' : 'Onaylı bir teklifi siparişe dönüştürün ya da doğrudan yeni sipariş açın.'}
    />
  );
}
