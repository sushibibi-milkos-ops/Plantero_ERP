'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { SalesDocRow } from '../queries';

/**
 * Teslim + fatura ilerlemesini tek dar sütunda gösterir: iki nokta aynı tonda (bg-primary),
 * farkı konum (sol=teslim, sağ=fatura) verir — iki ayrı renk yerine tek kavram/tek dil.
 * %100 → dolu, %0 → boş halka, ara değer → yarı dolu halka; gerçek yüzde title'da.
 */
function ProgressDot({ pct, label }: { pct: number; label: string }) {
  const state = pct >= 100 ? 'full' : pct > 0 ? 'partial' : 'empty';
  return (
    <span
      title={`${label}: %${pct}`}
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded-full text-[9px] font-semibold tabular-nums',
        state === 'full' && 'bg-primary text-primary-foreground',
        state === 'partial' && 'border border-primary text-primary',
        state === 'empty' && 'border border-border text-muted-foreground/40',
      )}
    >
      {label}
    </span>
  );
}

export function SalesDocsTable({ rows, docType }: { rows: SalesDocRow[]; docType: 'quotation' | 'order' }) {
  const basePath = docType === 'quotation' ? '/satis/teklifler' : '/satis/siparisler';

  const columns = useMemo<ColumnDef<SalesDocRow, unknown>[]>(() => {
    const cols: ColumnDef<SalesDocRow, unknown>[] = [
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'Belge no', meta: { width: 120, mobile: 'title', className: 'font-mono' } },
      {
        id: 'partnerName', accessorFn: (r) => r.partnerName, header: docType === 'quotation' ? 'Cari' : 'Müşteri', meta: { width: 200, mobile: 'subtitle' },
        cell: ({ row }) => <span className="block max-w-44 truncate" title={row.original.partnerName}>{row.original.partnerName}</span>,
      },
      {
        id: 'channelName', accessorFn: (r) => r.channelName, header: 'Kanal', meta: { width: 100, mobile: 'hidden' },
        cell: ({ row }) => (
          <span className="inline-flex max-w-full items-center gap-1.5">
            <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: row.original.channelColor ?? 'var(--muted-foreground)' }} />
            <span className="truncate">{row.original.channelName}</span>
          </span>
        ),
      },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 130, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="sales_order" /> },
      { id: 'orderDate', accessorFn: (r) => r.orderDate, header: 'Tarih', meta: { width: 90 }, cell: ({ row }) => formatDate(row.original.orderDate) },
    ];
    if (docType === 'quotation') {
      cols.push({ id: 'validUntil', accessorFn: (r) => r.validUntil, header: 'Geçerlilik', meta: { width: 100, mobile: 'hidden' }, cell: ({ row }) => (row.original.validUntil ? formatDate(row.original.validUntil) : '—') });
    } else {
      cols.push(
        { id: 'externalOrderNo', accessorFn: (r) => r.externalOrderNo ?? '', header: 'Dış no', meta: { width: 100, mobile: 'hidden', className: 'font-mono text-xs' }, cell: ({ row }) => row.original.externalOrderNo ?? '—' },
        {
          id: 'progress', header: 'İlerleme', enableSorting: false, meta: { width: 64, mobile: 'hidden' },
          cell: ({ row }) => (
            <div className="flex items-center gap-1">
              <ProgressDot pct={row.original.deliveredPct} label="T" />
              <ProgressDot pct={row.original.invoicedPct} label="F" />
            </div>
          ),
        },
        { id: 'netRevenue', accessorFn: (r) => r.netRevenue, header: 'Net ciro', meta: { align: 'right', width: 110 }, cell: ({ row }) => <MoneyCell value={row.original.netRevenue} currency={row.original.currency} /> },
      );
    }
    cols.push({
      id: 'grandTotal', accessorFn: (r) => r.grandTotal, header: 'Genel toplam',
      meta: { align: 'right', width: 120, className: 'sticky right-0 bg-card', headerClassName: 'sticky right-0 bg-muted/40' },
      cell: ({ row }) => <MoneyCell value={row.original.grandTotal} currency={row.original.currency} />,
    });
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
