'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { QtyCell } from '@/components/qty-cell';
import { MoneyCell } from '@/components/money-cell';
import { formatDateTime } from '@/lib/format';
import { MOVE_KIND_LABELS } from '../labels';
import type { getLotDetail } from '../queries';

type LotDetail = NonNullable<Awaited<ReturnType<typeof getLotDetail>>>;
type MoveRow = LotDetail['moves'][number];

/**
 * Lot detay — "Hareketler" tablosu. `DataTable` client bileşenidir — sütun tanımları bir server
 * component'ten doğrudan prop olarak geçilemez (RSC serileştirme hatası). Diğer modül tabloları
 * gibi kendi 'use client' sarmalayıcısında tanımlanır.
 */
export function LotMovesTable({ moves, uomCode }: { moves: MoveRow[]; uomCode?: string }) {
  const columns = useMemo<ColumnDef<MoveRow, unknown>[]>(
    () => [
      { id: 'moveNo', accessorFn: (r) => r.moveNo, header: 'Hareket', meta: { mobile: 'title', className: 'font-mono text-xs' } },
      {
        id: 'kind',
        accessorFn: (r) => r.kind,
        header: 'Tür',
        meta: { mobile: 'badge' },
        cell: ({ row }) => <StatusBadge status={row.original.kind} label={MOVE_KIND_LABELS[row.original.kind] ?? row.original.kind} tone="neutral" />,
      },
      // Kök neden (Tur 11 P1 depo-lotlar-id-02): üç sütun da (Miktar/Değer/Tarih) mobilde işaretsizdi;
      // tek metrik kuralı `rest`in SONUNCUSUNU seçtiği için metrik "Tarih" oluyor, iki sayısal alan
      // (Miktar, Değer) mobil kartta hiç görünmüyordu. Düzeltme: Tarih bağlam ipucu olarak satır 2'nin
      // soluna (`meta`) taşındı, Değer mobilde tamamen gizlendi (`hidden`) — Miktar artık `rest`in
      // tek/son elemanı olarak metrik konumunu alır (13px tabular-nums).
      { id: 'qty', accessorFn: (r) => r.qty, header: 'Miktar', meta: { align: 'right', width: 100 }, cell: ({ row }) => <QtyCell value={row.original.qty} uom={uomCode} /> },
      { id: 'value', accessorFn: (r) => r.value, header: 'Değer', meta: { align: 'right', width: 110, mobile: 'hidden' }, cell: ({ row }) => <MoneyCell value={row.original.value} /> },
      { id: 'movedAt', accessorFn: (r) => r.movedAt, header: 'Tarih', meta: { width: 130, className: 'text-xs text-muted-foreground', mobile: 'meta' }, cell: ({ row }) => formatDateTime(row.original.movedAt) },
    ],
    [uomCode],
  );

  return (
    <DataTable
      columns={columns}
      data={moves}
      getRowId={(m) => m.id}
      searchable={false}
      columnToggle={false}
      pagination={false}
      emptyTitle="Hareket yok"
    />
  );
}
