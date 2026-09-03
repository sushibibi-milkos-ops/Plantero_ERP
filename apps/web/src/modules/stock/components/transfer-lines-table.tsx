'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { LotBadge } from '@/components/lot-badge';
import { QtyCell } from '@/components/qty-cell';
import type { getTransferDetail } from '../queries';

type TransferDetail = NonNullable<Awaited<ReturnType<typeof getTransferDetail>>>;
type TransferLineRow = TransferDetail['lines'][number];

/**
 * Transfer detay satır tablosu. `DataTable` client bileşenidir — sütun/hücre tanımları bir server
 * component'ten doğrudan prop olarak geçilemez (RSC serileştirme hatası). Diğer modül tabloları gibi
 * kendi 'use client' sarmalayıcısında tanımlanır; sayfa yalnızca serileştirilebilir veri geçer.
 *
 * Liste sayfalarıyla aynı tablo dili: kutulu `<Table>` yerine `DataTable` (Tur 3 P1 bulgusu).
 */
export function TransferLinesTable({ lines }: { lines: TransferLineRow[] }) {
  const columns = useMemo<ColumnDef<TransferLineRow, unknown>[]>(
    () => [
      { id: 'productName', accessorFn: (r) => r.productName, header: 'Ürün', meta: { mobile: 'title' }, cell: ({ row }) => <span className="font-medium">{row.original.productName}</span> },
      { id: 'sku', accessorFn: (r) => r.sku, header: 'SKU', meta: { mobile: 'subtitle', className: 'font-mono text-xs text-muted-foreground' } },
      {
        id: 'lot',
        accessorFn: (r) => r.lotNo,
        header: 'Lot',
        meta: { mobile: 'badge' },
        cell: ({ row }) => (row.original.lotNo ? <LotBadge lotNo={row.original.lotNo} id={row.original.line.lotId ?? undefined} /> : <span className="text-xs text-muted-foreground">Lotsuz</span>),
      },
      { id: 'qty', accessorFn: (r) => r.line.qty, header: 'Miktar', meta: { align: 'right', width: 100 }, cell: ({ row }) => <QtyCell value={row.original.line.qty} uom={row.original.uomCode} /> },
      { id: 'fromCode', accessorFn: (r) => r.fromCode, header: 'Kaynak lokasyon', meta: { width: 130, className: 'font-mono text-xs text-muted-foreground' } },
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
