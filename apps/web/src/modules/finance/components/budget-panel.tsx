'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { refreshBudgetActualsAction } from '../budget-actions';
import type { BudgetLineRow } from '../budget-queries';

const PLANNED_COLOR = 'var(--muted-foreground)';
const ACTUAL_COLOR = 'var(--chart-5)';

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey?: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const planned = payload.find((p) => p.dataKey === 'planned')?.value ?? 0;
  const actual = payload.find((p) => p.dataKey === 'actual')?.value ?? 0;
  return (
    <div className="min-w-40 rounded-lg border border-border/70 bg-popover p-2.5 text-xs shadow-md">
      <div className="mb-1.5 font-medium">{label ? formatDate(`${label}-01`) : ''}</div>
      <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Plan</span><span className="num tabular-nums">{formatMoney(planned, 'TRY', { digits: 0 })}</span></div>
      <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Gerçekleşen</span><span className="num tabular-nums">{formatMoney(actual, 'TRY', { digits: 0 })}</span></div>
    </div>
  );
}

export function RefreshActualsButton({ year }: { year: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await refreshBudgetActualsAction({ year });
          if (res.ok) {
            toast.success(`Gerçekleşenler yenilendi: ${res.data.budgetLinesUpdated} satır, ${res.data.cashflowLinesUpdated} ay`);
            router.refresh();
          } else {
            toast.error(res.error);
          }
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
      Gerçekleşenleri yenile
    </Button>
  );
}

type Kind = 'revenue' | 'fixed_expense';

export function BudgetPanel({ lines, summary }: { lines: BudgetLineRow[]; summary: Array<{ period: string; kind: string; planned: string; actual: string }> }) {
  const [kindFilter, setKindFilter] = useState<Kind>('revenue');

  const chartData = useMemo(
    () => summary.filter((s) => s.kind === kindFilter).map((s) => ({ period: s.period, planned: Number(s.planned), actual: Number(s.actual) })).sort((a, b) => (a.period < b.period ? -1 : 1)),
    [summary, kindFilter],
  );

  const filteredLines = useMemo(() => lines.filter((l) => l.kind === kindFilter), [lines, kindFilter]);
  const grouped = useMemo(() => {
    const byPeriod = new Map<string, BudgetLineRow[]>();
    for (const l of filteredLines) {
      const arr = byPeriod.get(l.period) ?? [];
      arr.push(l);
      byPeriod.set(l.period, arr);
    }
    return [...byPeriod.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }, [filteredLines]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/70 bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex gap-1 rounded-lg bg-muted p-0.5">
            {(['revenue', 'fixed_expense'] as Kind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKindFilter(k)}
                className={cn('rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors', kindFilter === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                {k === 'revenue' ? 'Ciro' : 'Sabit gider'}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="period" tickFormatter={(v: string) => formatDate(`${v}-01`).slice(3)} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} minTickGap={20} />
            <YAxis tickFormatter={(v: number) => formatMoney(v, 'TRY', { digits: 0, compact: true })} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={64} />
            <Tooltip content={<CustomTooltip />} isAnimationActive={false} wrapperStyle={{ outline: 'none' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === 'planned' ? 'Plan' : 'Gerçekleşen')} />
            <Bar dataKey="planned" name="planned" fill={PLANNED_COLOR} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="actual" name="actual" fill={ACTUAL_COLOR} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/70 bg-card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border/60 text-left text-[11px] text-muted-foreground uppercase">
              <th className="px-3 py-2 font-medium">Ay</th>
              <th className="px-3 py-2 font-medium">Kalem</th>
              <th className="px-3 py-2 text-right font-medium">Plan</th>
              <th className="px-3 py-2 text-right font-medium">Gerçekleşen</th>
              <th className="px-3 py-2 text-right font-medium">Sapma</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([period, rows]) =>
              rows.map((r, i) => {
                const variance = Number(r.variance);
                const good = kindFilter === 'revenue' ? variance >= 0 : variance <= 0;
                return (
                  <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-1.5 text-muted-foreground">{i === 0 ? formatDate(`${period}-01`) : ''}</td>
                    <td className="px-3 py-1.5">{r.channelName ?? r.label}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatMoney(r.planned, 'TRY', { digits: 0 })}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatMoney(r.actual, 'TRY', { digits: 0 })}</td>
                    <td className={cn('px-3 py-1.5 text-right font-mono tabular-nums', good ? 'text-success' : 'text-destructive')}>
                      {variance >= 0 ? '+' : ''}{formatMoney(r.variance, 'TRY', { digits: 0 })}
                    </td>
                  </tr>
                );
              }),
            )}
            {grouped.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">Bu yıl için bütçe satırı yok.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
