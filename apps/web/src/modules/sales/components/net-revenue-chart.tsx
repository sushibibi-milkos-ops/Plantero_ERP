'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatDate, formatMoney } from '@/lib/format';

const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum, p) => sum + p.value, 0);
  return (
    <div className="min-w-40 rounded-lg border border-border/70 bg-popover p-2.5 text-xs shadow-md">
      <div className="mb-1.5 font-medium">{label ? formatDate(label) : ''}</div>
      <div className="space-y-1">
        {payload
          .filter((p) => p.value > 0)
          .sort((a, b) => b.value - a.value)
          .map((p) => (
            <div key={p.name} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                {p.name}
              </span>
              <span className="num tabular-nums">{formatMoney(p.value, 'TRY', { digits: 0 })}</span>
            </div>
          ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-border/60 pt-1.5 font-medium">
        <span>Toplam</span>
        <span className="num tabular-nums">{formatMoney(total, 'TRY', { digits: 0 })}</span>
      </div>
    </div>
  );
}

export function NetRevenueChart({ series, channels }: { series: Array<Record<string, string | number>>; channels: Array<{ code: string; name: string }> }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {channels.map((c, i) => (
            <linearGradient key={c.code} id={`fill-${c.code}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.28} />
              <stop offset="95%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(v: string) => formatDate(v).slice(0, 5)} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tickFormatter={(v: number) => formatMoney(v, 'TRY', { digits: 0, compact: true })} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={56} />
        <Tooltip content={<CustomTooltip />} />
        {channels.map((c, i) => (
          <Area
            key={c.code}
            type="monotone"
            dataKey={c.code}
            name={c.name}
            stackId="net"
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={1.5}
            fill={`url(#fill-${c.code})`}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
