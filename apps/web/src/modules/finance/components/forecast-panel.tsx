'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2, Sparkles, ArrowRight, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/empty-state';
import { formatMoney } from '@/lib/format';
import { formatMonth } from '../format';
import { generateSalesForecastAction, generateCashForecastAction, applyForecastAction } from '../forecast-actions';
import { niceStep } from './cashflow-chart';
import type { ForecastPageData } from '../forecast-queries';

/**
 * Kriter 12 kök neden düzeltmesi (Tur 4, P1 — finans-tahmin-10): `cashflow-chart.tsx`'teki
 * `niceTicks` KASITLI olarak 0'ı her zaman ekseninin içine alır (kapanış nakdi/net akış için doğru
 * referans noktası) — ama bu grafikte veri 0'dan ÇOK uzak dar bir bantta (ör. ₺43,5-46,5 Bin)
 * yaşıyor; 0'ı zorlamak ekseni %75 boş bırakıyordu. Burada veriyi SARAN (0'ı zorlamayan) bir tick
 * kümesi gerekir — yalnızca `niceStep` (saf yuvarlama, 0 varsayımı yok) paylaşılır.
 */
function fitTicks(values: number[], targetCount = 5): number[] {
  if (values.length === 0) return [0, 1];
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  if (dataMin === dataMax) {
    const pad = Math.max(Math.abs(dataMin) * 0.1, 1);
    return fitTicks([dataMin - pad, dataMax + pad], targetCount);
  }
  const step = niceStep((dataMax - dataMin) / (targetCount - 1));
  const niceMin = Math.floor(dataMin / step) * step;
  const niceMax = Math.ceil(dataMax / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step * 0.001; v += step) ticks.push(Math.round(v));
  return ticks;
}

// Kriter 11 kök neden düzeltmesi (Tur 2, P2): gerçekleşen seri önceden `--muted-foreground` (gri)
// çiziliyordu — modülün diğer grafiklerinde (nakit akışı, krediler) ana seri her zaman `--chart-5`;
// tahmin verisi yokken grafik tamamen gri kalıyordu. Artık gerçekleşen DÜZ `--chart-5`, tahmin AYNI
// renk kesikli çizgi + bant — ayrım renkle değil çizgi stiliyle yapılır (ekranda gri veri serisi 0).
const HISTORY_COLOR = 'var(--chart-5)';
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
  // Kriter 12 kök neden düzeltmesi (Tur 4, P1 — finans-tahmin-10): Y ekseni recharts'ın varsayılan
  // "0'dan dataMax'a" davranışına bırakılınca veri düz/bantı dar olduğunda (tüm noktalar birbirine
  // yakın) grafik alanının çoğu boş kalıyordu. `niceTicks` (cashflow-chart.tsx — aynı modül, tek
  // kaynak) bandı saran 5 eşit tick üretir; domain bu tick aralığına daralır, seri her zaman
  // yüksekliğin anlamlı bir bölümünde hareket eder.
  const allValues = points.flatMap((p) => [p.history, p.predicted, p.low, p.high]).filter((v): v is number => v !== undefined);
  const ticks = fitTicks(allValues.length ? allValues : [0]);
  const domain: [number, number] = [ticks[0]!, ticks[ticks.length - 1]!];
  // Kriter 11 kök neden düzeltmesi (Tur 4, P1 — finans-tahmin-08): tek aylık geçmişte `dot={false}`
  // çizgiyi 0 piksele indiriyordu (bir noktadan çizgi geçmez) — "gerçekleşen" seri tamamen görünmez
  // kalıyordu. ≤1 noktalı geçmişte görünür bir işaretçi zorunlu; ≥2 noktada Stripe kalıbı (temiz
  // çizgi, hover'da nokta) korunur.
  const historyPointCount = points.filter((p) => p.history !== undefined).length;
  const historyDot = historyPointCount <= 1 ? { r: 2.5, fill: HISTORY_COLOR, strokeWidth: 0 } : false;
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
        <XAxis dataKey="period" tickFormatter={formatMonth} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis domain={domain} ticks={ticks} tickFormatter={(v: number) => formatMoney(v, 'TRY', { digits: 0, compact: true })} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={64} />
        <Tooltip
          isAnimationActive={false}
          wrapperStyle={{ outline: 'none' }}
          content={({ active, payload, label: l }) =>
            active && payload?.length ? (
              <div className="min-w-40 rounded-lg border border-border/70 bg-popover p-2.5 text-[13px] shadow-md">
                <div className="mb-1.5 font-medium">{l ? formatMonth(String(l)) : ''}</div>
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
        <Line type="linear" dataKey="history" name="Gerçekleşen" stroke={HISTORY_COLOR} strokeWidth={2} dot={historyDot} isAnimationActive={false} />
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
      className="h-11 sm:h-8"
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
      className="h-11 sm:h-8"
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
  // Kriter 11 kök neden düzeltmesi (Tur 4, P1 — finans-tahmin-08): başlık sabit metinde "son 12 ay"
  // vaat ediyordu ama `loadSalesHistory` yalnızca TAMAMLANMIŞ ayları döndürür (bkz. forecast.ts
  // başı) — erken evre verisinde bu 1 ay olabilir. Başlık artık X ekseniyle (gerçek pencere) BİREBİR
  // eşleşir, yanlış vaat vermez.
  const salesHistoryMonths = new Set(data.salesHistory.map((h) => h.period)).size;
  const salesForecastMonths = new Set(data.salesForecast.map((f) => f.period)).size;
  const cashHistoryMonths = new Set(data.cashHistory.map((h) => h.period)).size;
  const cashForecastMonths = new Set(data.cashForecast.map((f) => f.period)).size;
  const salesTitle = salesForecastMonths > 0 ? `Toplam satış — son ${salesHistoryMonths} ay + ${salesForecastMonths} aylık tahmin` : `Toplam satış — son ${salesHistoryMonths} ay (tahmin üretilmedi)`;
  const cashTitle = cashForecastMonths > 0 ? `Aylık net nakit akışı tahmini — son ${cashHistoryMonths} ay + ${cashForecastMonths} aylık tahmin` : `Aylık net nakit akışı tahmini — son ${cashHistoryMonths} ay (tahmin üretilmedi)`;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/70 bg-card p-4">
        {/* Kriter 9 kök neden düzeltmesi (Tur 2, P2): başlık + buton 390px'te aynı satırda kalıyor,
            başlık 3 satıra sarıp butonla sıkışıyordu; buton 32px'ti (44px altı). `sm:` altında
            dikey yığın + buton tam genişlik h-11'e döner. */}
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[13px] font-semibold">{salesTitle}</h2>
          <GenerateSalesForecastButton />
        </div>
        {/* Kriter 7 kök neden düzeltmesi (Tur 2, P1): <2 nokta (tek aylık geçmiş, tahmin üretilmemiş)
            neredeyse boş bir ızgara çiziyordu — artık özenli bir boş durum gösterilir. */}
        {salesPoints.length >= 2 ? (
          <ForecastChart points={salesPoints} label="Tahmin" />
        ) : (
          <EmptyState
            compact
            icon={TrendingUp}
            title="Tahmin üretilmedi"
            description="Anlamlı bir grafik için en az iki aylık satış geçmişi ya da bir tahmin gerekir."
            action={<GenerateSalesForecastButton />}
          />
        )}
      </div>

      <div className="rounded-xl border border-border/70 bg-card p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {/* Kriter 11 kök neden düzeltmesi (Tur 4, P1 — finans-tahmin-09): bu grafik
                `cashflow_lines.actual_net_cashflow` — AYLIK NET nakit akışını — tahmin ediyor,
                /finans/nakit-akışı'ndaki KÜMÜLATİF dönem sonu bakiye projeksiyonu DEĞİL. Başlık +
                kapsam etiketi bu farkı açıkça belirtir; aksi halde iki ekran "aynı şeyi" söylüyormuş
                gibi okunup zıt sinyal veriyormuş izlenimi veriyordu. */}
            <h2 className="text-[13px] font-semibold">{cashTitle}</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Yalnızca gerçekleşen aylık net tahsilat/ödeme farkı — /finans/nakit-akışı'ndaki kümülatif dönem sonu bakiye projeksiyonundan farklıdır.</p>
          </div>
          <GenerateCashForecastButton />
        </div>
        {cashPoints.length >= 2 ? (
          <ForecastChart points={cashPoints} label="Tahmin" />
        ) : (
          <EmptyState
            compact
            icon={TrendingUp}
            title="Nakit tahmini üretilmedi"
            description="Önce Bütçe ekranından “Gerçekleşenleri yenile”yi çalıştırın, sonra nakit tahminini üretin."
            action={<GenerateCashForecastButton />}
          />
        )}
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

  if (channelForecast.length === 0) {
    return (
      <div className="rounded-xl border border-border/70 bg-card p-4">
        <h2 className="mb-3 text-[13px] font-semibold">Kanal bazlı satış tahmini</h2>
        <EmptyState compact icon={TrendingUp} title="Kanal tahmini üretilmedi" description="Yukarıdan satış tahminini üretin — kanal kırılımı otomatik hesaplanır." action={<GenerateSalesForecastButton />} />
      </div>
    );
  }

  function applyRow(f: ForecastPageData['channelForecast'][number]) {
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
  }

  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold">Kanal bazlı satış tahmini</h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Uygulanacak senaryo:</span>
          {/* Kriter 9 kök neden düzeltmesi (Tur 4, P0 REGRESYON — finans-tahmin-06): 32px'ti (44px
              altı). Düz `h-11` kaybediyordu — `SelectTrigger`nin kendi `data-[size=sm]:h-8`'i class
              + data-öznitelik seçicisiyle daha yüksek özgüllüğe sahip; aynı özgüllükte ezmek gerekir
              (bkz. cashflow-toolbar.tsx aynı modül, aynı kalıp — tek kaynak). */}
          <Select value={scenario} onValueChange={setScenario}>
            <SelectTrigger size="sm" className="w-36 data-[size=sm]:h-11 md:data-[size=sm]:h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="base">Baz</SelectItem>
              <SelectItem value="optimistic">İyimser</SelectItem>
              <SelectItem value="pessimistic">Kötümser</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Kriter 9 kök neden düzeltmesi (Tur 4, P0 REGRESYON — finans-tahmin-06): tablo `min-w-max`/
          `whitespace-nowrap` OLMADAN eklenmişti — 390px'te hücreler sarıyordu (kanal adı 3 satıra,
          bant 3 satıra), İŞLEM sütunu tamamen görünür alan dışında kalıyordu. Modülün diğer tüm
          tablolarıyla (budget-panel, loan-panel, dunning-panel) aynı kalıp: <md'de kart listesi,
          md+'de min-w-max + whitespace-nowrap tablo — hiçbir hücre sarmaz/kırpılmaz. */}
      <ul className="space-y-2 md:hidden">
        {channelForecast.map((f) => (
          <li key={f.id} className="rounded-lg border border-border/70 bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 truncate text-[13px] font-medium">{nameById.get(f.channelId ?? '') ?? f.channelName ?? '—'}</div>
              <div className="shrink-0 text-[11px] text-muted-foreground">{formatMonth(f.period)}</div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[13px]">
              <div>
                <div className="text-[11px] text-muted-foreground uppercase">Tahmin</div>
                <div className="font-mono tabular-nums">{formatMoney(f.predicted, 'TRY', { digits: 0 })}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground uppercase">Bant</div>
                <div className="font-mono text-[11px] text-muted-foreground tabular-nums">{f.low && f.high ? `${formatMoney(f.low, 'TRY', { digits: 0 })} – ${formatMoney(f.high, 'TRY', { digits: 0 })}` : '—'}</div>
              </div>
            </div>
            <div className="mt-1.5 text-[11px] text-muted-foreground">{f.method === 'ai' ? 'AI' : 'Mevsimsel ort.'}</div>
            <Button size="sm" variant="outline" className="mt-2.5 h-11 w-full" disabled={applyingId === f.id} onClick={() => applyRow(f)}>
              {applyingId === f.id ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
              Uygula
            </Button>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        {/* Kriter 5 kök neden düzeltmesi (Tur 4, P0 — finans-tahmin-07): satır başına birincil ağırlıkta
            "Uygula" butonu 36 satırda tekrarlanıp satır yüksekliğini 45px'e çıkarıyor, İŞLEM sütununu
            özdeş bir eylem duvarına çeviriyordu. Linear kalıbı: küçük ikon buton, yalnızca satır
            hover/focus'ında belirir — satır yüksekliği ≤40px'e iner (bkz. dunning-panel aynı kalıp). */}
        <table className="w-full min-w-max text-[13px]">
          <thead>
            <tr className="border-b border-border/60 text-left text-[11px] text-muted-foreground uppercase">
              <th className="px-2 py-1.5 font-medium whitespace-nowrap">Kanal</th>
              <th className="px-2 py-1.5 font-medium whitespace-nowrap">Ay</th>
              <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">Tahmin</th>
              <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">Bant</th>
              <th className="px-2 py-1.5 font-medium whitespace-nowrap">Yöntem</th>
              <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {channelForecast.map((f) => (
              <tr key={f.id} className="group border-b border-border/40 last:border-0 hover:bg-muted/30">
                <td className="px-2 py-1.5 whitespace-nowrap">{nameById.get(f.channelId ?? '') ?? f.channelName ?? '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">{formatMonth(f.period)}</td>
                <td className="px-2 py-1.5 text-right font-mono whitespace-nowrap tabular-nums">{formatMoney(f.predicted, 'TRY', { digits: 0 })}</td>
                <td className="px-2 py-1.5 text-right font-mono whitespace-nowrap text-[11px] text-muted-foreground tabular-nums">{f.low && f.high ? `${formatMoney(f.low, 'TRY', { digits: 0 })} – ${formatMoney(f.high, 'TRY', { digits: 0 })}` : '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap text-[11px] text-muted-foreground">{f.method === 'ai' ? 'AI' : 'Mevsimsel ort.'}</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                    disabled={applyingId === f.id}
                    aria-label={`${nameById.get(f.channelId ?? '') ?? f.channelName ?? ''} — ${formatMonth(f.period)} tahminini uygula`}
                    onClick={() => applyRow(f)}
                  >
                    {applyingId === f.id ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
