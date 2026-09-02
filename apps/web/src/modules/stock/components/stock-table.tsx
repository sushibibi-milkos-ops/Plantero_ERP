'use client';

import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { LotBadge } from '@/components/lot-badge';
import { ExpiryBadge } from '@/components/expiry-badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { PRODUCT_TYPE_LABELS, PRODUCT_TYPE_TONE } from '../labels';
import type { StockRow } from '../queries';

export function StockTable({ rows }: { rows: StockRow[] }) {
  const [selected, setSelected] = useState<StockRow | null>(null);
  const [onlyCritical, setOnlyCritical] = useState(false);

  const data = useMemo(() => (onlyCritical ? rows.filter((r) => r.isCritical) : rows), [rows, onlyCritical]);

  const columns = useMemo<ColumnDef<StockRow, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Ürün',
        meta: { mobile: 'title' },
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
            {row.original.isCritical ? <span className="size-1.5 shrink-0 rounded-full bg-destructive" title="Kritik stok (min. seviye altı)" /> : null}
          </span>
        ),
      },
      { accessorKey: 'sku', header: 'SKU', meta: { className: 'font-mono text-xs text-muted-foreground', mobile: 'subtitle' } },
      {
        id: 'type',
        accessorFn: (r) => r.type,
        header: 'Tip',
        meta: { width: 130, mobile: 'badge' },
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} label={PRODUCT_TYPE_LABELS[getValue<string>()] ?? getValue<string>()} tone={PRODUCT_TYPE_TONE[getValue<string>()] ?? 'neutral'} />,
      },
      { accessorKey: 'warehouseCode', header: 'Depo', meta: { width: 90, mobile: 'badge' }, cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span> },
      { accessorKey: 'qty', header: 'Eldeki', meta: { align: 'right', width: 110 }, cell: ({ row }) => <QtyCell value={row.original.qty} uom={row.original.uomCode} /> },
      { accessorKey: 'reserved', header: 'Rezerve', meta: { align: 'right', width: 100, mobile: 'hidden' }, cell: ({ row }) => <QtyCell value={row.original.reserved} uom={row.original.uomCode} /> },
      { accessorKey: 'available', header: 'Kullanılabilir', meta: { align: 'right', width: 120 }, cell: ({ row }) => <QtyCell value={row.original.available} uom={row.original.uomCode} /> },
      { accessorKey: 'value', header: 'Değer', meta: { align: 'right', width: 130 }, cell: ({ row }) => <MoneyCell value={row.original.value} /> },
      {
        accessorKey: 'nearestExpiryDate',
        header: 'En yakın SKT',
        meta: { width: 140, mobile: 'hidden' },
        cell: ({ row }) => (row.original.nearestExpiryDate ? <ExpiryBadge date={row.original.nearestExpiryDate} /> : <span className="text-xs text-muted-foreground/60">—</span>),
      },
      {
        id: '__expand',
        header: () => <span className="sr-only">Detay</span>,
        enableSorting: false,
        meta: { width: 28, mobile: 'hidden' },
        cell: () => <ChevronRight className="size-3.5 text-muted-foreground/50" />,
      },
    ],
    [],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'type', title: 'Tip', options: Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => ({ value, label })) },
    { columnId: 'warehouseCode', title: 'Depo', options: Array.from(new Set(rows.map((r) => r.warehouseCode))).map((v) => ({ value: v, label: v })) },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        getRowId={(r) => `${r.productId}:${r.warehouseId}`}
        searchPlaceholder="Ürün, SKU ara…"
        filters={filters}
        initialSorting={[{ id: 'name', desc: false }]}
        onRowClick={(r) => setSelected(r)}
        emptyTitle="Stok kaydı yok"
        emptyDescription="Mal kabul yapıldıkça burada listelenecek."
        toolbarExtra={
          <label className="flex h-8 items-center gap-2 rounded-md border border-border/70 px-2.5 text-[13px]">
            <Switch checked={onlyCritical} onCheckedChange={setOnlyCritical} className="scale-90" />
            <span>Sadece kritik</span>
          </label>
        }
      />

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription>
                  {selected.sku} · {selected.warehouseName} — lot/lokasyon kırılımı
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-2 px-4 pb-4">
                {selected.breakdown.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Kayıt yok</p>
                ) : (
                  selected.breakdown
                    .sort((a, b) => (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999'))
                    .map((b) => (
                      <div key={b.quantId} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-[13px]">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">{b.locationCode}</span>
                            {b.usage === 'quarantine' ? <StatusBadge status="quarantine" kind="lot" size="sm" /> : null}
                          </div>
                          {b.lotNo ? <LotBadge lotNo={b.lotNo} status={b.lotStatus} id={b.lotId ?? undefined} /> : <span className="text-xs text-muted-foreground">Lotsuz</span>}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <QtyCell value={b.qty} uom={selected.uomCode} />
                          {b.expiryDate ? <ExpiryBadge date={b.expiryDate} showDate={false} /> : null}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
