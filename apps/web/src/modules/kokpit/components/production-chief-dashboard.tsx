import type { ProductionChiefCards } from '@plantero/core/cockpit/kpis';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { StatusBadge } from '@/components/status-badge';
import { QtyCell } from '@/components/qty-cell';
import { EmptyState } from '@/components/empty-state';
import type { CockpitTodayItem } from '../queries';
import { Section, RowLink, ProgressBar } from './shared';

/** Üretim şefi panosu — hat durumu, açık/geciken iş emri, bugünkü OEE, son 7 gün fire oranı. */
export function ProductionChiefDashboardView({ data, today }: { data: ProductionChiefCards; today: CockpitTodayItem[] }) {
  return (
    <>
      <KpiStripRow>
        <KpiCard title="Açık iş emri" value={data.openWorkOrders} format="int" href="/uretim/is-emirleri" variant="strip" />
        <KpiCard title="Geciken iş emri" value={data.lateWorkOrders} format="int" href="/uretim/is-emirleri" invertDelta variant="strip" />
        <KpiCard title="Bugünkü OEE" value={data.todayOeePct} format="pct" href="/uretim/hatlar" variant="strip" />
        <KpiCard title="Fire oranı (7g)" value={data.scrapRatePct7d} format="pct" href="/uretim/is-emirleri" invertDelta variant="strip" />
      </KpiStripRow>

      <div className="mt-4">
        <Section title="Hat durumu" href="/uretim/hatlar">
          {data.lines.length === 0 ? (
            <EmptyState compact title="Aktif hat yok" />
          ) : (
            <ul className="divide-y divide-border/50">
              {data.lines.map((l) => {
                const planned = Number(l.current?.plannedQty ?? 0);
                const produced = Number(l.current?.producedQty ?? 0);
                const pct = l.current && planned > 0 ? Math.min(100, Math.round((produced / planned) * 100)) : 0;
                return (
                  <li key={l.lineId}>
                    <RowLink href="/uretim/hatlar" className="flex-col items-stretch py-3 sm:h-auto sm:flex-col sm:items-stretch">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{l.name}</span>
                        <span className="flex items-center gap-2">
                          {l.lateCount > 0 ? <StatusBadge status="late" label={`${l.lateCount} gecikmiş`} tone="danger" /> : null}
                          {l.current ? <StatusBadge status={l.current.status} kind="work_order" /> : <StatusBadge status="idle" label="Boşta" tone="muted" />}
                        </span>
                      </div>
                      {l.current ? (
                        <>
                          {pct > 0 ? <div className="mt-1.5"><ProgressBar pct={pct} /></div> : null}
                          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                            <span className="font-mono">{l.current.docNo} · {l.current.productName}</span>
                            <span className="tabular-nums">{pct > 0 ? `%${pct}` : `${l.openCount} açık`}</span>
                          </div>
                        </>
                      ) : (
                        <div className="mt-1 text-[11px] text-muted-foreground">Şu an açık iş emri yok</div>
                      )}
                    </RowLink>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
