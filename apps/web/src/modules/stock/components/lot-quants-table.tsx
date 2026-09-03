'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { QtyCell } from '@/components/qty-cell';
import { LOCATION_USAGE_LABELS } from '../labels';
import type { getLotDetail } from '../queries';

type LotDetail = NonNullable<Awaited<ReturnType<typeof getLotDetail>>>;
type QuantRow = LotDetail['quants'][number];

/**
 * Lot detay — "Eldeki stok" (quant) tablosu. `DataTable` client bileşenidir — sütun tanımları bir
 * server component'ten doğrudan prop olarak geçilemez (RSC serileştirme hatası). Diğer modül
 * tabloları gibi kendi 'use client' sarmalayıcısında tanımlanır.
 */
export function LotQuantsTable({ quants, uomCode }: { quants: QuantRow[]; uomCode?: string }) {
  const columns = useMemo<ColumnDef<QuantRow, unknown>[]>(
    () => [
      { id: 'locationCode', accessorFn: (r) => r.locationCode, header: 'Lokasyon', meta: { mobile: 'title', className: 'font-mono text-xs' } },
      {
        id: 'usage',
        accessorFn: (r) => r.usage,
        header: 'Kullanım',
        meta: { mobile: 'badge' },
        cell: ({ row }) => <StatusBadge status={row.original.usage} label={LOCATION_USAGE_LABELS[row.original.usage] ?? row.original.usage} tone={row.original.usage === 'quarantine' ? 'warning' : row.original.usage === 'rejected' ? 'danger' : 'neutral'} />,
      },
      { id: 'qty', accessorFn: (r) => r.qty, header: 'Eldeki', meta: { align: 'right', width: 110 }, cell: ({ row }) => <QtyCell value={row.original.qty} uom={uomCode} /> },
      { id: 'reserved', accessorFn: (r) => r.reserved, header: 'Rezerve', meta: { align: 'right', width: 110 }, cell: ({ row }) => <QtyCell value={row.original.reserved} uom={uomCode} /> },
    ],
    [uomCode],
  );

  return (
    <DataTable
      columns={columns}
      data={quants}
      getRowId={(q) => q.id}
      searchable={false}
      columnToggle={false}
      pagination={false}
      emptyTitle="Eldeki stok yok"
    />
  );
}
