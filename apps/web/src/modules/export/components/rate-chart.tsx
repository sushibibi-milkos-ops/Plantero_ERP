'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatDate } from '@/lib/format';
import type { RateRow } from '../queries';

// Tur 1 P1 kök neden düzeltmesi (ihracat-kurlar-05): `--chart-3` `--warning` (amber) ile BİREBİR AYNI
// oklch değeri (0.72 0.17 70) — bu sayfadaki 'Gerekli'/'Gümrükte' durum rozetleriyle aynı ton EUR
// çizgisine veriliyordu, renk anlam taşımıyordu. `--chart-1` de `--success` ile birebir aynı (0.6
// 0.16 152) — o da dışarıda bırakıldı. Yalnızca durum rozetlerinden (success/warning/destructive)
// AYRIŞAN iki ton (mavi, mor) kullanılır; GBP için üçüncü (turuncumsu chart-4) yalnızca gerçekten
// veri varsa devreye girer.
const COLORS: Record<string, string> = { USD: 'var(--chart-2)', EUR: 'var(--chart-5)', GBP: 'var(--chart-4)' };
const CURRENCY_ORDER = ['USD', 'EUR', 'GBP'] as const;
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

  // Tur 1 P1 kök neden düzeltmesi (ihracat-kurlar-05): GBP (ya da veri gelmeyen herhangi bir para
  // birimi) hiçbir noktaya sahip değilken çizgi + efsane girdisi koşulsuz basılıyordu — "ölü mürekkep"
  // (efsanede 3 giriş, grafikte 2 çizgi). Yalnızca en az 1 gerçek (null olmayan) noktası olan seriler
  // render edilir; `<Legend>` yalnızca render edilen `<Line>`lardan türediği için efsane de otomatik
  // eşleşir.
  const seriesWithData = CURRENCY_ORDER.filter((c) => points.some((p) => p[c] !== undefined));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(v: string) => formatDate(v).slice(0, 5)} tick={xTick} axisLine={false} tickLine={false} minTickGap={32} />
        <YAxis tick={xTick} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => `₺${v.toFixed(1)}`} domain={['auto', 'auto']} />
        <Tooltip content={<RateTooltip />} isAnimationActive={false} wrapperStyle={{ outline: 'none' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
        {seriesWithData.map((c) => (
          <Line key={c} type="monotone" dataKey={c} name={c} stroke={COLORS[c]} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
