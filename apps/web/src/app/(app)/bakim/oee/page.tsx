import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { EmptyState } from '@/components/empty-state';
import { getOeeDashboard } from '@/modules/maintenance/queries';
import { OeeTrendChart, DowntimeParetoChart } from '@/modules/maintenance/components/oee-charts';
import { formatPct, formatQty } from '@/lib/format';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'OEE' };
export const dynamic = 'force-dynamic';

export default async function OeePage({ searchParams }: { searchParams: Promise<{ lineId?: string }> }) {
  await requirePermission('maintenance.view');
  const sp = await searchParams;
  const { lines, trend, pareto, kpis, machines } = await getOeeDashboard({ lineId: sp.lineId, days: 30 });

  return (
    <>
      <PageHeader title="OEE" description="Son 30 gün — kullanılabilirlik × performans × kalite">
        {/* Kök neden (Tur 4 P2 bakim-oee-03): çipler düz `<Link>` idi — globals.css'teki basılı-durum
            ölçeği (`active:scale-[0.97]`) yalnızca `button`/`[role=button]`/`a[data-pressable]`
            seçicileriyle eşleşiyor, bu çiplere hiç uygulanmıyordu (basılı geri bildirimi yok). */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/bakim/oee"
            data-pressable
            aria-current={!sp.lineId ? 'true' : undefined}
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
              data-pressable
              aria-current={sp.lineId === l.id ? 'true' : undefined}
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

      {/* Kök neden (Tur 4 P2 bakim-oee-02): sayfa iki grafikten sonra 262px boş bırakıyordu; makine
          bazlı kırılım yoktu. Aynı `oee_records` sorgusundan türeyen tablo — en düşük OEE'li makine
          en üstte (dikkat gerektiren ekipman önce). */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-border/70 bg-card p-4">
        <h2 className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Makine bazlı OEE</h2>
        <p className="mb-3 text-xs text-muted-foreground">Son 30 gün ortalaması — en düşük OEE önce.</p>
        {machines.length === 0 ? (
          <EmptyState compact title="Makine bazlı OEE verisi yok" description="oee_records tablosunda machine_id dolu kayıt bulunmuyor." />
        ) : (
          <table className="w-full min-w-max text-[13px]">
            <thead>
              <tr className="text-[11px] text-muted-foreground uppercase">
                <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">Kod</th>
                <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">Makine</th>
                <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">Hat</th>
                <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">OEE</th>
                <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">Kullanılabilirlik</th>
                <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">Duruş</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((m) => (
                <tr key={m.machineId} className="h-9 border-t border-border/40 hover:bg-muted/30">
                  <td className="px-2 font-mono text-[12px] whitespace-nowrap">{m.machineCode}</td>
                  <td className="px-2 whitespace-nowrap">{m.machineName}</td>
                  <td className="px-2 whitespace-nowrap text-muted-foreground">{m.lineCode}</td>
                  <td className={cn('num px-2 text-right tabular-nums', Number(m.oeePct) < 60 && 'font-medium text-destructive')}>{formatPct(m.oeePct)}</td>
                  <td className="num px-2 text-right tabular-nums text-muted-foreground">{formatPct(m.availabilityPct)}</td>
                  <td className="num px-2 text-right tabular-nums text-muted-foreground">{formatQty(m.downtimeMinutes, 'dk')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
