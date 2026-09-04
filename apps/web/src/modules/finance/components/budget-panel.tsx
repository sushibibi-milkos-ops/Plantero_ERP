'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Loader2, RefreshCw, FolderKanban, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { refreshBudgetActualsAction } from '../budget-actions';
import { formatMonth } from '../format';
import type { BudgetLineRow } from '../budget-queries';

/** Sapma rengi yalnızca |sapma| plan'ın %10'unu aşınca anlamlı sayılır (kriter 6 — aksi halde her
 * satır kırmızı/yeşil basılıp sinyal değerini yitiriyordu, 48/48 satır ölçüldü). */
const VARIANCE_THRESHOLD_PCT = 10;

// Kriter 4 + 12 kök neden düzeltmesi (Tur 2): `--muted-foreground` dolu bir seri rengi olarak
// kullanıldığında 12 ayın tamamı ~%100 yükseklikte ağır gri bloklara dönüşüyor, yanındaki
// "Gerçekleşen" serisi (ince/kısa çubuklar) görünmez kalıyordu — gri hiçbir zaman VERİ rengi olmamalı
// (yalnızca zemin/ayraç). Plan artık dolgusuz, yalnızca ince kenarlıklı bir "hedef" çubuğu; gerçekleşen
// tek dolu/renkli seri olarak öne çıkar.
const PLANNED_COLOR = 'var(--border)';
const ACTUAL_COLOR = 'var(--chart-5)';

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey?: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const planned = payload.find((p) => p.dataKey === 'planned')?.value ?? 0;
  const actual = payload.find((p) => p.dataKey === 'actual')?.value ?? 0;
  return (
    <div className="min-w-40 rounded-lg border border-border/70 bg-popover p-2.5 text-[13px] shadow-md">
      <div className="mb-1.5 font-medium">{label ? formatMonth(label) : ''}</div>
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
      className="h-11 md:h-8"
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

/** Plan/gerçekleşen/sapma hücrelerinin biçimlendirmesi — masaüstü tablosu ve mobil kart görünümü
 * AYNI hesaplamayı paylaşır (tek kaynak, iki render). */
function budgetRowFormat(r: BudgetLineRow, kindFilter: Kind) {
  const planned = Number(r.planned);
  const actual = Number(r.actual);
  const variance = Number(r.variance);
  const good = kindFilter === 'revenue' ? variance >= 0 : variance <= 0;
  // Kriter 6 kök neden düzeltmesi: |sapma| plan'ın %10'unu aşmadıkça nötr — 48/48 satırın
  // kırmızı/yeşil basıldığı (sinyalin anlamsızlaştığı) durum giderilir.
  const varianceSignificant = planned !== 0 ? (Math.abs(variance) / Math.abs(planned)) * 100 >= VARIANCE_THRESHOLD_PCT : variance !== 0;
  // Kriter 4 kök neden düzeltmesi (Tur 4, P1 — finans-butce-11): gerçekleşen hiç girilmemiş
  // (henüz gelmemiş) dönemlerde sapma HER ZAMAN plan'ın %100'ü çıkar (0 − plan) — %10 anlamlılık
  // eşiği bu durumda hiçbir zaman devreye girmiyordu (48 satırın 44'ü kırmızıydı). `actual === 0`
  // iken sapma "henüz veri yok" anlamına gelir, "plandan kötü sapma" anlamına gelmez — nötr bas.
  const noActualYet = actual === 0;
  return {
    plannedLabel: formatMoney(r.planned, 'TRY', { digits: 0 }),
    actualLabel: formatMoney(r.actual, 'TRY', { digits: 0 }),
    actualMuted: noActualYet,
    varianceLabel: `${variance >= 0 ? '+' : ''}${formatMoney(r.variance, 'TRY', { digits: 0 })}`,
    varianceClass: noActualYet || !varianceSignificant ? 'text-muted-foreground' : good ? 'text-success' : 'text-destructive',
  };
}

export function BudgetPanel({ lines, summary }: { lines: BudgetLineRow[]; summary: Array<{ period: string; kind: string; planned: string; actual: string }> }) {
  const [kindFilter, setKindFilter] = useState<Kind>('revenue');

  // Kriter 12 kök neden düzeltmesi (Tur 4, P1 — finans-butce-09): 12 ayın tamamını çizmek yıl
  // sonuna kadar (henüz gelmemiş) 0 gerçekleşenle dolu bir grafik üretiyordu — plan çubuğu her ay
  // birbirinin aynı, gerçekleşen serisi ya görünmüyor ya da plan'a kıyasla piksel altı kalıyordu.
  // Gerçekleşen verisi olan SON aya kadar kırp (YTD) — henüz veri girilmemiş aylar hiç çizilmez.
  const { chartData, chartInformative, lastActualLabel, actualToPlannedPct } = useMemo(() => {
    const rows = summary
      .filter((s) => s.kind === kindFilter)
      .map((s) => ({ period: s.period, planned: Number(s.planned), actual: Number(s.actual) }))
      .sort((a, b) => (a.period < b.period ? -1 : 1));
    const periodsWithActual = rows.filter((r) => r.actual !== 0).map((r) => r.period);
    const lastActual = periodsWithActual.length ? periodsWithActual[periodsWithActual.length - 1] : null;
    const ytd = lastActual ? rows.filter((r) => r.period <= lastActual) : [];
    const maxPlanned = Math.max(0, ...ytd.map((r) => r.planned));
    const maxActual = Math.max(0, ...ytd.map((r) => r.actual));
    // 260px yükseklikte ≥8px bir gerçekleşen çubuk için gereken minimum oran (kriter 12 hedefi).
    const ratio = maxPlanned > 0 ? maxActual / maxPlanned : 0;
    const informative = ytd.length > 0 && maxPlanned > 0 && ratio >= 8 / 260;
    return { chartData: ytd, chartInformative: informative, lastActualLabel: lastActual ? formatMonth(lastActual) : null, actualToPlannedPct: ratio * 100 };
  }, [summary, kindFilter]);

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
                className={cn(
                  'min-h-11 rounded-md px-3 py-2.5 text-[13px] font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:min-h-0 md:py-1.5',
                  kindFilter === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {k === 'revenue' ? 'Ciro' : 'Sabit gider'}
              </button>
            ))}
          </div>
        </div>
        {chartInformative ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="period" tickFormatter={formatMonth} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} minTickGap={20} />
              <YAxis tickFormatter={(v: number) => formatMoney(v, 'TRY', { digits: 0, compact: true })} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={64} />
              <Tooltip content={<CustomTooltip />} isAnimationActive={false} wrapperStyle={{ outline: 'none' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === 'planned' ? 'Plan' : 'Gerçekleşen')} />
              <Bar dataKey="planned" name="planned" fill="var(--muted-foreground)" fillOpacity={0.12} stroke={PLANNED_COLOR} strokeWidth={1} radius={[2, 2, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="actual" name="actual" fill={ACTUAL_COLOR} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          // Kriter 11+12 kök neden düzeltmesi (Tur 5, P1 — finans-butce-13): önceki metin
          // "Gerçekleşen henüz yok" diyordu ama gerçekleşen SIFIR değil — yalnızca en yüksek ayın
          // plan çubuğunun yanında 260px'te görünür bir çubuk oluşturamayacak kadar küçük (maxActual/
          // maxPlanned oranı). KPI şeridindeki "↘ %99,8 plana göre" rozetiyle AYNI olguyu (gerçekleşen
          // plana kıyasla çok küçük) aynı sayı biçimiyle anlatır — çelişki kalmaz. Ortak EmptyState
          // (compact) kullanılır; kart zaten kendi border'ını taşıdığı için ikinci bir kesikli
          // çerçeve (kutu içinde kutu) eklenmez.
          <div className="flex h-[260px] items-center justify-center">
            <EmptyState
              compact
              icon={BarChart3}
              title={`Gerçekleşen plana kıyasla çizilemeyecek kadar küçük (%${actualToPlannedPct.toLocaleString('tr-TR', { maximumFractionDigits: 1 })})`}
              description={
                lastActualLabel
                  ? `${lastActualLabel} itibarıyla en yüksek aylık gerçekleşen, plan çubuğunun yanında görünür kalınlıkta çizilemiyor. Tablodaki tutarlar güncel.`
                  : 'Bu yıl için gerçekleşen kaydedilmedi. Tablodaki tutarlar hâlâ güncel.'
              }
            />
          </div>
        )}
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-xl border border-border/70 bg-card">
          <EmptyState compact icon={FolderKanban} title="Bu yıl için bütçe satırı yok" description="Bütçe seed'i çalışmamış olabilir ya da farklı bir yıl seçin." />
        </div>
      ) : (
        <>
          {/* Kriter 9 kök neden düzeltmesi (Tur 3, P1 finans-butce-07): masaüstü tablosu (5 sütun,
              min-w-max + whitespace-nowrap) 390px'te kart görünümüne düşmüyordu — sarmalayıcı yatay
              kaydırmaya izin verdiği için PLAN/GERÇEKLEŞEN/SAPMA görünür alanın dışında kalıyordu.
              Modüldeki ortak kart kalıbıyla (bkz. components/data-table/mobile-cards.tsx, loan-panel
              LoanCards) aynı fikir: <md'de tablo yerine tek sütun kart listesi, PLAN/GERÇEKLEŞEN/SAPMA
              üçü de aynı satırda (grid-cols-3) — hiçbir sayı sütunu ilk görünümün dışında kalmaz. */}
          <ul className="space-y-2 md:hidden">
            {grouped.flatMap(([period, rows]) =>
              rows.map((r) => {
                const { plannedLabel, actualLabel, actualMuted, varianceLabel, varianceClass } = budgetRowFormat(r, kindFilter);
                return (
                  <li key={r.id} className="rounded-lg border border-border/70 bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 truncate text-[13px] leading-5 font-medium">{r.channelName ?? r.label}</div>
                      <div className="shrink-0 text-[11px] text-muted-foreground">{formatMonth(period)}</div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[13px]">
                      <div>
                        <div className="text-[11px] text-muted-foreground uppercase">Plan</div>
                        <div className="font-mono tabular-nums">{plannedLabel}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground uppercase">Gerçekleşen</div>
                        <div className={cn('font-mono tabular-nums', actualMuted && 'text-muted-foreground')}>{actualLabel}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground uppercase">Sapma</div>
                        <div className={cn('font-mono tabular-nums', varianceClass)}>{varianceLabel}</div>
                      </div>
                    </div>
                  </li>
                );
              }),
            )}
          </ul>

          {/* Kriter 9 kök neden düzeltmesi (Tur 2): tabloda `min-w` yoktu, hücreler 390px'te sarılıyordu
              (KALEM 3 satıra, GERÇEKLEŞEN rakamının ortası kesiliyordu, satır 32.5→71.5px). Modüldeki
              diğer tüm tablolarla (nakit-akisi, krediler) aynı kalıp: `min-w-max` + `whitespace-nowrap` —
              taşma sarmalayıcının yatay kaydırmasıyla çözülür, hiçbir sütun gizlenmez/kesilmez. Artık
              yalnızca md+'de görünür (<md kart görünümü kullanır, yukarı bakın). */}
          <div className="hidden overflow-x-auto rounded-xl border border-border/70 bg-card md:block">
            <table className="w-full min-w-max text-[13px]">
              <thead>
                <tr className="border-b border-border/60 text-left text-[11px] text-muted-foreground uppercase">
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Ay</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Kalem</th>
                  <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Plan</th>
                  <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Gerçekleşen</th>
                  <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Sapma</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(([period, rows]) =>
                  rows.map((r, i) => {
                    const { plannedLabel, actualLabel, actualMuted, varianceLabel, varianceClass } = budgetRowFormat(r, kindFilter);
                    return (
                      <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                        <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{i === 0 ? formatMonth(period) : ''}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">{r.channelName ?? r.label}</td>
                        <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap tabular-nums">{plannedLabel}</td>
                        <td className={cn('px-3 py-1.5 text-right font-mono whitespace-nowrap tabular-nums', actualMuted && 'text-muted-foreground')}>{actualLabel}</td>
                        <td className={cn('px-3 py-1.5 text-right font-mono whitespace-nowrap tabular-nums', varianceClass)}>{varianceLabel}</td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
