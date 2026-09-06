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
import { INTERVAL_UNIT_LABELS } from '../labels';

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
        // Kriter 5 (Tur 1 P1 bakim-planlar-01) kök neden düzeltmesi: bu sütun ne `meta.width` ne
        // `meta.flex` taşıyordu — uzun makine adları sütunu şişiriyor, sabit genişlikli 5 sütun
        // (110+120+130+140+100=600px) 1440px'de kalan alanı 'Sorumlu'/satır eylemlerine bırakmıyordu
        // (tablo kabı scrollWidth 1386 > clientWidth 1152). `flex` artık YALNIZCA 'name' sütununda.
        // `width:200` + salt `overflow-hidden` (Tailwind `truncate`) YETMEDİ: hücre hâlâ ata TD'nin
        // `whitespace-nowrap`'ını miras alıyordu — CSS auto tablo düzeni bir sütunu KENDİ min-content
        // genişliğinin (nowrap'ta TÜM metnin kırılmaz genişliği) altına asla indiremez; overflow:hidden
        // yalnızca kutu boyutu belirlendikten SONRAKİ çizimi kırpar, boyutlandırma algoritmasını
        // etkilemez (ölçüldü: en uzun makine adında `width:200px` inline stiline rağmen gerçek genişlik
        // 471px'e çıktı). Kök neden düzeltmesi: hücre içeriği `whitespace-normal` ile kelime
        // kırılmasına açılır (min-content artık TÜM ifade değil, EN UZUN TEK kelime — çok daha dar) ve
        // `line-clamp-1` tek satıra görsel olarak kırpar (…) — sonuç, TD gerçekten 200px'e sabitlenir.
        id: 'machine', accessorFn: (r) => `${r.machineCode} ${r.machineName}`, header: 'Makine', meta: { mobile: 'subtitle', width: 200, className: 'whitespace-normal' },
        cell: ({ row }) => (
          <span className="line-clamp-1 leading-[18px] break-words whitespace-normal" title={`${row.original.machineCode} ${row.original.machineName}`}>
            <span className="font-mono text-xs text-muted-foreground">{row.original.machineCode}</span> {row.original.machineName}
          </span>
        ),
      },
      { id: 'interval', accessorFn: (r) => r.intervalValue, header: 'Aralık', meta: { width: 110 }, cell: ({ row }) => `${row.original.intervalValue} ${INTERVAL_UNIT_LABELS[row.original.intervalUnit] ?? row.original.intervalUnit}` },
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
