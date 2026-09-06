'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Camera, CheckCircle2, Play, XCircle } from 'lucide-react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { statusOptions } from '@/lib/status';
import { formatDateTime } from '@/lib/format';
import { startOrderAction, cancelOrderAction } from '../actions';
import { PRIORITY_TONE } from '../labels';
import type { MaintenanceOrderRow } from '../queries';

export function OrdersTable({
  orders,
  searchable = true,
  filters: filtersProp,
  externallyFiltered = false,
}: {
  orders: MaintenanceOrderRow[];
  /** OrdersView arama/filtreyi görünümden bağımsız üst araç çubuğuna taşıdığında `false` verilir. */
  searchable?: boolean;
  filters?: DataTableFilter[];
  /** `orders` zaten OrdersView'in araç çubuğunca (arama/filtre) daraltıldıysa `true` — boş durum
   *  metni "kayıt yok" yerine "eşleşen kayıt yok" olur (DataTable'ın kendi iç filtre durumu bunu
   *  bilemez, çünkü arama/filtre artık kendi state'inde değil). */
  externallyFiltered?: boolean;
}) {
  const router = useRouter();
  const [cancelTarget, setCancelTarget] = useState<MaintenanceOrderRow | null>(null);

  async function start(row: MaintenanceOrderRow) {
    const res = await startOrderAction({ id: row.id });
    if (res.ok) {
      toast.success(`İş emri işleme alındı: ${row.docNo}`);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  const columns = useMemo<ColumnDef<MaintenanceOrderRow, unknown>[]>(
    () => [
      { accessorKey: 'docNo', header: 'No', meta: { mobile: 'title', className: 'font-mono', width: 130 } },
      {
        // Kriter 5 (Tur 2 P1 bakim-isemirleri-09) kök neden düzeltmesi: aynen plans-table.tsx'teki
        // 'machine' düzeltmesi — `flex:true` tek başına kırpma sağlamıyor, td hâlâ ata `whitespace-
        // nowrap`'ını miras alıyordu; uzun arıza başlıklarında min-content 502px'e şişip 4 sütunu
        // (Öncelik/Durum/foto/Eylemler) ekran dışına itiyordu. `whitespace-normal` + `line-clamp-1`
        // ile hücre tek satıra kırpılır, sütun artık kalan flex alanına gerçekten sığar.
        accessorKey: 'title', header: 'Başlık', meta: { mobile: 'subtitle', flex: true, className: 'whitespace-normal' },
        cell: ({ row }) => (
          <span className="line-clamp-1 leading-[18px] break-words whitespace-normal" title={row.original.title}>
            {row.original.title}
          </span>
        ),
      },
      {
        // Kriter 5 (Tur 2 P1 bakim-isemirleri-09) kök neden düzeltmesi: plans-table.tsx'teki 'machine'
        // sütunuyla birebir aynı kök neden/çözüm (bkz. oradaki uzun yorum) — `meta.width:200` hücre
        // içeriği kırpılmadan min-content'i asla 200px'e indiremez.
        id: 'machine', accessorFn: (r) => `${r.machineCode} ${r.machineName}`, header: 'Makine', meta: { width: 200, mobile: 'hidden', className: 'whitespace-normal' },
        cell: ({ row }) => (
          <span className="line-clamp-1 leading-[18px] break-words whitespace-normal" title={`${row.original.machineCode} ${row.original.machineName}`}>
            <span className="font-mono text-xs text-muted-foreground">{row.original.machineCode}</span> {row.original.machineName}
          </span>
        ),
      },
      { id: 'kind', accessorFn: (r) => r.kind, header: 'Tür', meta: { width: 100, mobile: 'hidden' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="maintenance_kind" /> },
      { id: 'priority', accessorFn: (r) => r.priority, header: 'Öncelik', meta: { width: 110, mobile: 'hidden' }, cell: ({ getValue }) => { const v = getValue<string>(); return <StatusBadge status={v} kind="maintenance_priority" tone={PRIORITY_TONE[v]} />; } },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 130, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="maintenance" /> },
      {
        id: 'photoCount', accessorFn: (r) => r.photoCount, header: '', meta: { width: 40 },
        cell: ({ row }) => (row.original.photoCount > 0 ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Camera className="size-3.5" />{row.original.photoCount}</span> : null),
      },
      { id: 'reportedAt', accessorFn: (r) => r.reportedAt, header: 'Bildirim', meta: { width: 150, defaultHidden: true }, cell: ({ row }) => formatDateTime(row.original.reportedAt) },
    ],
    [],
  );

  const filters: DataTableFilter[] = filtersProp ?? [
    { columnId: 'status', title: 'Durum', options: statusOptions('maintenance') },
    { columnId: 'kind', title: 'Tür', options: statusOptions('maintenance_kind') },
    { columnId: 'priority', title: 'Öncelik', options: statusOptions('maintenance_priority') },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={orders}
        getRowId={(r) => r.id}
        rowHref={(r) => `/bakim/is-emirleri/${r.id}`}
        searchable={searchable}
        searchPlaceholder="İş emri no, başlık, makine ara…"
        filters={filters}
        columnToggle={searchable}
        initialSorting={[{ id: 'reportedAt', desc: true }]}
        emptyTitle={externallyFiltered ? 'Eşleşen kayıt yok' : 'Henüz bakım iş emri yok'}
        emptyDescription={externallyFiltered ? 'Arama ya da filtreleri değiştirmeyi deneyin.' : 'Arıza bildirin ya da bir bakım planından iş emri üretin.'}
        rowActions={(row) => {
          const open = !['done', 'cancelled'].includes(row.status);
          if (!open) return [];
          return [
            ...(['reported', 'planned', 'waiting_parts'].includes(row.status) ? [{ label: 'İşleme al', icon: Play, onSelect: () => start(row) }] : []),
            { label: 'Tamamla', icon: CheckCircle2, href: `/bakim/is-emirleri/${row.id}`, separatorBefore: true },
            { label: 'İptal et', icon: XCircle, destructive: true, onSelect: () => setCancelTarget(row) },
          ];
        }}
      />
      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(v) => !v && setCancelTarget(null)}
        title={`İş emrini iptal et — ${cancelTarget?.docNo}`}
        description="Açık duruş varsa kapatılır, başka açık iş emri kalmadıysa makine boşta durumuna döner."
        destructive
        confirmLabel="İptal et"
        onConfirm={async () => {
          if (!cancelTarget) return;
          const res = await cancelOrderAction({ id: cancelTarget.id });
          if (res.ok) {
            toast.success('İş emri iptal edildi');
            router.refresh();
          }
          return res;
        }}
      />
    </>
  );
}
