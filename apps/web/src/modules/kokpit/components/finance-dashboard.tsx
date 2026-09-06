import Link from 'next/link';
import type { FinanceCards } from '@plantero/core/cockpit/kpis';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Wallet, Plus } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import type { CockpitReceipt } from '../queries';
import { Section, DashboardGrid, StatStrip, AgingStrip, OverdueTop5List, BreakEvenPanel } from './shared';

function periodLabel(period: string): string {
  const [y, m] = period.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
}

/** Muhasebe/Finans panosu — banka, mutabakat kuyruğu, vadesi geçen, KDV pozisyonu, 3 aylık nakit projeksiyonu, break-even. */
export function FinanceDashboardView({ data, paymentsToday }: { data: FinanceCards; paymentsToday: CockpitReceipt[] }) {
  const { bank, reconciliationQueue, reconciliationQueueItems, overdue, vat, cashProjection3m, breakEven } = data;

  return (
    <>
      <KpiStripRow>
        <KpiCard title="Banka toplamı" value={bank.totalTry} format="money" fractionDigits={0} href="/muhasebe/banka" variant="strip" />
        <KpiCard title="Vadesi geçen alacak" value={overdue.aging.totalOverdue} format="money" fractionDigits={0} invertDelta href="/finans/tahsilat-takibi" variant="strip" />
        <KpiCard title="KDV ödenecek" value={vat ? vat.payable : null} format="money" fractionDigits={0} href="/muhasebe/kdv" variant="strip" />
        {/* Kök neden (Tur 1 P1 kokpit-fin-col-balance-01 + kokpit-fin-density-01): bu sayaç önceden
            110px'lik tek satırlık bir bölüm işgal ediyordu (sol kolonun altında 246px boş alan
            bırakan tek katkı) — bir sayaç zaten KPI şeridine ait. Aşağıdaki "Mutabakat kuyruğu"
            bölümü artık bir SAYAÇ değil, bekleyen önerilerin gerçek LİSTESİ. */}
        <KpiCard title="Mutabakat kuyruğu" value={reconciliationQueue} format="int" invertDelta href="/muhasebe/mutabakat" variant="strip" />
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
            {reconciliationQueueItems.length === 0 ? (
              <EmptyState compact title="Onay bekleyen öneri yok" />
            ) : (
              <ul className="divide-y divide-border/50">
                {reconciliationQueueItems.map((r) => (
                  <li key={r.id} className="flex h-11 items-center justify-between gap-3 px-4 text-[13px]">
                    <span className="min-w-0 flex-1 truncate">{r.partnerName ?? r.counterpartyName ?? r.description}</span>
                    <MoneyCell value={r.amount} className="shrink-0" />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Bugünün tahsilatları" href="/finans/tahsilat">
            {paymentsToday.length === 0 ? (
              // Kök neden (Tur 2 P1 kokpit-empty-action-02): boş durum yalnızca ikon+başlık taşıyordu —
              // puan kartı kriteri 7 ikon+başlık+açıklama+eylem istiyor (Tur 1'de yalnızca 2/14 boş
              // durum düzeltilmişti, bu ikisi eksik kalmıştı).
              <EmptyState
                compact
                title="Bugün tahsilat yok"
                description="Bir tahsilat kaydedildiğinde burada görünür."
                action={
                  <Button asChild variant="outline" size="sm" className="h-11 md:h-8">
                    <Link href="/finans/tahsilat/yeni"><Plus className="size-3.5" /> Tahsilat kaydet</Link>
                  </Button>
                }
              />
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
            <AgingStrip aging={overdue.aging} />
            {overdue.top5.length === 0 ? <EmptyState compact title="Vadesi geçen alacak yok" /> : <OverdueTop5List items={overdue.top5} href="/finans/tahsilat-takibi" />}
          </Section>

          <Section title="KDV pozisyonu" href="/muhasebe/kdv">
            {!vat ? (
              <EmptyState compact title="Henüz KDV dönemi hesaplanmadı" />
            ) : (
              <StatStrip
                divider
                items={[
                  { key: 'period', value: periodLabel(vat.period), label: 'Dönem', valueClassName: 'text-[13px]' },
                  { key: 'payable', value: formatMoney(vat.payable, 'TRY', { digits: 0 }), label: 'Ödenecek' },
                  { key: 'output', value: formatMoney(vat.outputVat, 'TRY', { digits: 0 }), label: 'Hesaplanan (391)' },
                  { key: 'input', value: formatMoney(vat.inputVat, 'TRY', { digits: 0 }), label: 'İndirilecek (191)' },
                ]}
              />
            )}
          </Section>

          <Section title="Nakit projeksiyonu (3 ay)" href="/finans/nakit-akisi">
            {/* Kök neden (Tur 1 P1 kokpit-cash-mixed-format-01 + kokpit-cash-green-01): aynı hücrede
                iki farklı notasyon (tam basamaklı net akış + kısaltılmış "kapanış ₺33,3 B") VE üç ayın
                üçü de pozitif olduğu için hiçbir ayrım taşımayan süs yeşili kullanılıyordu. Artık ikisi
                de TAM basamaklı, renk yalnızca negatifte devreye girer (Stripe pozitif tutarı boyamaz). */}
            <StatStrip
              items={cashProjection3m.map((c) => {
                const negative = Number(c.netCashflow) < 0;
                return {
                  key: c.period,
                  top: periodLabel(c.period),
                  value: formatMoney(c.netCashflow, 'TRY', { digits: 0 }),
                  valueClassName: negative ? 'text-destructive' : undefined,
                  label: `kapanış ${formatMoney(c.closingCash, 'TRY', { digits: 0 })}`,
                };
              })}
            />
          </Section>

          <Section title="Break-even'a uzaklık" href="/finans/break-even">
            <BreakEvenPanel breakEven={breakEven} />
          </Section>
        </div>
      </DashboardGrid>
    </>
  );
}
