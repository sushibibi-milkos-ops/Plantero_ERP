'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { QtyCell } from '@/components/qty-cell';
import { MoneyCell } from '@/components/money-cell';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
import type { WorkOrderRow } from '../queries';

export function WorkOrdersTable({ workOrders }: { workOrders: WorkOrderRow[] }) {
  // /uretim/hatlar kartındaki hat başlığı buraya `?hat=HAT1` ile bağlanır — sayfa açılışında hat
  // sütununu ön filtreler (DataTable'ın kendi arama/filtre kutuları hâlâ değiştirilebilir).
  const searchParams = useSearchParams();
  const hatParam = searchParams.get('hat');
  const initialColumnFilters = useMemo(() => (hatParam ? [{ id: 'lineCode', value: [hatParam] }] : []), [hatParam]);

  const columns = useMemo<ColumnDef<WorkOrderRow, unknown>[]>(
    () => [
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'İş emri', meta: { mobile: 'title', className: 'font-mono' } },
      { accessorKey: 'productName', header: 'Ürün', meta: { mobile: 'subtitle' }, cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate">{row.original.productName}</div>
          <div className="font-mono text-[11px] text-muted-foreground">{row.original.sku}</div>
        </div>
      ) },
      { accessorKey: 'lineCode', header: 'Hat', meta: { width: 88, mobile: 'meta' }, cell: ({ row }) => <span className="font-mono text-xs">{row.original.lineCode}</span> },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 130, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="work_order" /> },
      { accessorKey: 'plannedQty', header: 'Planlanan', meta: { align: 'right', width: 110 }, cell: ({ row }) => <QtyCell value={row.original.plannedQty} uom={row.original.uomCode} /> },
      { accessorKey: 'producedQty', header: 'Üretilen', meta: { align: 'right', width: 110 }, cell: ({ row }) => <QtyCell value={row.original.producedQty} uom={row.original.uomCode} /> },
      { accessorKey: 'yieldPct', header: 'Verim', meta: { align: 'right', width: 92, mobile: 'hidden' }, cell: ({ row }) => (row.original.yieldPct ? <span className="num text-xs">%{Number(row.original.yieldPct).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</span> : <span className="text-muted-foreground">—</span>) },
      { accessorKey: 'scrapQty', header: 'Fire', meta: { align: 'right', width: 90, mobile: 'hidden' }, cell: ({ row }) => (Number(row.original.scrapQty) > 0 ? <QtyCell value={row.original.scrapQty} uom={row.original.uomCode} className="text-destructive" /> : <span className="text-muted-foreground">—</span>) },
      // `defaultHidden`: masaüstünde 1440px'de 11 sütun sığmıyordu (ölçüldü ~1408px > ~1152px içerik
      // alanı) — Operatör ve Birim maliyet en az başvurulan iki sütun, sütun seçiciden açılabilir.
      { accessorKey: 'plannedStart', header: 'Planlanan başlangıç', meta: { width: 130, mobile: 'meta' }, cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.plannedStart ? formatDate(row.original.plannedStart) : '—'}</span> },
      { accessorKey: 'operatorName', header: 'Operatör', meta: { width: 130, mobile: 'hidden', defaultHidden: true }, cell: ({ row }) => row.original.operatorName ?? <span className="text-muted-foreground">—</span> },
      { accessorKey: 'unitCost', header: 'Birim maliyet', meta: { align: 'right', width: 110, mobile: 'hidden', defaultHidden: true }, cell: ({ row }) => <MoneyCell value={row.original.unitCost} digits={4} muted={Number(row.original.unitCost) === 0} /> },
    ],
    [],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'status', title: 'Durum', options: statusOptions('work_order') },
    { columnId: 'lineCode', title: 'Hat', options: Array.from(new Set(workOrders.map((w) => w.lineCode))).map((v) => ({ value: v, label: v })) },
  ];

  return (
    <DataTable
      columns={columns}
      data={workOrders}
      getRowId={(r) => r.id}
      rowHref={(r) => `/uretim/is-emirleri/${r.id}`}
      searchPlaceholder="İş emri no, ürün ara…"
      filters={filters}
      initialSorting={[{ id: 'plannedStart', desc: true }]}
      initialColumnFilters={initialColumnFilters}
      emptyTitle="Henüz iş emri yok"
      emptyDescription="Üretim planlamak için “Yeni iş emri” ile başlayın."
    />
  );
}
