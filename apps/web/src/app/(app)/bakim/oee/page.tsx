import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { EmptyState } from '@/components/empty-state';
import { getOeeDashboard } from '@/modules/maintenance/queries';
import { OeeTrendChart, DowntimeParetoChart } from '@/modules/maintenance/components/oee-charts';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'OEE' };
export const dynamic = 'force-dynamic';

export default async function OeePage({ searchParams }: { searchParams: Promise<{ lineId?: string }> }) {
  await requirePermission('maintenance.view');
  const sp = await searchParams;
  const { lines, trend, pareto, kpis } = await getOeeDashboard({ lineId: sp.lineId, days: 30 });

  return (
    <>
      <PageHeader title="OEE" description="Son 30 gün — kullanılabilirlik × performans × kalite">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/bakim/oee"
            className={cn(
              'inline-flex h-11 items-center rounded-md px-3 text-[13px] font-medium md:h-8',
              !sp.lineId ? 'bg-primary text-primary-foreground' : 'border border-border/70 bg-background hover:bg-accent',
            )}
          >
            Tüm hatlar
          </Link>
          {lines.map((l) => (
            <Link
              key={l.id}
              href={`/bakim/oee?lineId=${l.id}`}
              className={cn(
                'inline-flex h-11 items-center rounded-md px-3 text-[13px] font-medium md:h-8',
                sp.lineId === l.id ? 'bg-primary text-primary-foreground' : 'border border-border/70 bg-background hover:bg-accent',
              )}
            >
              {l.code}
            </Link>
          ))}
        </div>
      </PageHeader>

      <KpiStripRow>
        <KpiCard title="OEE (ortalama)" value={kpis.avgOeePct} format="pct" delta={kpis.avgOeePctDelta} variant="strip" />
        <KpiCard title="Kullanılabilirlik" value={kpis.avgAvailabilityPct} format="pct" variant="strip" />
        <KpiCard title="Performans" value={kpis.avgPerformancePct} format="pct" variant="strip" />
        <KpiCard title="Kalite" value={kpis.avgQualityPct} format="pct" variant="strip" />
        <KpiCard title="Toplam duruş" value={kpis.totalDowntimeMinutes} format="qty" suffix="dk" variant="strip" invertDelta />
      </KpiStripRow>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border/70 bg-card p-4 lg:col-span-2">
          <h2 className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">OEE trendi</h2>
          {trend.length === 0 ? (
            <EmptyState compact title="OEE verisi yok" description="Worker `oee-daily` her gece 23:30'da hesaplar." />
          ) : (
            <OeeTrendChart data={trend} />
          )}
        </div>
        <div className="rounded-xl border border-border/70 bg-card p-4">
          <h2 className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Duruş sebebi (pareto)</h2>
          {pareto.length === 0 ? (
            <EmptyState compact title="Duruş kaydı yok" />
          ) : (
            <DowntimeParetoChart data={pareto} />
          )}
        </div>
      </div>
    </>
  );
}
