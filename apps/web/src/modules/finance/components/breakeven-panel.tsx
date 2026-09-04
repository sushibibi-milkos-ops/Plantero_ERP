'use client';

import NumberFlow from '@number-flow/react';
import { Progress } from '@/components/ui/progress';
import { formatMoney, formatPct, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { BreakEvenDto, SensitivityDto } from '../cashflow-queries';

const MONEY_FMT = { style: 'currency' as const, currency: 'TRY', maximumFractionDigits: 0, minimumFractionDigits: 0 };

export function BreakEvenPanel({ data, sensitivity }: { data: BreakEvenDto; sensitivity: SensitivityDto }) {
  const mtd = data.monthToDate;
  const progressPct = Math.max(0, Math.min(100, Number(mtd.progressPct)));
  const ahead = Number(mtd.actualNetRevenue) >= Number(data.targetRevenue);

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="rounded-xl border border-border/70 bg-card p-6">
        <div className="text-[13px] font-medium text-muted-foreground">{formatDate(`${data.period}-01`)} — bu ay gereken minimum ciro</div>
        <div className="mt-1.5 font-mono text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
          <NumberFlow value={Number(data.targetRevenue)} locales="tr-TR" format={MONEY_FMT} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-4 text-[13px] sm:grid-cols-4">
          <div>
            <div className="text-muted-foreground">Sabit gider</div>
            <div className="mt-0.5 font-mono font-medium tabular-nums">{formatMoney(data.fixedExpensesMag, 'TRY', { digits: 0 })}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Kredi taksiti</div>
            <div className="mt-0.5 font-mono font-medium tabular-nums">{formatMoney(data.loanInstallmentMag, 'TRY', { digits: 0 })}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Kurumlar vergisi</div>
            <div className="mt-0.5 font-mono font-medium tabular-nums">{formatPct(data.corporateTaxRatePct, 0)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Ağırlıklı katkı marjı</div>
            <div className="mt-0.5 font-mono font-medium tabular-nums">{formatPct(data.weightedMarginPct, 1)}</div>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Formül: (kredi anaparası + nakit tampon + (sabit gider + kredi faizi) × (1 − vergi oranı)) ÷ (ağırlıklı marj × (1 − vergi oranı) − net KDV%)
        </p>
      </div>

      {/* Gerçekleşen ile karşılaştırma */}
      <div className="rounded-xl border border-border/70 bg-card p-5">
        <h2 className="mb-3 text-[13px] font-semibold">Gerçekleşen ile karşılaştırma</h2>
        <div className="mb-3 flex items-baseline justify-between text-[13px]">
          <span className="text-muted-foreground">Bu ayın bugüne kadarki net cirosu</span>
          <span className={cn('font-mono text-base font-semibold tabular-nums', ahead ? 'text-success' : 'text-foreground')}>{formatMoney(mtd.actualNetRevenue, 'TRY', { digits: 0 })}</span>
        </div>
        <Progress value={progressPct} className={cn(ahead && '[&>div]:bg-success')} />
        <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
          <span>%{Number(mtd.progressPct).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} tamamlandı</span>
          <span>Hedef: {formatMoney(data.targetRevenue, 'TRY', { digits: 0 })}</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border/60 pt-4 text-[13px]">
          <div>
            <div className="text-muted-foreground">Kalan gün</div>
            <div className="mt-0.5 font-mono text-base font-medium tabular-nums">{mtd.daysRemaining} / {mtd.daysInMonth}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Günlük gerçekleşen tempo</div>
            <div className="mt-0.5 font-mono text-base font-medium tabular-nums">{formatMoney(mtd.dailyPaceActual, 'TRY', { digits: 0 })}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Gereken günlük tempo</div>
            <div className={cn('mt-0.5 font-mono text-base font-medium tabular-nums', Number(mtd.dailyPaceNeeded) > Number(mtd.dailyPaceActual) && !ahead && 'text-warning')}>
              {formatMoney(mtd.dailyPaceNeeded, 'TRY', { digits: 0 })}
            </div>
          </div>
        </div>
      </div>

      {/* Kanal payı */}
      <div className="rounded-xl border border-border/70 bg-card p-5">
        <h2 className="mb-3 text-[13px] font-semibold">Kanal payı dağılımı (mevcut kanal karışımıyla)</h2>
        <div className="space-y-2.5">
          {data.channelShare.map((c) => {
            const pct = Number(data.targetRevenue) > 0 ? (Number(c.share) / Number(data.targetRevenue)) * 100 : 0;
            return (
              <div key={c.code} className="flex items-center gap-3 text-[13px]">
                <span className="w-32 shrink-0 truncate text-muted-foreground">{c.name}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <span className="w-28 shrink-0 text-right font-mono tabular-nums">{formatMoney(c.share, 'TRY', { digits: 0 })}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Duyarlılık tabloları */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-xl border border-border/70 bg-card p-5">
          <h2 className="mb-1 text-[13px] font-semibold">Duyarlılık 1 — marj × ciro → net nakit akışı</h2>
          <p className="mb-3 text-xs text-muted-foreground">Satırlar ağırlıklı marj puanı değişimi, kolonlar mevcut ciroya göre çarpan.</p>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-muted-foreground">
                <th className="px-2 py-1 text-left font-medium">Marj Δ</th>
                {[0.8, 0.9, 1, 1.1, 1.2].map((m) => (
                  <th key={m} className="px-2 py-1 text-right font-medium">×{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[-10, -5, 0, 5, 10].map((delta) => (
                <tr key={delta} className="border-t border-border/40">
                  <td className={cn('px-2 py-1 font-mono tabular-nums', delta === 0 && 'font-semibold text-primary')}>{delta > 0 ? '+' : ''}{delta} pp</td>
                  {sensitivity.marginRevenueGrid.filter((g) => g.marginDeltaPts === delta).map((g) => (
                    <td key={g.multiplier} className={cn('px-2 py-1 text-right font-mono tabular-nums', Number(g.netCashflow) < 0 && 'text-destructive', delta === 0 && g.multiplier === 1 && 'font-semibold text-primary')}>
                      {formatMoney(g.netCashflow, 'TRY', { digits: 0 })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border/70 bg-card p-5">
          <h2 className="mb-1 text-[13px] font-semibold">Duyarlılık 2 — toptan/fason ciro senaryoları</h2>
          <p className="mb-3 text-xs text-muted-foreground">Toptan kanalı ciro senaryoları, diğer kanallar sabit — ağırlıklı marj ve hedef ciroya etkisi.</p>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-muted-foreground">
                <th className="px-2 py-1 text-left font-medium">Toptan cirosu</th>
                <th className="px-2 py-1 text-right font-medium">Ağırlıklı marj</th>
                <th className="px-2 py-1 text-right font-medium">Hedef ciro</th>
              </tr>
            </thead>
            <tbody>
              {sensitivity.wholesaleScenarios.map((s) => (
                <tr key={s.wholesaleRevenue} className="border-t border-border/40">
                  <td className="px-2 py-1 font-mono tabular-nums">{formatMoney(s.wholesaleRevenue, 'TRY', { digits: 0 })}</td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums">{formatPct(s.weightedMarginPct, 1)}</td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums">{formatMoney(s.targetRevenue, 'TRY', { digits: 0 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
