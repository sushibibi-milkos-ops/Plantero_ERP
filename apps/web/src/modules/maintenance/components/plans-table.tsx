'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Play, Power, PowerOff, AlertTriangle } from 'lucide-react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatDate, daysUntil } from '@/lib/format';
import { cn } from '@/lib/utils';
import { setPlanActiveAction, generateOrderNowAction } from '../actions';
import type { PlanRow } from '../queries';

const INTERVAL_LABELS: Record<string, string> = { day: 'gün', week: 'hafta', month: 'ay', runtime_hours: 'çalışma saati' };

export function PlansTable({ plans }: { plans: PlanRow[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function toggleActive(row: PlanRow) {
    setPendingId(row.id);
    const res = await setPlanActiveAction({ id: row.id, isActive: !row.isActive });
    setPendingId(null);
    if (res.ok) {
      toast.success(row.isActive ? 'Plan pasifleştirildi' : 'Plan aktifleştirildi');
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function generateNow(row: PlanRow) {
    setPendingId(row.id);
    const res = await generateOrderNowAction({ id: row.id });
    setPendingId(null);
    if (res.ok) {
      toast.success(res.message ?? 'İş emri oluşturuldu');
      router.push(`/bakim/is-emirleri/${res.data.orderId}`);
    } else {
      toast.error(res.error);
    }
  }

  const columns = useMemo<ColumnDef<PlanRow, unknown>[]>(
    () => [
      { accessorKey: 'name', header: 'Plan', meta: { mobile: 'title', flex: true } },
      {
        id: 'machine', accessorFn: (r) => `${r.machineCode} ${r.machineName}`, header: 'Makine', meta: { mobile: 'subtitle' },
        cell: ({ row }) => (
          <span>
            <span className="font-mono text-xs text-muted-foreground">{row.original.machineCode}</span> {row.original.machineName}
          </span>
        ),
      },
      { id: 'interval', accessorFn: (r) => r.intervalValue, header: 'Aralık', meta: { width: 110 }, cell: ({ row }) => `${row.original.intervalValue} ${INTERVAL_LABELS[row.original.intervalUnit] ?? row.original.intervalUnit}` },
      { id: 'lastDoneAt', accessorFn: (r) => r.lastDoneAt ?? '', header: 'Son yapılan', meta: { width: 120, mobile: 'hidden' }, cell: ({ row }) => (row.original.lastDoneAt ? formatDate(row.original.lastDoneAt) : '—') },
      {
        id: 'nextDueAt', accessorFn: (r) => r.nextDueAt ?? '', header: 'Sonraki', meta: { width: 130 },
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
      { id: 'assignee', accessorFn: (r) => r.assigneeName ?? '', header: 'Sorumlu', meta: { width: 140, mobile: 'hidden' }, cell: ({ row }) => row.original.assigneeName ?? <span className="text-muted-foreground">—</span> },
      {
        id: 'status', accessorFn: (r) => (r.isActive ? 'active' : 'inactive'), header: 'Durum', meta: { width: 100, mobile: 'badge' },
        cell: ({ row }) => (row.original.isActive ? <StatusBadge status="active" label="Aktif" tone="success" /> : <StatusBadge status="inactive" label="Pasif" tone="muted" />),
      },
    ],
    [],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'status', title: 'Durum', options: [{ value: 'active', label: 'Aktif' }, { value: 'inactive', label: 'Pasif' }] },
  ];

  return (
    <DataTable
      columns={columns}
      data={plans}
      getRowId={(r) => r.id}
      searchPlaceholder="Plan adı veya makine ara…"
      filters={filters}
      initialSorting={[{ id: 'nextDueAt', desc: false }]}
      emptyTitle="Henüz bakım planı yok"
      emptyDescription="Bir makine için periyodik plan oluşturun — vadesi geldiğinde worker otomatik iş emri açar."
      rowActions={(row) => [
        { label: row.hasOpenOrder ? 'Açık iş emri var' : 'Şimdi üret', icon: Play, disabled: row.hasOpenOrder || pendingId === row.id, onSelect: () => generateNow(row) },
        row.isActive
          ? { label: 'Pasifleştir', icon: PowerOff, destructive: true, separatorBefore: true, disabled: pendingId === row.id, onSelect: () => toggleActive(row) }
          : { label: 'Aktifleştir', icon: Power, separatorBefore: true, disabled: pendingId === row.id, onSelect: () => toggleActive(row) },
      ]}
    />
  );
}
