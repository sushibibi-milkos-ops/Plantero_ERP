'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatDate } from '@/lib/format';
import type { RateRow } from '../queries';

const COLORS: Record<string, string> = { USD: 'var(--chart-2)', EUR: 'var(--chart-3)', GBP: 'var(--chart-4)' };
const xTick = { fontSize: 11, fill: 'var(--muted-foreground)' };

type Point = { date: string; USD?: number; EUR?: number; GBP?: number };

function toPoints(rows: RateRow[]): Point[] {
  const byDate = new Map<string, Point>();
  for (const r of rows) {
    const p = byDate.get(r.rateDate) ?? { date: r.rateDate };
    p[r.currency as 'USD' | 'EUR' | 'GBP'] = Number(r.selling);
    byDate.set(r.rateDate, p);
  }
  return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

function RateTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/70 bg-popover p-2.5 text-xs shadow-md">
      <div className="mb-1 font-medium">{label ? formatDate(label) : ''}</div>
      <div className="space-y-1">
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: COLORS[p.dataKey] }} />{p.dataKey}
            </span>
            <span className="num tabular-nums">₺{p.value.toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Stripe tarzı ince çizgi kur grafiği — son N günün USD/EUR/GBP satış kurları (tek eksen, çoklu seri). */
export function RateChart({ rows }: { rows: RateRow[] }) {
  const points = toPoints(rows);
  if (points.length < 2) return null;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(v: string) => formatDate(v).slice(0, 5)} tick={xTick} axisLine={false} tickLine={false} minTickGap={32} />
        <YAxis tick={xTick} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => `₺${v.toFixed(1)}`} domain={['auto', 'auto']} />
        <Tooltip content={<RateTooltip />} isAnimationActive={false} wrapperStyle={{ outline: 'none' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
        <Line type="monotone" dataKey="USD" name="USD" stroke={COLORS.USD} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
        <Line type="monotone" dataKey="EUR" name="EUR" stroke={COLORS.EUR} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
        <Line type="monotone" dataKey="GBP" name="GBP" stroke={COLORS.GBP} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}
