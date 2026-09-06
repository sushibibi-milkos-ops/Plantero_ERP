import type { SalesCards } from '@plantero/core/cockpit/kpis';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { QtyCell } from '@/components/qty-cell';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { ChannelBars } from './channel-bars';
import { Section, DashboardGrid } from './shared';

const FUNNEL_ORDER = ['lead', 'qualified', 'proposal', 'negotiation'];

/** Satış panosu — huni, bugünkü sipariş sayısı, kanal ciro (bugün), son 30 gün en çok satan 5. */
export function SalesDashboardView({ data }: { data: SalesCards }) {
  const funnel = [...data.funnel].sort((a, b) => FUNNEL_ORDER.indexOf(a.stageCode) - FUNNEL_ORDER.indexOf(b.stageCode)).filter((f) => FUNNEL_ORDER.includes(f.stageCode));
  const maxFunnel = Math.max(...funnel.map((f) => f.count), 1);

  return (
    <>
      <KpiStripRow>
        <KpiCard title="Bugünkü sipariş" value={data.todayOrders} format="int" href="/satis/siparisler" variant="strip" />
        <KpiCard title="Bugünkü brüt ciro" value={data.channelToday.grossTotal} format="money" fractionDigits={0} delta={data.channelToday.grossDeltaPct} deltaLabel="dünden" href="/satis/net-ciro" variant="strip" />
        <KpiCard title="Bugünkü net ciro" value={data.channelToday.netTotal} format="money" fractionDigits={0} delta={data.channelToday.netDeltaPct} deltaLabel="dünden" href="/satis/net-ciro" variant="strip" />
        <KpiCard title="Açık fırsat" value={funnel.reduce((a, f) => a + f.count, 0)} format="int" href="/satis/firsatlar" variant="strip" />
      </KpiStripRow>

      <DashboardGrid>
        <div className="min-w-0 flex flex-col gap-4">
          <Section title="Kanal ciro (bugün)" href="/satis/net-ciro">
            {data.channelToday.rows.length === 0 ? (
              <EmptyState compact title="Bugün henüz sipariş yok" />
            ) : (
              <div className="p-4"><ChannelBars rows={data.channelToday.rows.map((r) => ({ name: r.name, net: Number(r.net) }))} /></div>
            )}
          </Section>

          <Section title="Satış hunisi" href="/satis/firsatlar">
            {funnel.every((f) => f.count === 0) ? (
              <EmptyState compact title="Açık fırsat yok" />
            ) : (
              <ul className="space-y-2.5 p-4">
                {funnel.map((f) => (
                  <li key={f.stageCode} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">{f.stageName}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary/70" style={{ width: `${(f.count / maxFunnel) * 100}%` }} />
                    </div>
                    <span className="w-6 shrink-0 text-right text-xs tabular-nums">{f.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <Section title="En çok satan 5 (son 30 gün)" href="/satis/net-ciro" className="lg:self-start">
          {data.top5Products.length === 0 ? (
            <EmptyState compact title="Son 30 günde satış yok" />
          ) : (
            <ul className="divide-y divide-border/50">
              {data.top5Products.map((p, i) => (
                <li key={p.productId} className="flex h-11 items-center justify-between gap-3 px-4 text-[13px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-4 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 truncate">{p.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <QtyCell value={p.qty} uom={p.uomCode} />
                    <MoneyCell value={p.revenue} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </DashboardGrid>
    </>
  );
}
