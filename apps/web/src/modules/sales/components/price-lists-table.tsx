'use client';

import { useMemo, useState } from 'react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { EmptyCell } from '@/components/empty-cell';
import { PriceListDrawer } from './price-list-drawer';
import { formatDate } from '@/lib/format';
import type { listPriceListsWithCounts, SellableProductRow } from '../queries';

type Row = Awaited<ReturnType<typeof listPriceListsWithCounts>>[number];

export function PriceListsTable({ rows, products }: { rows: Row[]; products: SellableProductRow[] }) {
  // Drawer tek örnek olarak yukarı taşındı: "Satırlar (33)" hem sayaç hem kalıcı çerçeveli eylem
  // düğmesiydi — artık düz sağa hizalı rakam, açma eylemi satır tıklamasına devredildi.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        id: 'name', accessorFn: (r) => r.name, header: 'Liste', meta: { width: 360, mobile: 'title' },
        cell: ({ row }) => (
          <div className="flex items-baseline gap-2">
            <span className="font-medium">{row.original.name}</span>
            <span className="font-mono text-xs text-muted-foreground">{row.original.code}</span>
          </div>
        ),
      },
      // 930px genişliğe yayılan "Liste" kolonu (en uzun içerik ~400px) satır başına 530px ölü alan
      // bırakıyordu — sabit width + doldurucu bir "Kanal" kolonu eklendi (defaultHidden kaldırıldı).
      { id: 'channelName', accessorFn: (r) => r.channelName ?? '', header: 'Kanal', meta: { mobile: 'meta' }, cell: ({ row }) => row.original.channelName ?? <EmptyCell /> },
      { id: 'currency', accessorFn: (r) => r.currency, header: 'Para birimi', meta: { width: 100, className: 'font-mono text-xs', mobile: 'meta' } },
      { id: 'includesVat', header: 'KDV', meta: { width: 80, mobile: 'hidden' }, cell: ({ row }) => (row.original.includesVat ? 'Dahil' : 'Hariç') },
      {
        id: 'validity', header: 'Geçerlilik', meta: { mobile: 'hidden', className: 'text-xs text-muted-foreground' },
        cell: ({ row }) => (row.original.validFrom ? formatDate(row.original.validFrom) : 'Süresiz') + (row.original.validTo ? ` → ${formatDate(row.original.validTo)}` : ''),
      },
      {
        // Sayaç: düz sağa hizalı rakam (Linear deseni) — eylem satır tıklamasında.
        id: 'items', accessorFn: (r) => r.itemCount, header: 'Satır', meta: { align: 'right', width: 64, mobile: 'row' },
        cell: ({ row }) => <span className="num tabular-nums">{row.original.itemCount}</span>,
      },
    ],
    [],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        onRowClick={(r) => setSelectedId(r.id)}
        searchPlaceholder="Liste adı, kod, kanal ara…"
        emptyTitle="Henüz fiyat listesi yok"
        emptyDescription="Kanal bazlı fiyat listesi seed ile yüklenir."
      />
      {selected ? (
        <PriceListDrawer
          listId={selected.id}
          listName={selected.name}
          currency={selected.currency}
          itemCount={selected.itemCount}
          products={products}
          open={selectedId !== null}
          onOpenChange={(v) => !v && setSelectedId(null)}
        />
      ) : null}
    </>
  );
}
