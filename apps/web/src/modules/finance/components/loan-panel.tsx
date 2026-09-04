'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2, Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { formatDate, formatMoney, formatPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { recomputeVariableLoanAction } from '../loans-actions';
import type { LoanCardRow } from '../loans-queries';

const BURDEN_COLOR = 'var(--chart-5)';

export function LoanCards({ loans, canEdit }: { loans: LoanCardRow[]; canEdit: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {loans.map((l) => (
        <div key={l.id} className="rounded-xl border border-border/70 bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold">{l.bankName}</div>
              <div className="truncate text-xs text-muted-foreground">{l.productName}</div>
            </div>
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', l.rateKind === 'variable' ? 'bg-warning/15 text-[oklch(0.5_0.14_70)] dark:text-warning' : 'bg-muted text-muted-foreground')}>
              {l.rateKind === 'variable' ? 'Değişken faiz' : 'Sabit faiz'}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5 text-[13px]">
            <div>
              <div className="text-xs text-muted-foreground">Kalan anapara</div>
              <div className="font-mono font-medium tabular-nums">{formatMoney(l.remainingPrincipal, 'TRY', { digits: 0 })}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Aylık taksit</div>
              <div className="font-mono font-medium tabular-nums">{formatMoney(l.monthlyInstallment, 'TRY', { digits: 0 })}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Kalan taksit</div>
              <div className="font-mono font-medium tabular-nums">{l.remainingInstallments}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Bitiş</div>
              <div className="font-mono font-medium tabular-nums">{l.lastDue ? formatDate(l.lastDue) : '—'}</div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <span>Aylık faiz: <span className="font-mono tabular-nums text-foreground">{formatPct(l.monthlyRatePct, 4)}</span></span>
            {canEdit && l.rateKind === 'variable' ? <RateUpdateDialog loanId={l.id} loanCode={l.code} currentRate={l.monthlyRatePct} /> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function RateUpdateDialog({ loanId, loanCode, currentRate }: { loanId: string; loanCode: string; currentRate: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState(currentRate);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-primary hover:bg-primary/10">
          <Percent className="size-3" /> Oran güncelle
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{loanCode} — faiz oranı güncelle</DialogTitle>
          <DialogDescription>Ödenmemiş tüm taksitler yeni orana göre yeniden hesaplanır (anapara/faiz bölüşümü).</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="rate">Yeni aylık faiz oranı (%)</Label>
          <Input id="rate" value={rate} onChange={(e) => setRate(e.target.value)} className="font-mono tabular-nums" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Vazgeç</Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await recomputeVariableLoanAction({ loanId, newMonthlyRatePct: rate });
                if (res.ok) {
                  toast.success(`${res.data.updated} taksit yeniden hesaplandı`);
                  setOpen(false);
                  router.refresh();
                } else {
                  toast.error(res.error);
                }
              })
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Yeniden hesapla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BurdenChart({ points }: { points: Array<{ period: string; total: string }> }) {
  const data = points.map((p) => ({ period: p.period, total: Number(p.total) }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="fill-burden" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={BURDEN_COLOR} stopOpacity={0.16} />
            <stop offset="95%" stopColor={BURDEN_COLOR} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="period" tickFormatter={(v: string) => formatDate(`${v}-01`).slice(3)} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} minTickGap={28} />
        <YAxis tickFormatter={(v: number) => formatMoney(v, 'TRY', { digits: 0, compact: true })} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={64} />
        <Tooltip
          isAnimationActive={false}
          wrapperStyle={{ outline: 'none' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <div className="rounded-lg border border-border/70 bg-popover p-2.5 text-xs shadow-md">
                <div className="mb-1 font-medium">{formatDate(`${label}-01`)}</div>
                <span className="num tabular-nums">{formatMoney(payload[0]!.value as number, 'TRY', { digits: 0 })}</span>
              </div>
            ) : null
          }
        />
        <Area type="linear" dataKey="total" name="Toplam aylık taksit" stroke={BURDEN_COLOR} strokeWidth={2} fill="url(#fill-burden)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export type ConsolidatedCell = { installment: string; status: string } | undefined;

export function ConsolidatedScheduleTable({
  periods,
  loanCodes,
  cellByKey,
  totalsByPeriod,
}: {
  periods: string[];
  loanCodes: string[];
  cellByKey: Map<string, { installment: string; status: string }>;
  totalsByPeriod: Map<string, { installment: string; paidCount: number; totalCount: number }>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/70 bg-card">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-border/60">
            <th className="sticky left-0 z-10 min-w-28 bg-card px-3 py-2 text-left text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Dönem</th>
            {loanCodes.map((code) => (
              <th key={code} className="min-w-24 px-3 py-2 text-right text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{code}</th>
            ))}
            <th className="min-w-28 px-3 py-2 text-right text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Toplam</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => {
            const totals = totalsByPeriod.get(period);
            return (
              <tr key={period} className="border-b border-border/40 hover:bg-muted/30">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-1.5">{formatDate(`${period}-01`)}</td>
                {loanCodes.map((code) => {
                  const cell = cellByKey.get(`${period}:${code}`);
                  if (!cell) return <td key={code} className="px-3 py-1.5 text-right text-muted-foreground/40">—</td>;
                  return (
                    <td key={code} className={cn('px-3 py-1.5 text-right font-mono tabular-nums', cell.status === 'paid' ? 'text-success' : cell.status === 'overdue' ? 'text-destructive' : 'text-foreground')}>
                      {formatMoney(cell.installment, 'TRY', { digits: 0 })}
                      {cell.status === 'paid' ? ' ✓' : ''}
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 text-right font-mono font-semibold tabular-nums">
                  {totals ? formatMoney(totals.installment, 'TRY', { digits: 0 }) : '—'}
                  {totals ? <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">({totals.paidCount}/{totals.totalCount})</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
