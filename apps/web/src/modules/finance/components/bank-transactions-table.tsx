'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, X, Link2, EyeOff } from 'lucide-react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { approveMatchAction, rejectMatchAction, ignoreTransactionAction } from '../actions';
import { ManualMatchDialog } from './manual-match-dialog';
import type { BankTransactionRow } from '../queries';

export function BankTransactionsTable({
  transactions,
  partners,
  canReconcile,
}: {
  transactions: BankTransactionRow[];
  partners: Array<{ id: string; name: string; code: string; kind: string }>;
  canReconcile: boolean;
}) {
  const [rejectTarget, setRejectTarget] = useState<BankTransactionRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [manualTarget, setManualTarget] = useState<BankTransactionRow | null>(null);

  const columns = useMemo<ColumnDef<BankTransactionRow, unknown>[]>(
    () => [
      { accessorKey: 'txDate', header: 'Tarih', meta: { width: 100 }, cell: ({ row }) => formatDate(row.original.txDate) },
      { accessorKey: 'description', header: 'Açıklama', meta: { mobile: 'title' } },
      { id: 'bankAccountCode', accessorFn: (r) => r.bankAccountCode, header: 'Hesap', meta: { width: 110, mobile: 'hidden', className: 'font-mono text-xs' } },
      {
        accessorKey: 'amount', header: 'Tutar', meta: { align: 'right', width: 120 },
        cell: ({ row }) => <MoneyCell value={row.original.amount} currency={row.original.currency} signed />,
      },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 110, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="bank_tx" /> },
      {
        id: 'match', header: 'Öneri / Eşleşme', meta: { mobile: 'row' },
        cell: ({ row }) => {
          const r = row.original;
          if (r.status === 'matched') return <span className="text-muted-foreground">{r.matchedPartnerName ?? '—'}</span>;
          if (r.bestPartnerName) {
            return (
              <span className="text-muted-foreground" title={r.bestRationale ?? undefined}>
                {r.bestPartnerName}{r.bestInvoiceDocNo ? ` — ${r.bestInvoiceDocNo}` : ''} <span className="num text-xs">%{Math.round(Number(r.bestConfidence ?? 0) * 100)}</span>
              </span>
            );
          }
          return <span className="text-muted-foreground/60">—</span>;
        },
      },
    ],
    [],
  );

  const filters: DataTableFilter[] = [{ columnId: 'status', title: 'Durum', options: statusOptions('bank_tx') }];

  return (
    <>
      <DataTable
        columns={columns}
        data={transactions}
        getRowId={(r) => r.id}
        searchPlaceholder="Açıklama, karşı taraf ara…"
        filters={filters}
        initialSorting={[{ id: 'txDate', desc: true }]}
        emptyTitle="Banka hareketi yok"
        emptyDescription="Ekstre içe aktarıldığında hareketler burada listelenir."
        rowActions={
          canReconcile
            ? (r) => {
                const actions = [];
                if (r.status !== 'matched' && r.bestMatchId) {
                  actions.push({
                    label: 'Onayla', icon: Check,
                    onSelect: async () => {
                      const res = await approveMatchAction({ matchId: r.bestMatchId! });
                      if (res.ok) toast.success('Öneri onaylandı; tahsilat/ödeme kaydedildi');
                      else toast.error(res.error);
                    },
                  });
                  actions.push({ label: 'Reddet', icon: X, onSelect: () => setRejectTarget(r) });
                }
                if (r.status !== 'matched') {
                  actions.push({ label: 'Elle eşleştir', icon: Link2, separatorBefore: actions.length > 0, onSelect: () => setManualTarget(r) });
                }
                if (r.status === 'unmatched') {
                  actions.push({
                    label: 'Yok say', icon: EyeOff, destructive: true,
                    onSelect: async () => {
                      const res = await ignoreTransactionAction({ bankTransactionId: r.id });
                      if (res.ok) toast.success('Hareket yok sayıldı');
                      else toast.error(res.error);
                    },
                  });
                }
                return actions;
              }
            : undefined
        }
      />

      <ConfirmDialog
        open={Boolean(rejectTarget)}
        onOpenChange={(v) => { if (!v) { setRejectTarget(null); setRejectReason(''); } }}
        title="Öneriyi reddet"
        description="Bu öneri reddedilir; hareket başka öneri yoksa eşleşmemiş listesine döner."
        confirmLabel="Reddet"
        destructive
        onConfirm={async () => {
          if (!rejectTarget?.bestMatchId) return;
          const res = await rejectMatchAction({ matchId: rejectTarget.bestMatchId, reason: rejectReason || null });
          if (res.ok) { toast.success('Öneri reddedildi'); setRejectReason(''); }
          return res.ok ? undefined : { ok: false, error: res.error };
        }}
      >
        <div className="space-y-1.5">
          <Label className="text-[13px]">Gerekçe (opsiyonel)</Label>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={2} />
        </div>
      </ConfirmDialog>

      <ManualMatchDialog transaction={manualTarget} onOpenChange={(v) => { if (!v) setManualTarget(null); }} partners={partners} />
    </>
  );
}
