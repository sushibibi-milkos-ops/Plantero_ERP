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
  const { lines, trend, pareto, kpis, machines, lineBreakdown } = await getOeeDashboard({ lineId: sp.lineId, days: 30 });

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
            // Kök neden (Tur 5 P1 bakim-oee-08): açıklama kullanıcıya worker'ın iç adını
            // (`oee-daily`) ve çalışma saatini gösteriyordu — son kullanıcı için anlamsız bir
            // altyapı detayı. Artık kullanıcı diliyle: veri henüz oluşmadıysa ne zaman oluşacağını
            // söyler, isim/tablo/worker geçmez.
            <EmptyState compact title="OEE verisi yok" description="Bu dönem için henüz hesaplanmış OEE kaydı yok; veriler gece otomatik güncellenir." />
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

      {/* Kök neden (Tur 5 P1 bakim-oee-09, Tur 4'ün "makine bazlı OEE" düzeltmesinin YERİNE): eski
          kart `oee_records.machine_id` dolu satırlara bağlıydı — ama `oee-daily` worker'ı ve seed
          BUNU HİÇBİR ZAMAN üretmiyor (bkz. `maintenance/oee.ts` üstündeki not), yani kart canlı
          veriyle DAİMA boştu: 1152×250px'lik sıfır-bilgi bir "veri yok" kartı ilk ekranın alt
          yarısını kaplıyordu (Tur 5 ölçüm: oee_records 90 kayıt, machine_id dolu 0). Aynı `records`
          sorgusu HAT bazında (`lineId`, inner join ile garantili) HER ZAMAN dolu — bilgi taşımayan
          kart yerine hat bazlı kırılım tablosu kondu; kart yalnızca gerçekten veri varken render
          edilir (trend boşsa bu da boştur, o durumda hiç render edilmez — sıfır-bilgi kart yok). */}
      {lineBreakdown.length > 0 ? (
        <div className="mt-4 rounded-xl border border-border/70 bg-card p-4">
          <h2 className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Hat bazlı OEE</h2>
          <p className="mb-3 text-xs text-muted-foreground">Son 30 gün ortalaması — en düşük OEE önce.</p>
          {/* Kök neden (Tur 6 P1 bakim-oee-11): kaydırma kabı (`overflow-x-auto`) uygulamanın kendi
              taşma göstergesi olmadan çıplaktı — 390px'te 6 sütun kabına sığmıyordu (scrollWidth 620 >
              clientWidth 356) ve kullanıcının kaydırılabilir olduğuna dair hiçbir ipucu yoktu, kart
              kenarında yarım glif kalıyordu. `scrollbar-thin scroll-fade-x` diğer tüm modüllerdeki
              taşan tablo/pano deseniyle (kanban-board, data-table, document-chain) aynı: kenarlarda
              ince soldurma + kaydırma çubuğu — kesik kenar artık örtük değil, işaretli. */}
          <div className="scrollbar-thin scroll-fade-x overflow-x-auto">
          <table className="w-full min-w-max text-[13px]">
            <thead>
              <tr className="text-[11px] text-muted-foreground uppercase">
                <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">Hat</th>
                <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">OEE</th>
                <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">Kullanılabilirlik</th>
                <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">Performans</th>
                <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">Kalite</th>
                <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">Duruş</th>
              </tr>
            </thead>
            <tbody>
              {lineBreakdown.map((l) => (
                <tr key={l.lineId} className="h-9 border-t border-border/40 hover:bg-muted/30">
                  <td className="px-2 whitespace-nowrap"><span className="font-mono text-[12px] text-muted-foreground">{l.lineCode}</span> {l.lineName}</td>
                  <td className={cn('num px-2 text-right tabular-nums', Number(l.oeePct) < 60 && 'font-medium text-destructive')}>{formatPct(l.oeePct)}</td>
                  <td className="num px-2 text-right tabular-nums text-muted-foreground">{formatPct(l.availabilityPct)}</td>
                  <td className="num px-2 text-right tabular-nums text-muted-foreground">{formatPct(l.performancePct)}</td>
                  <td className="num px-2 text-right tabular-nums text-muted-foreground">{formatPct(l.qualityPct)}</td>
                  <td className="num px-2 text-right tabular-nums text-muted-foreground">{formatQty(l.downtimeMinutes, 'dk')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ) : null}

      {/* Makine bazlı satır yalnızca (ileride) `oee_records.machine_id` dolu geldiğinde anlamlı —
          bugün hiçbir zaman dolu gelmediği için (bilinen kapsam sınırı) sıfır-bilgi kart göstermek
          yerine tamamen atlanır (bakim-oee-09). */}
      {machines.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border/70 bg-card p-4">
          <h2 className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Makine bazlı OEE</h2>
          <p className="mb-3 text-xs text-muted-foreground">Son 30 gün ortalaması — en düşük OEE önce.</p>
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
        </div>
      ) : null}
    </>
  );
}
