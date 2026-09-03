'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { LotBadge } from '@/components/lot-badge';
import { QtyCell } from '@/components/qty-cell';
import { MoneyCell } from '@/components/money-cell';
import { RECEIPT_DISPOSITION_LABELS } from '../labels';
import type { getReceiptDetail } from '../queries';

type ReceiptDetail = NonNullable<Awaited<ReturnType<typeof getReceiptDetail>>>;
type ReceiptLineRow = ReceiptDetail['lines'][number];

/**
 * Mal kabul detay satır tablosu. `DataTable` client bileşenidir — sütun/hücre tanımları bir server
 * component'ten doğrudan prop olarak geçilemez (RSC serileştirme hatası). Diğer modül tabloları gibi
 * kendi 'use client' sarmalayıcısında tanımlanır; sayfa yalnızca serileştirilebilir veri geçer.
 *
 * Liste sayfalarıyla aynı tablo dili: kutulu `<Table>` yerine `DataTable` (Tur 3 P1 bulgusu).
 */
export function ReceiptLinesTable({ lines }: { lines: ReceiptLineRow[] }) {
  const columns = useMemo<ColumnDef<ReceiptLineRow, unknown>[]>(
    () => [
      { id: 'productName', accessorFn: (r) => r.productName, header: 'Ürün', meta: { mobile: 'title' }, cell: ({ row }) => <span className="font-medium">{row.original.productName}</span> },
      { id: 'sku', accessorFn: (r) => r.sku, header: 'SKU', meta: { mobile: 'subtitle', className: 'font-mono text-xs text-muted-foreground' } },
      { id: 'qty', accessorFn: (r) => r.line.qty, header: 'Miktar', meta: { align: 'right', width: 100 }, cell: ({ row }) => <QtyCell value={row.original.line.qty} uom={row.original.uomCode} /> },
      { id: 'unitCost', accessorFn: (r) => r.line.unitCost, header: 'Birim maliyet', meta: { align: 'right', width: 120 }, cell: ({ row }) => <MoneyCell value={row.original.line.unitCost} digits={4} /> },
      {
        id: 'lot',
        accessorFn: (r) => r.lotNo,
        header: 'Lot',
        meta: { mobile: 'badge' },
        cell: ({ row }) => (row.original.lotNo ? <LotBadge lotNo={row.original.lotNo} status={row.original.lotStatus} id={row.original.line.lotId ?? undefined} /> : <span className="text-xs text-muted-foreground">Lotsuz</span>),
      },
      {
        id: 'disposition',
        accessorFn: (r) => r.line.disposition,
        header: 'Karar',
        meta: { mobile: 'badge' },
        cell: ({ row }) => {
          const d = row.original.line.disposition;
          return <StatusBadge status={d} label={RECEIPT_DISPOSITION_LABELS[d] ?? d} tone={d === 'rejected' ? 'danger' : d === 'quarantine' ? 'warning' : 'success'} />;
        },
      },
      { id: 'locationCode', accessorFn: (r) => r.locationCode, header: 'Lokasyon', meta: { width: 110, className: 'font-mono text-xs text-muted-foreground' }, cell: ({ getValue }) => getValue<string | null>() ?? '—' },
      {
        id: 'rejectedQty',
        accessorFn: (r) => r.line.rejectedQty,
        header: 'Red miktarı',
        meta: { align: 'right', width: 110 },
        cell: ({ row }) => (Number(row.original.line.rejectedQty) > 0 ? <QtyCell value={row.original.line.rejectedQty} uom={row.original.uomCode} /> : <span className="text-muted-foreground">—</span>),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={lines}
      getRowId={(l) => l.line.id}
      searchable={false}
      columnToggle={false}
      pagination={false}
      emptyTitle="Satır yok"
    />
  );
}
