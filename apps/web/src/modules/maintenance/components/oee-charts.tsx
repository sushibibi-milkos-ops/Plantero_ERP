'use client';

import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatDate, formatPct } from '@/lib/format';
import { niceTicks } from '@/modules/finance/components/cashflow-chart';
import type { OeeTrendPoint, DowntimeParetoRow } from '../queries';
import { DOWNTIME_REASON_LABELS } from '../labels';

// Aynı renk sözleşmesi: apps/web/src/modules/finance/components/cashflow-chart.tsx. Tek eksen (0-100%)
// üzerinde 4 seri (OEE/Kullanılabilirlik/Performans/Kalite) — hepsi aynı ölçekte (%) olduğundan
// dataviz kuralı "tek eksen" ihlal edilmez (bkz. references/anti-patterns.md — ihlal yalnızca FARKLI
// büyüklükte iki ölçümü aynı grafiğe iki y ekseniyle sıkıştırmaktır).
//
// Kriter 4 (Tur 1 P1 bakim-oee-01) kök neden düzeltmesi: eskiden 4 seri EŞİT ağırlıkta 4 DOYGUN
// tonda çiziliyordu; 'Kalite' serisi (--chart-4, hue≈20) uygulamanın destructive kırmızısıyla
// (hue≈27) aynı aile — aynı sayfada kırmızı zaten 'Arızalı'/hata anlamı taşıdığından semantik
// çakışma vardı, ve dört renk arasında başlık metrik OEE eksende boğuluyordu. Artık yalnızca OEE
// kendi vurgu rengini (yeşil, kalın çizgi + dolgu) taşır; üç bileşen serisi (Kullanılabilirlik/
// Performans/Kalite) TEK nötr tonda (`--muted-foreground`) — birbirlerinden çizgi deseniyle (düz/
// kesik/noktalı) ayrılır, renk sayısı artık kartta 2 (vurgu + nötr).
const OEE_COLOR = 'var(--chart-1)';
// Kök neden (Tur 4 P2 bakim-oee-06): üç bileşen serisi tek `COMPONENT_COLOR` sabitini paylaşıyor,
// ayrım yalnızca ayrı bir SVG `strokeOpacity` ATTRIBUTE'ıyla yapılıyordu — Recharts tooltip/gösterge
// (Legend) rengi seriyi tanımlayan `stroke` PROP'unun DEĞERİNDEN türetir, `strokeOpacity`'den değil;
// sonuç üçü de tooltip noktasında ve gösterge çizgisinde birebir aynı gri. Artık opaklık `stroke`
// değerinin İÇİNE gömülü (color-mix) — üç FARKLI literal renk dizesi, aynı nötr aile (kırmızıyla
// çakışmaz) ama tooltip/gösterge artık gerçekten ayrışıyor; çizgi deseni (düz/kesik/noktalı) sahada
// ek bir ayrım katmanı olarak kalıyor.
const COMPONENT_COLOR_AVAILABILITY = 'color-mix(in oklch, var(--muted-foreground) 90%, transparent)';
const COMPONENT_COLOR_PERFORMANCE = 'color-mix(in oklch, var(--muted-foreground) 62%, transparent)';
const COMPONENT_COLOR_QUALITY = 'color-mix(in oklch, var(--muted-foreground) 40%, transparent)';
const PARETO_COLOR = 'var(--chart-1)';

const xTick = { fontSize: 11, fill: 'var(--muted-foreground)' };
const dayTick = (v: string) => formatDate(v).slice(0, 5);

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/70 bg-popover p-2.5 text-xs shadow-md">
      <div className="mb-1 font-medium">{label ? formatDate(label) : ''}</div>
      <div className="space-y-1">
        {payload.map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground"><span className="size-1.5 rounded-full" style={{ backgroundColor: p.color }} />{p.name}</span>
            <span className="num tabular-nums">{formatPct(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OeeTrendChart({ data }: { data: OeeTrendPoint[] }) {
  const points = data.map((d) => ({ day: d.day, oee: Number(d.oeePct), availability: Number(d.availabilityPct), performance: Number(d.performancePct), quality: Number(d.qualityPct) }));
  const ticks = niceTicks(points.flatMap((p) => [p.oee, p.availability, p.performance, p.quality]), 5);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="fill-oee" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={OEE_COLOR} stopOpacity={0.16} />
            <stop offset="95%" stopColor={OEE_COLOR} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="day" tickFormatter={dayTick} tick={xTick} axisLine={false} tickLine={false} minTickGap={28} />
        <YAxis tickFormatter={(v: number) => `%${v}`} tick={xTick} axisLine={false} tickLine={false} width={40} ticks={ticks} domain={[ticks[0]!, ticks[ticks.length - 1]!]} />
        <Tooltip content={<TrendTooltip />} isAnimationActive={false} allowEscapeViewBox={{ x: false, y: false }} wrapperStyle={{ outline: 'none' }} />
        <Legend
          iconType="plainline"
          wrapperStyle={{ fontSize: 11, color: 'var(--muted-foreground)' }}
          formatter={(value: string) => <span style={{ color: 'var(--muted-foreground)' }}>{value}</span>}
        />
        <Area type="monotone" dataKey="oee" name="OEE" stroke={OEE_COLOR} strokeWidth={2} fill="url(#fill-oee)" isAnimationActive={false} />
        <Area type="monotone" dataKey="availability" name="Kullanılabilirlik" stroke={COMPONENT_COLOR_AVAILABILITY} strokeWidth={1} fill="none" isAnimationActive={false} />
        <Area type="monotone" dataKey="performance" name="Performans" stroke={COMPONENT_COLOR_PERFORMANCE} strokeWidth={1} strokeDasharray="4 3" fill="none" isAnimationActive={false} />
        <Area type="monotone" dataKey="quality" name="Kalite" stroke={COMPONENT_COLOR_QUALITY} strokeWidth={1} strokeDasharray="1 3" fill="none" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ParetoTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { reasonLabel: string } }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/70 bg-popover p-2.5 text-xs shadow-md">
      <div className="font-medium">{payload[0]!.payload.reasonLabel}</div>
      <div className="num mt-1 tabular-nums">{payload[0]!.value} dk</div>
    </div>
  );
}

export function DowntimeParetoChart({ data }: { data: DowntimeParetoRow[] }) {
  const points = data.slice(0, 8).map((d) => ({ reasonLabel: DOWNTIME_REASON_LABELS[d.reason] ?? d.reason, minutes: d.minutes }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={points} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={xTick} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="reasonLabel" tick={xTick} axisLine={false} tickLine={false} width={110} />
        <Tooltip content={<ParetoTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} isAnimationActive={false} />
        <Bar dataKey="minutes" name="Duruş (dk)" fill={PARETO_COLOR} radius={[0, 4, 4, 0]} isAnimationActive={false} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}
