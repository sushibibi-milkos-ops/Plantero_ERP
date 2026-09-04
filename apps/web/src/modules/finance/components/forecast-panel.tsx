'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate, formatMoney } from '@/lib/format';
import { generateSalesForecastAction, generateCashForecastAction, applyForecastAction } from '../forecast-actions';
import type { ForecastPageData } from '../forecast-queries';

const HISTORY_COLOR = 'var(--muted-foreground)';
const FORECAST_COLOR = 'var(--chart-5)';
const BAND_COLOR = 'var(--chart-5)';

type Point = { period: string; history?: number; predicted?: number; low?: number; high?: number; bandWidth?: number };

function buildSeries(history: { period: string; amount: string }[], forecast: ForecastPageData['salesForecast']): Point[] {
  const byPeriod = new Map<string, Point>();
  for (const h of history) byPeriod.set(h.period, { period: h.period, history: Number(h.amount) });
  for (const f of forecast) {
    const cur = byPeriod.get(f.period) ?? { period: f.period };
    cur.predicted = Number(f.predicted);
    cur.low = f.low ? Number(f.low) : undefined;
    cur.high = f.high ? Number(f.high) : undefined;
    // Band alanı stackId ile inşa edilir: önce görünmez `low` yükseklik kadar taban, üstüne yalnızca
    // (high−low) kadar dolgulu ikinci alan biner — recharts'ta gerçek bir "min-max bant" bu şekilde
    // (iki ayrı sıfır-tabanlı alan değil) doğru çizilir.
    if (cur.low !== undefined && cur.high !== undefined) cur.bandWidth = cur.high - cur.low;
    byPeriod.set(f.period, cur);
  }
  // Tarihçe ile tahmin arasında görsel süreklilik: tahminin ilk noktası tarihçenin son noktasına bağlanır.
  const sorted = [...byPeriod.values()].sort((a, b) => (a.period < b.period ? -1 : 1));
  const lastHistoryIdx = sorted.map((p) => p.history !== undefined).lastIndexOf(true);
  if (lastHistoryIdx >= 0 && sorted[lastHistoryIdx + 1]) {
    sorted[lastHistoryIdx]!.predicted = sorted[lastHistoryIdx]!.history;
  }
  return sorted;
}

function ForecastChart({ points, label }: { points: Point[]; label: string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="fill-forecast-band" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={BAND_COLOR} stopOpacity={0.14} />
            <stop offset="95%" stopColor={BAND_COLOR} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="period" tickFormatter={(v: string) => formatDate(`${v}-01`).slice(3)} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tickFormatter={(v: number) => formatMoney(v, 'TRY', { digits: 0, compact: true })} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={64} />
        <Tooltip
          isAnimationActive={false}
          wrapperStyle={{ outline: 'none' }}
          content={({ active, payload, label: l }) =>
            active && payload?.length ? (
              <div className="min-w-40 rounded-lg border border-border/70 bg-popover p-2.5 text-xs shadow-md">
                <div className="mb-1.5 font-medium">{formatDate(`${l}-01`)}</div>
                {payload
                  .filter((p) => p.dataKey === 'history' || p.dataKey === 'predicted')
                  .map((p) => (
                    <div key={p.dataKey as string} className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">{p.dataKey === 'history' ? 'Gerçekleşen' : 'Tahmin'}</span>
                      <span className="num tabular-nums">{formatMoney(p.value as number, 'TRY', { digits: 0 })}</span>
                    </div>
                  ))}
              </div>
            ) : null
          }
        />
        <Area type="linear" dataKey="low" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} legendType="none" connectNulls />
        <Area type="linear" dataKey="bandWidth" name="Bant" stackId="band" stroke="none" fill="url(#fill-forecast-band)" isAnimationActive={false} legendType="none" connectNulls />
        <Line type="linear" dataKey="history" name="Gerçekleşen" stroke={HISTORY_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="linear" dataKey="predicted" name={label} stroke={FORECAST_COLOR} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 2.5 }} isAnimationActive={false} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function GenerateSalesForecastButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await generateSalesForecastAction({ periodsAhead: 6 });
          if (res.ok) {
            toast.success(`${res.data.written} satış tahmini noktası üretildi`);
            router.refresh();
          } else {
            toast.error(res.error);
          }
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
      Satış tahminini yeniden üret
    </Button>
  );
}

export function GenerateCashForecastButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await generateCashForecastAction({ periodsAhead: 3 });
          if (res.ok) {
            toast.success(`${res.data.written} nakit tahmini noktası üretildi`);
            router.refresh();
          } else {
            toast.error(res.error);
          }
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
      Nakit tahminini yeniden üret
    </Button>
  );
}

export function ForecastPanels({ data }: { data: ForecastPageData }) {
  const salesPoints = useMemo(() => buildSeries(data.salesHistory, data.salesForecast), [data]);
  const cashPoints = useMemo(() => buildSeries(data.cashHistory, data.cashForecast), [data]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/70 bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold">Toplam satış — son 12 ay + 6 aylık tahmin</h2>
          <GenerateSalesForecastButton />
        </div>
        {salesPoints.length ? <ForecastChart points={salesPoints} label="Tahmin" /> : <p className="py-10 text-center text-sm text-muted-foreground">Henüz yeterli satış geçmişi yok.</p>}
      </div>

      <div className="rounded-xl border border-border/70 bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold">Nakit bakiyesi tahmini</h2>
          <GenerateCashForecastButton />
        </div>
        {cashPoints.length ? <ForecastChart points={cashPoints} label="Tahmin" /> : <p className="py-10 text-center text-sm text-muted-foreground">Nakit tahmini için önce Bütçe ekranından &quot;Gerçekleşenleri yenile&quot;yi çalıştırın.</p>}
      </div>

      <ChannelForecastTable channelForecast={data.channelForecast} channels={data.channels} />
    </div>
  );
}

function ChannelForecastTable({ channelForecast, channels }: { channelForecast: ForecastPageData['channelForecast']; channels: ForecastPageData['channels'] }) {
  const router = useRouter();
  const [scenario, setScenario] = useState('base');
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const nameById = new Map(channels.map((c) => [c.id, c.name]));

  return (
    <div className="overflow-x-auto rounded-xl border border-border/70 bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold">Kanal bazlı satış tahmini</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Uygulanacak senaryo:</span>
          <Select value={scenario} onValueChange={setScenario}>
            <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="base">Baz</SelectItem>
              <SelectItem value="optimistic">İyimser</SelectItem>
              <SelectItem value="pessimistic">Kötümser</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border/60 text-left text-[11px] text-muted-foreground uppercase">
            <th className="px-2 py-1.5 font-medium">Kanal</th>
            <th className="px-2 py-1.5 font-medium">Ay</th>
            <th className="px-2 py-1.5 text-right font-medium">Tahmin</th>
            <th className="px-2 py-1.5 text-right font-medium">Bant</th>
            <th className="px-2 py-1.5 font-medium">Yöntem</th>
            <th className="px-2 py-1.5 text-right font-medium">İşlem</th>
          </tr>
        </thead>
        <tbody>
          {channelForecast.map((f) => (
            <tr key={f.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
              <td className="px-2 py-1.5">{nameById.get(f.channelId ?? '') ?? f.channelName ?? '—'}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{formatDate(`${f.period}-01`)}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{formatMoney(f.predicted, 'TRY', { digits: 0 })}</td>
              <td className="px-2 py-1.5 text-right font-mono text-xs text-muted-foreground tabular-nums">{f.low && f.high ? `${formatMoney(f.low, 'TRY', { digits: 0 })} – ${formatMoney(f.high, 'TRY', { digits: 0 })}` : '—'}</td>
              <td className="px-2 py-1.5 text-xs text-muted-foreground">{f.method === 'ai' ? 'AI' : 'Mevsimsel ort.'}</td>
              <td className="px-2 py-1.5 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={applyingId === f.id}
                  onClick={() => {
                    setApplyingId(f.id);
                    startTransition(async () => {
                      const res = await applyForecastAction({ forecastId: f.id, scenario: scenario as 'base' | 'optimistic' | 'pessimistic' });
                      setApplyingId(null);
                      if (res.ok) {
                        toast.success('Nakit akışı senaryosuna uygulandı');
                        router.refresh();
                      } else {
                        toast.error(res.error);
                      }
                    });
                  }}
                >
                  {applyingId === f.id ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
                  Uygula
                </Button>
              </td>
            </tr>
          ))}
          {channelForecast.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-2 py-8 text-center text-muted-foreground">Kanal tahmini üretilmedi — yukarıdan &quot;Satış tahminini yeniden üret&quot;i çalıştırın.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
