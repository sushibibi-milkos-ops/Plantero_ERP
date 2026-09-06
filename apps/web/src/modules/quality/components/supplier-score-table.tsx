'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { Sparkline } from '@/components/sparkline';
import { formatPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { SupplierBoardRow } from '../queries';

export type { SupplierBoardRow };

function scoreTone(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 85) return 'success';
  if (score >= 65) return 'warning';
  return 'danger';
}

export function SupplierScoreTable({ rows }: { rows: SupplierBoardRow[] }) {
  // kalite-tedarikci-07 (tur 8, P2) kök neden: "Trend" sütunu koşulsuz render ediliyordu; sparkline
  // yalnızca `trend.length > 1` iken çizildiğinden (tek dönemlik veri, ör. seed'de yalnızca 2026-09)
  // sütun tüm satırlarda "—" ile 110px boş yer tutuyordu. Hiçbir satırda birden fazla dönem yoksa
  // sütun listeye hiç eklenmez; ileride ikinci dönem hesaplandığı an (computeSupplierScores) otomatik
  // geri gelir — sabit kodlanmış bir dönem sayısı varsayımı yok.
  const hasTrend = useMemo(() => rows.some((r) => r.trend.length > 1), [rows]);

  const columns = useMemo<ColumnDef<SupplierBoardRow, unknown>[]>(
    () => {
      const cols: ColumnDef<SupplierBoardRow, unknown>[] = [
        { id: 'partnerName', accessorFn: (r) => r.partnerName, header: 'Tedarikçi', meta: { mobile: 'title', flex: true } },
        { accessorKey: 'period', header: 'Dönem', meta: { width: 90, mobile: 'subtitle' } },
        {
          id: 'score', accessorFn: (r) => r.score, header: 'Skor', meta: { width: 130, mobile: 'badge' },
          cell: ({ row }) => {
            const s = row.original.score; const tone = scoreTone(s);
            return (
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full', tone === 'success' && 'bg-success', tone === 'warning' && 'bg-warning', tone === 'danger' && 'bg-destructive')} style={{ width: `${Math.max(0, Math.min(100, s))}%` }} />
                </div>
                <span className="num text-[13px] font-medium">{s.toFixed(0)}</span>
              </div>
            );
          },
        },
      ];
      if (hasTrend) {
        cols.push({ id: 'trend', accessorFn: () => 0, header: 'Trend', meta: { width: 110, mobile: 'hidden', noSort: true }, cell: ({ row }) => (row.original.trend.length > 1 ? <Sparkline data={row.original.trend} tone={scoreTone(row.original.score) === 'danger' ? 'danger' : scoreTone(row.original.score) === 'warning' ? 'info' : 'success'} /> : <span className="text-xs text-muted-foreground">—</span>) });
      }
      cols.push(
        { id: 'onTime', accessorFn: (r) => (r.receipts ? r.onTimeReceipts / r.receipts : 0), header: 'Zamanında', meta: { align: 'right', width: 100, mobile: 'hidden' }, cell: ({ row }) => <span className="num text-[13px]">{row.original.onTimeReceipts}/{row.original.receipts}</span> },
        { id: 'qc', accessorFn: (r) => (r.qcChecks ? r.qcPassed / r.qcChecks : 1), header: 'QC geçme', meta: { align: 'right', width: 100, mobile: 'hidden' }, cell: ({ row }) => <span className="num text-[13px]">{row.original.qcChecks ? `${row.original.qcPassed}/${row.original.qcChecks}` : '—'}</span> },
        { id: 'qtyAccuracy', accessorFn: (r) => r.qtyAccuracyPct, header: 'Miktar doğruluğu', meta: { align: 'right', width: 130, mobile: 'hidden' }, cell: ({ row }) => <span className="num text-[13px]">{formatPct(row.original.qtyAccuracyPct, 1)}</span> },
      );
      return cols;
    },
    [hasTrend],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.partnerId}
      searchPlaceholder="Tedarikçi ara…"
      initialSorting={[{ id: 'score', desc: false }]}
      emptyTitle="Henüz hesaplanmış skor yok"
      emptyDescription="Yukarıdaki dönemi seçip “Skoru Hesapla”ya tıklayın."
    />
  );
}
