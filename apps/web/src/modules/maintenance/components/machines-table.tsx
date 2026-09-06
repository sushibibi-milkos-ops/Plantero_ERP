'use client';

import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { QtyCell } from '@/components/qty-cell';
import { statusOptions } from '@/lib/status';
import { formatDate, daysUntil } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { MachineListRow } from '../queries';

const CATEGORY_LABELS: Record<string, string> = {
  mixer: 'Mikser', homogenizer: 'Homojenizatör', tank: 'Tank', filler: 'Dolum', sealer: 'Kapatma',
  coder: 'Kodlama', kettle: 'Kazan', hopper: 'Tekne', conveyor: 'Taşıyıcı', packaging: 'Paketleme',
  grinder: 'Öğütücü', roaster: 'Kavurma', inspection: 'Kontrol', lab: 'Laboratuvar', utility: 'Yardımcı tesis',
  handling: 'Taşıma', scale: 'Tartı',
};

export function MachinesTable({ machines }: { machines: MachineListRow[] }) {
  const columns = useMemo<ColumnDef<MachineListRow, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Kod', meta: { mobile: 'title', className: 'font-mono', width: 90 } },
      {
        id: 'name', accessorFn: (r) => r.name, header: 'Makine', meta: { mobile: 'subtitle', flex: true },
        cell: ({ row }) => (
          <div>
            <div>{row.original.name}</div>
            <div className="text-[11px] text-muted-foreground">{CATEGORY_LABELS[row.original.category] ?? row.original.category}</div>
          </div>
        ),
      },
      { id: 'lineCode', accessorFn: (r) => r.lineCode ?? '—', header: 'Hat', meta: { width: 90, mobile: 'hidden' } },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 120, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="machine" /> },
      {
        id: 'nextDueAt', accessorFn: (r) => r.nextDueAt ?? '', header: 'Sonraki bakım', meta: { width: 140 },
        cell: ({ row }) => {
          const v = row.original.nextDueAt;
          if (!v) return <span className="text-muted-foreground">—</span>;
          const d = daysUntil(v) ?? 0;
          return (
            <span className={cn('inline-flex items-center gap-1', d < 0 && 'font-medium text-destructive')}>
              {d < 0 ? <AlertTriangle className="size-3.5" /> : null}
              {formatDate(v)}
            </span>
          );
        },
      },
      {
        id: 'runtimeHours', accessorFn: (r) => Number(r.runtimeHours), header: 'Çalışma saati', meta: { align: 'right', width: 110, mobile: 'hidden', className: 'num tabular-nums' },
        cell: ({ row }) => <QtyCell value={row.original.runtimeHours} uom="sa" />,
      },
      {
        id: 'openOrderCount', accessorFn: (r) => r.openOrderCount, header: 'Açık iş emri', meta: { align: 'right', width: 100 },
        cell: ({ row }) => (row.original.openOrderCount > 0 ? <span className="num font-medium text-warning">{row.original.openOrderCount}</span> : <span className="num text-muted-foreground">0</span>),
      },
    ],
    [],
  );

  const filters: DataTableFilter[] = [{ columnId: 'status', title: 'Durum', options: statusOptions('machine') }];

  return (
    <DataTable
      columns={columns}
      data={machines}
      getRowId={(r) => r.id}
      rowHref={(r) => `/bakim/makineler/${r.id}`}
      searchPlaceholder="Makine kodu veya adı ara…"
      filters={filters}
      initialSorting={[{ id: 'code', desc: false }]}
      emptyTitle="Henüz makine kaydı yok"
      emptyDescription="Bakım seed'i çalıştırıldığında kapasite raporundaki 36 makine burada listelenir."
    />
  );
}
