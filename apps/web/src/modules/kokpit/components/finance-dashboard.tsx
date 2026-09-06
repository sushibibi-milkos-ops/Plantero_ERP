import type { FinanceCards } from '@plantero/core/cockpit/kpis';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { Wallet } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import type { CockpitReceipt } from '../queries';
import { Section, RowLink, ProgressBar, DashboardGrid } from './shared';

function periodLabel(period: string): string {
  const [y, m] = period.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
}

/** Muhasebe/Finans panosu — banka, mutabakat kuyruğu, vadesi geçen, KDV pozisyonu, 3 aylık nakit projeksiyonu, break-even. */
export function FinanceDashboardView({ data, paymentsToday }: { data: FinanceCards; paymentsToday: CockpitReceipt[] }) {
  const { bank, reconciliationQueue, overdue, vat, cashProjection3m, breakEven } = data;

  return (
    <>
      <KpiStripRow>
        <KpiCard title="Banka toplamı" value={bank.totalTry} format="money" fractionDigits={0} href="/muhasebe/banka" variant="strip" />
        <KpiCard title="Vadesi geçen alacak" value={overdue.aging.totalOverdue} format="money" fractionDigits={0} invertDelta href="/finans/tahsilat-takibi" variant="strip" />
        <KpiCard title="KDV ödenecek" value={vat ? vat.payable : null} format="money" fractionDigits={0} href="/muhasebe/kdv" variant="strip" />
        <KpiCard title="Break-even ilerleme" value={breakEven.progressPct} format="pct" href="/finans/break-even" variant="strip" />
      </KpiStripRow>

      <DashboardGrid>
        <div className="min-w-0 flex flex-col gap-4">
          <Section title="Banka" href="/muhasebe/banka">
            <div className="flex h-11 items-center justify-between border-b border-border/60 px-4 text-[13px]">
              <span className="text-muted-foreground">Toplam (TRY hesaplar)</span>
              <MoneyCell value={bank.totalTry} className="font-medium" />
            </div>
            {bank.accounts.length === 0 ? (
              <EmptyState compact title="Banka hesabı yok" />
            ) : (
              <ul className="divide-y divide-border/50">
                {bank.accounts.map((a) => (
                  <li key={a.id} className="flex h-11 items-center justify-between gap-3 px-4 text-[13px]">
                    <span className="flex min-w-0 items-center gap-2">
                      <Wallet className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                      <span className="min-w-0 truncate">{a.bankName} · {a.code}</span>
                    </span>
                    <MoneyCell value={a.statementBalance} currency={a.currency} className="shrink-0" />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Mutabakat kuyruğu" href="/muhasebe/mutabakat">
            <div className="flex h-16 items-center justify-between px-4">
              <span className="text-sm text-muted-foreground">Onay bekleyen AI önerisi</span>
              <span className="text-lg font-semibold tabular-nums">{reconciliationQueue}</span>
            </div>
          </Section>

          <Section title="Bugünün tahsilatları" href="/finans/tahsilat">
            {paymentsToday.length === 0 ? (
              <EmptyState compact title="Bugün tahsilat yok" />
            ) : (
              <ul className="divide-y divide-border/50">
                {paymentsToday.map((r) => (
                  <li key={r.id} className="flex h-11 items-center justify-between gap-3 px-4 text-[13px]">
                    <span className="min-w-0 truncate">{r.partnerName}</span>
                    <MoneyCell value={r.amount} className="shrink-0" />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="min-w-0 flex flex-col gap-4">
          <Section title="Geciken alacak" href="/finans/tahsilat-takibi">
            <div className="grid grid-cols-4 divide-x divide-border/60 border-b border-border/60 text-center text-[11px]">
              {([['0-30', overdue.aging.b0_30], ['31-60', overdue.aging.b31_60], ['61-90', overdue.aging.b61_90], ['90+', overdue.aging.b90plus]] as const).map(([label, v]) => (
                <div key={label} className="px-2 py-2.5">
                  <div className="num text-[13px] font-semibold tabular-nums">{formatMoney(v, 'TRY', { digits: 0 })}</div>
                  <div className="mt-0.5 text-muted-foreground">{label} gün</div>
                </div>
              ))}
            </div>
            {overdue.top5.length === 0 ? (
              <EmptyState compact title="Vadesi geçen alacak yok" />
            ) : (
              <ul className="divide-y divide-border/50">
                {overdue.top5.map((inv) => (
                  <li key={inv.id}>
                    <RowLink href="/finans/tahsilat-takibi">
                      <span className="min-w-0 flex-1 truncate">{inv.partnerName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{inv.daysOverdue} gün</span>
                      <MoneyCell value={inv.residual} className="shrink-0" />
                    </RowLink>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="KDV pozisyonu" href="/muhasebe/kdv">
            {!vat ? (
              <EmptyState compact title="Henüz KDV dönemi hesaplanmadı" />
            ) : (
              <div className="grid grid-cols-2 gap-3 p-4 text-sm">
                <div><div className="text-xs text-muted-foreground">Dönem</div><div className="mt-0.5 font-medium">{periodLabel(vat.period)}</div></div>
                <div><div className="text-xs text-muted-foreground">Ödenecek</div><MoneyCell value={vat.payable} className="mt-0.5 block text-left text-sm font-medium" /></div>
                <div><div className="text-xs text-muted-foreground">Hesaplanan (391)</div><MoneyCell value={vat.outputVat} className="mt-0.5 block text-left text-sm" /></div>
                <div><div className="text-xs text-muted-foreground">İndirilecek (191)</div><MoneyCell value={vat.inputVat} className="mt-0.5 block text-left text-sm" /></div>
              </div>
            )}
          </Section>

          <Section title="Nakit projeksiyonu (3 ay)" href="/finans/nakit-akisi">
            <div className="grid grid-cols-3 divide-x divide-border/60">
              {cashProjection3m.map((c) => {
                const negative = Number(c.netCashflow) < 0;
                return (
                  <div key={c.period} className="px-2 py-3 text-center">
                    <div className="text-[10px] text-muted-foreground">{periodLabel(c.period)}</div>
                    <div className={`num mt-1 text-[13px] font-semibold tabular-nums ${negative ? 'text-destructive' : 'text-success'}`}>
                      {formatMoney(c.netCashflow, 'TRY', { digits: 0 })}
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">kapanış {formatMoney(c.closingCash, 'TRY', { digits: 0, compact: true })}</div>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Break-even'a uzaklık" href="/finans/break-even">
            <div className="p-4">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">Bu ay gereken</span>
                <MoneyCell value={breakEven.targetRevenue} className="text-sm font-medium" />
              </div>
              <div className="mt-1 flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">Gerçekleşen</span>
                <MoneyCell value={breakEven.actualNetRevenue} className="text-sm font-medium" />
              </div>
              <div className="mt-3"><ProgressBar pct={Number(breakEven.progressPct)} tone={Number(breakEven.progressPct) >= 100 ? 'success' : 'primary'} /></div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>%{Number(breakEven.progressPct).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</span>
                <span>{breakEven.daysRemaining} gün · günlük {formatMoney(breakEven.dailyPaceNeeded, 'TRY', { digits: 0 })}</span>
              </div>
            </div>
          </Section>
        </div>
      </DashboardGrid>
    </>
  );
}
