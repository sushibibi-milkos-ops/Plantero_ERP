'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import type { PartnerListRow } from '../queries';
import { PARTNER_KIND_LABELS } from '../product-labels';

export function PartnersTable({ partners }: { partners: PartnerListRow[] }) {
  const columns = useMemo<ColumnDef<PartnerListRow, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Kod', meta: { className: 'font-mono text-[12px]', width: 100 } },
      { accessorKey: 'name', header: 'Ad', meta: { mobile: 'title', className: 'font-medium' } },
      {
        accessorKey: 'kind',
        header: 'Tip',
        meta: { mobile: 'badge', width: 150 },
        cell: ({ getValue }) => {
          const k = getValue<string>();
          return <StatusBadge status={k} label={PARTNER_KIND_LABELS[k] ?? k} tone={k === 'customer' ? 'info' : k === 'supplier' ? 'primary' : 'neutral'} />;
        },
      },
      {
        accessorKey: 'channelName',
        header: 'Kanal',
        meta: { mobile: 'hidden' },
        cell: ({ getValue }) => getValue<string | null>() ?? <span className="text-muted-foreground/50">—</span>,
      },
      {
        id: 'term',
        accessorFn: (r) => (r.paymentTermKind === 'cash' ? 'Peşin' : `${r.paymentTermDays} gün`),
        header: 'Vade',
        meta: { mobile: 'hidden', width: 84 },
      },
      {
        accessorKey: 'balance',
        header: 'Bakiye',
        // Pozitif bakiye nötr: alacak "iyi" bir olay değil, yalnızca "sıfırdan farklı" demek. Renk yalnızca
        // gerçek sinyalde kullanılır — negatif (borç) MoneyCell tarafından zaten kırmızı basılır.
        meta: { align: 'right', width: 120 },
        cell: ({ getValue }) => <MoneyCell value={getValue<string>()} />,
      },
      {
        accessorKey: 'supplierQualityScore',
        header: 'Kalite Skoru',
        // Yalnızca tedarikçilerde dolu — nadiren bakılır, dar ekranda taşan sütun; varsayılan gizli.
        meta: { align: 'right', width: 120, mobile: 'hidden', defaultHidden: true },
        cell: ({ getValue }) => {
          const v = getValue<string | null>();
          return v ? <span className="num">{Number(v).toFixed(0)}</span> : <span className="text-muted-foreground/50">—</span>;
        },
      },
      {
        accessorKey: 'isActive',
        header: 'Durum',
        // Aktif = varsayılan; gürültü yaratmasın diye rozet yalnızca pasif için gösterilir.
        meta: { mobile: 'badge', width: 48 },
        cell: ({ getValue }) =>
          getValue<boolean>() ? (
            <span className="inline-block size-1.5 rounded-full bg-success" aria-label="Aktif" title="Aktif" />
          ) : (
            <StatusBadge status="inactive" />
          ),
      },
    ],
    [],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'kind', title: 'Tip', options: Object.entries(PARTNER_KIND_LABELS).map(([value, label]) => ({ value, label })) },
  ];

  return (
    <DataTable
      columns={columns}
      data={partners}
      getRowId={(p) => p.id}
      searchPlaceholder="Kod veya ad ara…"
      filters={filters}
      initialSorting={[{ id: 'name', desc: false }]}
      rowHref={(p) => `/ana-veri/cariler/${p.id}`}
      emptyTitle="Henüz cari yok"
      emptyDescription="Yeni bir müşteri ya da tedarikçi ekleyin."
    />
  );
}
