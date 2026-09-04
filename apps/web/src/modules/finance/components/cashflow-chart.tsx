'use client';

import { AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { formatDate, formatMoney } from '@/lib/format';

// Aynı renk sözleşmesi: apps/web/src/modules/sales/components/net-revenue-chart.tsx (--chart-5 tek
// başına "toplam/nihai" seri için ayrılmıştır — burada kapanış nakdi).
//
// dataviz kuralı "tek eksen — asla çift y ekseni": kapanış nakdi (milyonlarca TL, tekdüze artan) ile
// aylık net nakit akışı (on binlerce TL, pozitif/negatif) ONLARCA KAT farklı büyüklükte — AYNI
// grafikte aynı ölçekte gösterilince net akış çubukları görünmez ölçüde küçülüyordu (ilk deneme, Tur
// 1 kendi bulgusu). Kural bu durumda "iki ölçüm farklı büyüklükte → iki ayrı grafik / small
// multiples" der (references/anti-patterns.md) — bu yüzden TEK bileşik grafik yerine aynı x eksenini
// paylaşan İKİ AYRI grafik (alan + çubuk) dikey istiflenir; hiçbiri ikinci bir y ekseni açmaz.
const CLOSING_COLOR = 'var(--chart-5)';
const NET_FLOW_POSITIVE = 'var(--success)';
const NET_FLOW_NEGATIVE = 'var(--destructive)';

type Point = { period: string; closingCash: number; netCashflow: number };

const xTick = { fontSize: 11, fill: 'var(--muted-foreground)' };
const tickFmt = (v: string) => formatDate(`${v}-01`).slice(3);
const moneyTick = (v: number) => formatMoney(v, 'TRY', { digits: 0, compact: true });

function ClosingTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/70 bg-popover p-2.5 text-xs shadow-md">
      <div className="mb-1 font-medium">{label ? formatDate(`${label}-01`) : ''}</div>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-muted-foreground"><span className="size-1.5 rounded-full" style={{ backgroundColor: CLOSING_COLOR }} />Dönem sonu nakit</span>
        <span className="num tabular-nums">{formatMoney(payload[0]!.value, 'TRY', { digits: 0 })}</span>
      </div>
    </div>
  );
}

function NetFlowTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const v = payload[0]!.value;
  return (
    <div className="rounded-lg border border-border/70 bg-popover p-2.5 text-xs shadow-md">
      <div className="mb-1 font-medium">{label ? formatDate(`${label}-01`) : ''}</div>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-muted-foreground"><span className="size-1.5 rounded-full" style={{ backgroundColor: v >= 0 ? NET_FLOW_POSITIVE : NET_FLOW_NEGATIVE }} />Net nakit akışı</span>
        <span className="num tabular-nums">{formatMoney(v, 'TRY', { digits: 0 })}</span>
      </div>
    </div>
  );
}

export function CashflowChart({ points }: { points: Point[] }) {
  return (
    <div className="space-y-1">
      <div className="mb-1 text-xs font-medium text-muted-foreground">Dönem sonu nakit</div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="fill-closing-cash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CLOSING_COLOR} stopOpacity={0.14} />
              <stop offset="95%" stopColor={CLOSING_COLOR} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="period" tickFormatter={tickFmt} tick={xTick} axisLine={false} tickLine={false} minTickGap={28} />
          <YAxis tickFormatter={moneyTick} tick={xTick} axisLine={false} tickLine={false} width={64} />
          <Tooltip content={<ClosingTooltip />} isAnimationActive={false} allowEscapeViewBox={{ x: false, y: false }} wrapperStyle={{ outline: 'none' }} />
          <Area type="linear" dataKey="closingCash" name="Dönem sonu nakit" stroke={CLOSING_COLOR} strokeWidth={2} fill="url(#fill-closing-cash)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>

      <div className="mb-1 pt-2 text-xs font-medium text-muted-foreground">Aylık net nakit akışı</div>
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="period" tickFormatter={tickFmt} tick={xTick} axisLine={false} tickLine={false} minTickGap={28} />
          <YAxis tickFormatter={moneyTick} tick={xTick} axisLine={false} tickLine={false} width={64} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Tooltip content={<NetFlowTooltip />} isAnimationActive={false} allowEscapeViewBox={{ x: false, y: false }} wrapperStyle={{ outline: 'none' }} />
          <Bar dataKey="netCashflow" name="Net nakit akışı" radius={[2, 2, 2, 2]} isAnimationActive={false}>
            {points.map((p) => (
              <Cell key={p.period} fill={p.netCashflow >= 0 ? NET_FLOW_POSITIVE : NET_FLOW_NEGATIVE} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
