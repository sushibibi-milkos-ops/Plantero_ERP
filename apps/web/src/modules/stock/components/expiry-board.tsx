'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { LotBadge } from '@/components/lot-badge';
import { ExpiryBadge, EXPIRY_LEVEL_LABELS, type ExpiryLevel } from '@/components/expiry-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { cn } from '@/lib/utils';
import { scrapExpiredAction } from '../actions';
import type { ExpiryRow, ExpiryBuckets, ExpiryBucket } from '@plantero/core';

const BUCKET_TO_LEVEL: Record<ExpiryBucket, ExpiryLevel> = { expired: 'expired', critical: 'critical', warning: 'warning', notice: 'notice' };
const BUCKET_ORDER: ExpiryBucket[] = ['expired', 'critical', 'warning', 'notice'];

export function ExpiryBoard({ buckets, canScrap }: { buckets: ExpiryBuckets; canScrap: boolean }) {
  const router = useRouter();
  const [activeBucket, setActiveBucket] = useState<ExpiryBucket | null>(null);
  const [scrapTarget, setScrapTarget] = useState<ExpiryRow | null>(null);

  const rows = useMemo(() => (activeBucket ? buckets.rows.filter((r) => r.bucket === activeBucket) : buckets.rows), [buckets.rows, activeBucket]);

  const columns = useMemo<ColumnDef<ExpiryRow, unknown>[]>(
    () => [
      { id: 'lotNo', accessorFn: (r) => r.lotNo, header: 'Lot', meta: { mobile: 'title' }, cell: ({ row }) => <LotBadge lotNo={row.original.lotNo} id={row.original.lotId} /> },
      { accessorKey: 'productName', header: 'Ürün', meta: { mobile: 'subtitle' }, cell: ({ row }) => <span>{row.original.productName} <span className="font-mono text-xs text-muted-foreground">· {row.original.sku}</span></span> },
      { accessorKey: 'locationCode', header: 'Lokasyon', meta: { width: 130, mobile: 'hidden' }, cell: ({ row }) => <span className="font-mono text-xs">{row.original.locationCode}</span> },
      { accessorKey: 'qty', header: 'Miktar', meta: { align: 'right', width: 110 }, cell: ({ row }) => <QtyCell value={row.original.qty} /> },
      { accessorKey: 'value', header: 'Değer', meta: { align: 'right', width: 120 }, cell: ({ row }) => <MoneyCell value={row.original.value} /> },
      { id: 'expiryDate', accessorFn: (r) => r.expiryDate, header: 'SKT', meta: { width: 150, mobile: 'badge' }, cell: ({ row }) => <ExpiryBadge date={row.original.expiryDate} /> },
    ],
    [],
  );

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {BUCKET_ORDER.map((b) => {
          const t = buckets.totals[b];
          const active = activeBucket === b;
          return (
            <button
              key={b}
              type="button"
              onClick={() => setActiveBucket(active ? null : b)}
              data-expiry-level={BUCKET_TO_LEVEL[b]}
              className={cn(
                'rounded-xl border p-4 text-left transition-[border-color,box-shadow]',
                active ? 'border-primary/60 ring-2 ring-primary/15' : 'border-border/70 hover:border-border',
              )}
            >
              <div className="text-[13px] font-medium text-muted-foreground">{EXPIRY_LEVEL_LABELS[BUCKET_TO_LEVEL[b]]}</div>
              <div className="num mt-2 text-2xl font-semibold tabular-nums">{t.count}</div>
              <div className="mt-1 text-xs text-muted-foreground"><MoneyCell value={t.qtyValue} className="text-xs" /></div>
            </button>
          );
        })}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.quantId}
        searchPlaceholder="Lot, ürün ara…"
        initialSorting={[{ id: 'expiryDate', desc: false }]}
        emptyTitle="Bu aralıkta SKT'si yaklaşan lot yok"
        rowActions={canScrap ? (r) => [{ label: 'Hurdaya ayır', icon: Trash2, destructive: true, onSelect: () => setScrapTarget(r) }] : undefined}
      />

      <ConfirmDialog
        open={!!scrapTarget}
        onOpenChange={(v) => !v && setScrapTarget(null)}
        title="Lotu hurdaya ayır"
        description={scrapTarget ? `${scrapTarget.lotNo} (${scrapTarget.productName}) — ${scrapTarget.locationCode} lokasyonundaki ${scrapTarget.qty} miktar hurdaya çıkarılır.` : undefined}
        confirmLabel="Hurdaya ayır"
        destructive
        onConfirm={async () => {
          if (!scrapTarget) return;
          const res = await scrapExpiredAction({ lotId: scrapTarget.lotId, locationId: scrapTarget.locationId, reason: 'SKT geçti' });
          if (res.ok) {
            toast.success('Lot hurdaya ayrıldı');
            router.refresh();
            return undefined;
          }
          return { ok: false, error: res.error };
        }}
      />
    </>
  );
}
