import type { WarehouseCards } from '@plantero/core/cockpit/kpis';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { StatusBadge } from '@/components/status-badge';
import { QtyCell } from '@/components/qty-cell';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { formatMoney } from '@/lib/format';
import type { CockpitTodayItem } from '../queries';
import { Section, RowLink } from './shared';

const EXPIRY_BUCKET_LABEL: Record<string, string> = { expired: 'Süresi geçti', critical: '< 30 gün', warning: '30-60 gün', notice: '60-90 gün' };

/** Depo rolü panosu — büyük dokunma hedefleri (KpiCard strip zaten 72/80px), tek amaca odaklı sayaçlar. */
export function DepoDashboardView({ data, today }: { data: WarehouseCards; today: CockpitTodayItem[] }) {
  return (
    <>
      <KpiStripRow>
        <KpiCard title="Mal kabul bekleyen" value={data.receiptsPending} format="int" href="/depo/mal-kabul" invertDelta variant="strip" />
        <KpiCard title="Sevk bekleyen" value={data.deliveriesPending} format="int" href="/depo/sevkiyat" invertDelta variant="strip" />
        <KpiCard title="Açık sayım" value={data.countsOpen} format="int" href="/depo/sayim" invertDelta variant="strip" />
        <KpiCard title="Karantinada" value={data.quarantine.count} format="int" href="/depo/lotlar" invertDelta variant="strip" />
      </KpiStripRow>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-start">
        <Section title="Karantina değeri" href="/depo/lotlar">
          <div className="flex h-16 items-center justify-between px-4">
            <span className="text-sm text-muted-foreground">{data.quarantine.count} lot bekliyor</span>
            <span className="num text-lg font-semibold tabular-nums">{formatMoney(data.quarantine.value, 'TRY', { digits: 0 })}</span>
          </div>
        </Section>

        <Section title="SKT riski" href="/depo/skt">
          <div className="grid grid-cols-4 divide-x divide-border/60">
            {(['expired', 'critical', 'warning', 'notice'] as const).map((b) => (
              <div key={b} className="px-2 py-3 text-center">
                <div className="text-[17px] font-semibold tabular-nums">{data.expiry[b].count}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">{EXPIRY_BUCKET_LABEL[b]}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Bugün" href="/depo/mal-kabul" className="lg:col-span-2">
          {today.length === 0 ? (
            <EmptyState compact title="Bugün henüz mal kabul/sevkiyat yok" />
          ) : (
            <ul className="divide-y divide-border/50">
              {today.map((t) => (
                <li key={`${t.k}-${t.no}`}>
                  <RowLink href={t.href}>
                    <span className="flex min-w-0 items-center gap-2 sm:contents">
                      <span className="shrink-0 text-xs text-muted-foreground sm:w-24">{t.kind}</span>
                      <span className="truncate font-mono text-xs sm:w-36 sm:shrink-0">{t.no}</span>
                    </span>
                    <span className="shrink-0 sm:order-last"><StatusBadge status={t.status} kind={t.k} /></span>
                    <span className="min-w-0 flex-1 truncate">{t.partner}</span>
                    <span className="shrink-0">{t.amount !== undefined ? <MoneyCell value={t.amount} /> : t.qty !== undefined ? <QtyCell value={t.qty} uom={t.uom} /> : null}</span>
                  </RowLink>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
