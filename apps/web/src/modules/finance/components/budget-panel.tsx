'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Loader2, RefreshCw, FolderKanban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { refreshBudgetActualsAction } from '../budget-actions';
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
    <div className="min-w-40 rounded-lg border border-border/70 bg-popover p-2.5 text-xs shadow-md">
      <div className="mb-1.5 font-medium">{label ? formatDate(`${label}-01`) : ''}</div>
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
  return {
    plannedLabel: formatMoney(r.planned, 'TRY', { digits: 0 }),
    actualLabel: formatMoney(r.actual, 'TRY', { digits: 0 }),
    actualMuted: actual === 0,
    varianceLabel: `${variance >= 0 ? '+' : ''}${formatMoney(r.variance, 'TRY', { digits: 0 })}`,
    varianceClass: !varianceSignificant ? 'text-muted-foreground' : good ? 'text-success' : 'text-destructive',
  };
}

export function BudgetPanel({ lines, summary }: { lines: BudgetLineRow[]; summary: Array<{ period: string; kind: string; planned: string; actual: string }> }) {
  const [kindFilter, setKindFilter] = useState<Kind>('revenue');

  const chartData = useMemo(
    () => summary.filter((s) => s.kind === kindFilter).map((s) => ({ period: s.period, planned: Number(s.planned), actual: Number(s.actual) })).sort((a, b) => (a.period < b.period ? -1 : 1)),
    [summary, kindFilter],
  );

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
                className={cn('min-h-11 rounded-md px-3 py-2.5 text-[13px] font-medium transition-colors md:min-h-0 md:py-1.5', kindFilter === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                {k === 'revenue' ? 'Ciro' : 'Sabit gider'}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="period" tickFormatter={(v: string) => formatDate(`${v}-01`).slice(3)} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} minTickGap={20} />
            <YAxis tickFormatter={(v: number) => formatMoney(v, 'TRY', { digits: 0, compact: true })} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={64} />
            <Tooltip content={<CustomTooltip />} isAnimationActive={false} wrapperStyle={{ outline: 'none' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === 'planned' ? 'Plan' : 'Gerçekleşen')} />
            <Bar dataKey="planned" name="planned" fill="var(--muted-foreground)" fillOpacity={0.12} stroke={PLANNED_COLOR} strokeWidth={1} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="actual" name="actual" fill={ACTUAL_COLOR} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
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
                      <div className="min-w-0 truncate text-[14px] leading-5 font-medium">{r.channelName ?? r.label}</div>
                      <div className="shrink-0 text-xs text-muted-foreground">{formatDate(`${period}-01`)}</div>
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
                        <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{i === 0 ? formatDate(`${period}-01`) : ''}</td>
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
