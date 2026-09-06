import type { ProductionChiefCards } from '@plantero/core/cockpit/kpis';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { StatusBadge } from '@/components/status-badge';
import { QtyCell } from '@/components/qty-cell';
import { EmptyState } from '@/components/empty-state';
import { formatDateTime } from '@/lib/format';
import { Section, RowLink, DashboardGrid, ProductionLineRow, StatStrip } from './shared';

const SCRAP_REASON_LABEL: Record<string, string> = {
  spill: 'Döküm/sızma', burnt: 'Yanma', contamination: 'Kontaminasyon', packaging: 'Ambalaj', startup: 'Başlangıç fire', other: 'Diğer',
};

/** Üretim şefi panosu — hat durumu, açık/geciken iş emri, bugünkü OEE, son 7 gün fire oranı + kırılımı, son iş emirleri.
 *  Kök neden (Tur 1 P1 kokpit-uretim-density-01): önceden tek bölüm (Hat durumu, 3 satır) vardı — ilk
 *  ekranın yarısı boş kalıyordu, KPI'daki "Açık iş emri 1" gibi sayıların arkasında hiçbir liste yoktu. */
export function ProductionChiefDashboardView({ data }: { data: ProductionChiefCards }) {
  return (
    <>
      <KpiStripRow>
        <KpiCard title="Açık iş emri" value={data.openWorkOrders} format="int" href="/uretim/is-emirleri" variant="strip" />
        <KpiCard title="Geciken iş emri" value={data.lateWorkOrders} format="int" href="/uretim/is-emirleri" invertDelta variant="strip" />
        <KpiCard title="Bugünkü OEE" value={data.todayOeePct} format="pct" href="/uretim/hatlar" variant="strip" />
        <KpiCard title="Fire oranı (7g)" value={data.scrapRatePct7d} format="pct" href="/uretim/is-emirleri" invertDelta variant="strip" />
      </KpiStripRow>

      <DashboardGrid>
        <div className="min-w-0 flex flex-col gap-4">
          <Section title="Hat durumu" href="/uretim/hatlar">
            {data.lines.length === 0 ? (
              <EmptyState compact title="Aktif hat yok" />
            ) : (
              <ul className="divide-y divide-border/50">
                {data.lines.map((l) => (
                  <li key={l.lineId}>
                    <ProductionLineRow line={l} href="/uretim/hatlar" />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Fire kırılımı (7 gün)" href="/uretim/is-emirleri">
            {data.scrapBreakdown7d.length === 0 ? (
              <EmptyState compact title="Son 7 günde fire kaydı yok" />
            ) : (
              <StatStrip
                items={data.scrapBreakdown7d.slice(0, 4).map((s) => ({
                  key: s.reason,
                  value: s.entryCount,
                  label: SCRAP_REASON_LABEL[s.reason] ?? s.reason,
                }))}
              />
            )}
          </Section>
        </div>

        <Section title="Son iş emirleri" href="/uretim/is-emirleri">
          {data.recentWorkOrders.length === 0 ? (
            <EmptyState compact title="Henüz iş emri yok" />
          ) : (
            <ul className="divide-y divide-border/50">
              {data.recentWorkOrders.map((w) => (
                <li key={w.id}>
                  <RowLink href="/uretim/is-emirleri">
                    <div className="flex min-w-0 items-center justify-between gap-3 sm:contents">
                      <span className="flex min-w-0 items-center gap-2 sm:contents">
                        <span className="shrink-0 text-xs text-muted-foreground sm:w-24">{w.lineName}</span>
                        <span className="truncate font-mono text-xs sm:w-32 sm:shrink-0">{w.docNo}</span>
                      </span>
                      <span className="shrink-0 sm:order-last">
                        {w.isLate ? <StatusBadge status="late" label="Gecikmiş" tone="danger" /> : <StatusBadge status={w.status} kind="work_order" />}
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center justify-between gap-3 sm:contents">
                      <span className="min-w-0 flex-1 truncate">{w.productName}</span>
                      {w.finishedAt ? (
                        <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(w.finishedAt)}</span>
                      ) : (
                        <QtyCell value={w.producedQty} uom={w.uomCode} className="shrink-0" />
                      )}
                    </div>
                  </RowLink>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </DashboardGrid>
    </>
  );
}
