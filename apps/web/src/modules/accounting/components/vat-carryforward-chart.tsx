'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatMoney } from '@/lib/format';

const COLOR = 'var(--chart-5)';

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-lg border border-border/70 bg-popover p-2.5 text-xs shadow-md">
      <div className="mb-1 font-medium">{label}</div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">Devreden KDV</span>
        <span className="num tabular-nums">{formatMoney(payload[0]!.value, 'TRY', { digits: 0 })}</span>
      </div>
    </div>
  );
}

export function VatCarryforwardChart({ series }: { series: Array<{ period: string; carriedToNext: string }> }) {
  const data = series.map((s) => ({ period: s.period, carriedToNext: Number(s.carriedToNext) }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="fill-vat" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLOR} stopOpacity={0.14} />
            <stop offset="95%" stopColor={COLOR} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} minTickGap={20} />
        <YAxis tickFormatter={(v: number) => formatMoney(v, 'TRY', { digits: 0, compact: true })} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={64} />
        <Tooltip content={<CustomTooltip />} isAnimationActive={false} wrapperStyle={{ outline: 'none' }} />
        <Area type="linear" dataKey="carriedToNext" name="Devreden KDV" stroke={COLOR} strokeWidth={2} fill="url(#fill-vat)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
