'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { formatQty, formatDateTime } from '@/lib/format';
// Alt-yol içe aktarımı ('@plantero/core/money', barrel değil): kök giriş noktası node:crypto kullanan
// sunucu-yalnızca auth/session.ts'i de dışa aktarıyor — 'use client' bileşeninde barrel'dan import
// tarayıcı paketini kırar (bkz. counts-table.tsx aynı düzeltme).
import { D } from '@plantero/core/money';
import { cn } from '@/lib/utils';
import type { CriticalStockRow } from '../queries';

const RISK_LABEL: Record<CriticalStockRow['risk'], string> = { critical: 'Kritik', warning: 'Uyarı', none: 'Normal' };
const RISK_CLASS: Record<CriticalStockRow['risk'], string> = {
  critical: 'bg-destructive/10 text-destructive',
  warning: 'bg-warning/15 text-[oklch(0.5_0.14_70)] dark:text-warning',
  none: 'bg-muted/60 text-muted-foreground',
};

export function CriticalStockTable({ rows, onlyCritical }: { rows: CriticalStockRow[]; onlyCritical: boolean }) {
  const filtered = useMemo(() => (onlyCritical ? rows.filter((r) => r.risk !== 'none') : rows), [rows, onlyCritical]);

  const columns = useMemo<ColumnDef<CriticalStockRow, unknown>[]>(
    () => [
      { id: 'productName', accessorFn: (r) => r.productName, header: 'Ürün', meta: { mobile: 'title' } },
      { id: 'sku', accessorFn: (r) => r.sku, header: 'SKU', meta: { mobile: 'subtitle', className: 'font-mono text-xs' } },
      {
        id: 'risk', accessorFn: (r) => r.risk, header: 'Risk', meta: { width: 100, mobile: 'badge' },
        cell: ({ row }) => <span className={cn('inline-flex h-5 items-center rounded-full px-2 text-xs font-medium', RISK_CLASS[row.original.risk])}>{RISK_LABEL[row.original.risk]}</span>,
      },
      { accessorKey: 'available', header: 'Kullanılabilir', meta: { align: 'right', width: 110 }, cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums">{formatQty(row.original.available)}</span> },
      { accessorKey: 'minQty', header: 'Min', meta: { align: 'right', width: 80, mobile: 'hidden' }, cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{formatQty(row.original.minQty)}</span> },
      { accessorKey: 'maxQty', header: 'Max', meta: { align: 'right', width: 80, mobile: 'hidden' }, cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{formatQty(row.original.maxQty)}</span> },
      {
        accessorKey: 'daysOfCover', header: 'Kapsama (gün)', meta: { align: 'right', width: 110 },
        cell: ({ row }) => (row.original.daysOfCover === null ? <span className="text-muted-foreground">—</span> : <span className="font-mono text-[13px] tabular-nums">{D(row.original.daysOfCover).toFixed(1)}</span>),
      },
      { accessorKey: 'leadTimeDays', header: 'Lead time', meta: { align: 'right', width: 90, mobile: 'hidden' }, cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{row.original.leadTimeDays}g</span> },
      {
        id: 'suggestedQty', accessorFn: (r) => r.suggestedQty, header: 'Önerilen sipariş', meta: { align: 'right', width: 130 },
        cell: ({ row }) => (D(row.original.suggestedQty).gt(0) ? <span className="font-mono text-[13px] font-medium tabular-nums text-primary">{formatQty(row.original.suggestedQty)}</span> : <span className="text-muted-foreground">—</span>),
      },
      {
        id: 'preferredSupplierName', accessorFn: (r) => r.preferredSupplierName, header: 'Tercihli tedarikçi', meta: { mobile: 'hidden' },
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <span>{row.original.preferredSupplierName ?? <span className="text-muted-foreground">—</span>}</span>
            {row.original.isAutoOrderWhitelisted && row.original.supplierWhitelisted ? <span className="inline-flex h-4 items-center rounded-full bg-success/12 px-1.5 text-[10px] font-medium text-success">Beyaz liste</span> : null}
          </div>
        ),
      },
      { id: 'lastEvaluatedAt', accessorFn: (r) => r.lastEvaluatedAt, header: 'Son değerlendirme', meta: { width: 150, mobile: 'hidden' }, cell: ({ row }) => (row.original.lastEvaluatedAt ? formatDateTime(row.original.lastEvaluatedAt) : <span className="text-muted-foreground">Hiç çalışmadı</span>) },
    ],
    [],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'risk', title: 'Risk', options: [{ value: 'critical', label: 'Kritik' }, { value: 'warning', label: 'Uyarı' }, { value: 'none', label: 'Normal' }] },
  ];

  return (
    <DataTable
      columns={columns}
      data={filtered}
      getRowId={(r) => r.ruleId}
      searchPlaceholder="Ürün, SKU ara…"
      filters={filters}
      initialSorting={[{ id: 'suggestedQty', desc: true }]}
      emptyTitle="Kritik stok kuralı yok"
      emptyDescription="Kural tanımlı ürün bulunamadı."
    />
  );
}
