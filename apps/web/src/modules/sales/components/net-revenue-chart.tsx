'use client';

import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatDate, formatMoney } from '@/lib/format';

// Tasarım token'larında 5 grafik rengi tanımlı (globals.css --chart-1..5) ama --chart-4 kırmızıya
// yakın (oklch hue 20) — bu sayfadaki negatif delta rozetleri de kırmızı, kategorik bir seri
// (ör. Hepsiburada) kırmızıya düşünce "olumsuzluk" anlamı yanlışlıkla bir kanala yapışıyordu (Tur 3
// bulgusu). Yeni token uydurmak yerine --chart-4 kategorik paletten çıkarıldı: en büyük 3 kanal tekil
// seri, kalanı 'Diğer' altında toplanır (4 renk yeterli — kırmızı hiçbir zaman kullanılmaz).
const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-5)'];
const OTHER_CODE = '__OTHER__';

type SeriesRow = Record<string, string | number>;
type ChannelRef = { code: string; name: string };

/** 5'ten fazla kanal varsa en yüksek net cirolu 4'ünü tekil bırakır, gerisini 'Diğer' seride birleştirir. */
function collapseChannels(series: SeriesRow[], channels: ChannelRef[]): { series: SeriesRow[]; channels: ChannelRef[] } {
  if (channels.length <= CHART_COLORS.length) return { series, channels };
  const totals = new Map(channels.map((c) => [c.code, 0]));
  for (const row of series) {
    for (const c of channels) totals.set(c.code, (totals.get(c.code) ?? 0) + Number(row[c.code] ?? 0));
  }
  const ranked = [...channels].sort((a, b) => (totals.get(b.code) ?? 0) - (totals.get(a.code) ?? 0));
  const top = ranked.slice(0, CHART_COLORS.length - 1);
  const rest = ranked.slice(CHART_COLORS.length - 1);
  const topCodes = new Set(top.map((c) => c.code));
  const nextSeries = series.map((row) => {
    const next: SeriesRow = { date: row.date ?? '' };
    for (const c of top) next[c.code] = row[c.code] ?? 0;
    let other = 0;
    for (const c of rest) other += Number(row[c.code] ?? 0);
    next[OTHER_CODE] = other;
    return next;
  });
  return { series: nextSeries, channels: [...top.filter((c) => topCodes.has(c.code)), { code: OTHER_CODE, name: 'Diğer' }] };
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum, p) => sum + p.value, 0);
  const nonZero = payload.filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  return (
    <div className="min-w-40 rounded-lg border border-border/70 bg-popover p-2.5 text-xs shadow-md">
      <div className="mb-1.5 font-medium">{label ? formatDate(label) : ''}</div>
      {nonZero.length ? (
        <>
          <div className="space-y-1">
            {nonZero.map((p) => (
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
        </>
      ) : (
        // Hareketsiz gün: içi boş "Toplam ₺0" kutusu yerine tek satır açıklama.
        <div className="text-muted-foreground">Bu gün hareket yok</div>
      )}
    </div>
  );
}

function LegendContent({ payload }: { payload?: Array<{ value: string; color: string }> }) {
  if (!payload?.length) return null;
  return (
    <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {payload.map((p) => (
        <span key={p.value} className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: p.color }} />
          {p.value}
        </span>
      ))}
    </div>
  );
}

export function NetRevenueChart({ series, channels }: { series: SeriesRow[]; channels: ChannelRef[] }) {
  const { series: plotSeries, channels: plotChannels } = useMemo(() => collapseChannels(series, channels), [series, channels]);
  // Legend grafiğin İÇİNDE (verticalAlign="top") tooltip'in önüne geçip ilk iki etiketi ve üst Y ekseni
  // değerini kapatıyordu — grafiğin ÜSTÜNE, kendi satırına taşındı; tooltip artık hiçbir koşulda üstüne binemez.
  const legendPayload = plotChannels.map((c, i) => ({ value: c.name, color: CHART_COLORS[i] ?? 'var(--chart-1)' }));

  return (
    <div>
      <LegendContent payload={legendPayload} />
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={plotSeries} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {plotChannels.map((c, i) => (
              <linearGradient key={c.code} id={`fill-${c.code}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLORS[i]} stopOpacity={0.28} />
                <stop offset="95%" stopColor={CHART_COLORS[i]} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(v: string) => formatDate(v).slice(0, 5)} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tickFormatter={(v: number) => formatMoney(v, 'TRY', { digits: 0, compact: true })} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={56} />
          {/* isAnimationActive=false: recharts'ın varsayılan 1500ms giriş animasyonu (globals.css'teki
              220ms UI motion bütçesinin 7 katı) ilk paint'te seriyi sıfır yükseklikte bırakıyor —
              1440×900'de alan grafiği tamamen boş görünüyordu (mobilde geç fark edilmiyordu). */}
          <Tooltip content={<CustomTooltip />} isAnimationActive={false} allowEscapeViewBox={{ x: false, y: false }} wrapperStyle={{ outline: 'none' }} />
          {plotChannels.map((c, i) => (
            <Area
              key={c.code}
              // linear (monotone değil): günlük ciro noktaları arasında var olmayan ara değerler
              // uyduran çan eğrileri çizmez — kesikli, ani sıçrayan gerçek günlük seri için doğru
              // yorum "noktalar arası düz çizgi"dir (Tur 3 bulgusu, dataviz disiplini).
              type="linear"
              dataKey={c.code}
              name={c.name}
              stackId="net"
              stroke={CHART_COLORS[i]}
              strokeWidth={1.5}
              fill={`url(#fill-${c.code})`}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
