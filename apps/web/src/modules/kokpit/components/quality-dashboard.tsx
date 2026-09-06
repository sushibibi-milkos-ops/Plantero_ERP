import type { QualityCards } from '@plantero/core/cockpit/kpis';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { EmptyState } from '@/components/empty-state';
import { Section, RowLink, DashboardGrid } from './shared';

/** Kalite panosu — bekleyen QC, red oranı (30g), düşen tedarikçi skorları, açık geri çağırma. */
export function QualityDashboardView({ data }: { data: QualityCards }) {
  return (
    <>
      <KpiStripRow>
        <KpiCard title="Bekleyen QC" value={data.pendingQc} format="int" href="/kalite/kontroller" variant="strip" />
        <KpiCard title="Red oranı (30g)" value={data.rejectRatePct30d} format="pct" href="/kalite/kontroller" invertDelta variant="strip" />
        <KpiCard title="Düşen tedarikçi" value={data.supplierScoreDrops.length} format="int" href="/kalite/tedarikci-skoru" invertDelta variant="strip" />
        <KpiCard title="Açık geri çağırma" value={data.recallsOpen} format="int" href="/kalite/geri-cagirma" invertDelta variant="strip" />
      </KpiStripRow>

      <DashboardGrid>
        <Section title="Düşen tedarikçi skorları" href="/kalite/tedarikci-skoru">
          {data.supplierScoreDrops.length === 0 ? (
            <EmptyState compact title="Düşen skor yok" description="Önceki döneme göre puanı düşen tedarikçi burada listelenir." />
          ) : (
            <ul className="divide-y divide-border/50">
              {data.supplierScoreDrops.map((s) => (
                <li key={s.partnerId}>
                  <RowLink href="/kalite/tedarikci-skoru">
                    <span className="min-w-0 flex-1 truncate">{s.partnerName}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{s.previousScore} → {s.score}</span>
                    <span className="num shrink-0 text-destructive">{s.deltaPts}</span>
                  </RowLink>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Bekleyen kalite kontrolleri" href="/kalite/kontroller">
          {data.pendingQc === 0 ? (
            <EmptyState compact title="Bekleyen kontrol yok" />
          ) : (
            <div className="flex h-16 items-center justify-between px-4">
              <span className="text-sm text-muted-foreground">Sonuç bekleyen kontrol</span>
              <span className="text-lg font-semibold tabular-nums">{data.pendingQc}</span>
            </div>
          )}
        </Section>
      </DashboardGrid>
    </>
  );
}
