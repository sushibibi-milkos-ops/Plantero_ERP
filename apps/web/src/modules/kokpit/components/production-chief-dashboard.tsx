import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ProductionChiefCards } from '@plantero/core/cockpit/kpis';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { StatusBadge } from '@/components/status-badge';
import { QtyCell } from '@/components/qty-cell';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Section, RowLink, DashboardGrid, ProductionLineRow, StatStrip } from './shared';

const SCRAP_REASON_LABEL: Record<string, string> = {
  spill: 'Döküm/sızma', burnt: 'Yanma', contamination: 'Kontaminasyon', packaging: 'Ambalaj', startup: 'Başlangıç fire', other: 'Diğer',
};
const DOWNTIME_REASON_LABEL: Record<string, string> = {
  breakdown: 'Arıza', changeover: 'Ürün değişimi', cleaning: 'Temizlik', material_shortage: 'Malzeme yok',
  no_operator: 'Operatör yok', planned_maintenance: 'Planlı bakım', quality_hold: 'Kalite bekletme', power: 'Elektrik kesintisi', break: 'Mola', other: 'Diğer',
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
              // Kök neden (Tur 2 P1 kokpit-empty-action-03): boş durum yalnızca ikon+başlık taşıyordu —
              // puan kartı kriteri 7 ikon+başlık+açıklama+eylem istiyor.
              <EmptyState
                compact
                title="Son 7 günde fire kaydı yok"
                description="İş emri tamamlanırken fire girildiğinde kırılım burada görünür."
                action={
                  <Button asChild variant="outline" size="sm" className="h-11 md:h-8">
                    <Link href="/uretim/is-emirleri"><ArrowRight className="size-3.5" /> İş emirlerini gör</Link>
                  </Button>
                }
              />
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

        {/* Kök neden (Tur 2 P1 kokpit-uretim-col-balance-01): "Son duruşlar" sol kolonda üçüncü bölüm
            olunca sol kolon (695px) sağ kolonun (405px) neredeyse iki katına çıkıyordu. Artık sağ
            kolonda "Son iş emirleri"nin altında — iki kolon farkı ~155px'e iner (hedef ≤200px). */}
        <div className="min-w-0 flex flex-col gap-4">
          <Section title="Son iş emirleri" href="/uretim/is-emirleri">
            {data.recentWorkOrders.length === 0 ? (
              <EmptyState compact title="Henüz iş emri yok" />
            ) : (
              <ul className="divide-y divide-border/50">
                {data.recentWorkOrders.map((w) => (
                  <li key={w.id}>
                    {/* Kök neden (Tur 3 P1 kokpit-wo-line-trunc-02 + kokpit-wo-mobile-docno-trunc-01 +
                        kokpit-numcol-ragged-04): Tur 2'nin `sm:w-32` (128px) sabit hat adı sütunu
                        gerçek içerikten (130-146px, ör. "Bazlar, Barista & Kremalar") hâlâ dardı —
                        sarmayı çözerken kırpmaya döndü. Kök neden aynıydı: masaüstünde `sm:contents`
                        TEK satıra düzleşiyordu (hat, no, ürün adı, miktar, rozet — 5 öğe), bu yüzden hat
                        adına ayrılan pay rozet+miktar genişliğinden ARTAN boşluktan hesaplanıyordu VE
                        miktarın sağ kenarı (rozet ondan SONRA geldiği için) rozet uzunluğuna göre
                        28px'e kadar kayıyordu. 390px'te de aynı tek-satır mantığı belge no'yu
                        (bir KİMLİK) hat adından sonra sıkıştırıp kırpıyordu — kimlik asla kırpılmamalı.
                        Düzeltme TodayRow ile birebir aynı desen (bkz. shared.tsx): satır HER ZAMAN 2
                        satır. Satır 1: hat adı (artık `flex-1 truncate` — kısıtlı sabit genişlik YOK,
                        gerçek içeriğe göre büyür) + belge no (`shrink-0` — asla kırpılmaz) + rozet
                        (satırın kendi sağ kenarı, ondan sonra hizalanacak başka öğe yok). Satır 2: ürün
                        adı + miktar (rozet artık bu satırda değil — miktarın sağ kenarı her zaman
                        satırın sağ kenarı, ±0px). */}
                    <RowLink href="/uretim/is-emirleri" className="sm:h-auto sm:flex-col sm:items-stretch sm:gap-0.5 sm:py-2">
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{w.lineName}</span>
                          <span className="shrink-0 truncate font-mono text-xs">{w.docNo}</span>
                        </span>
                        <span className="shrink-0">
                          {w.isLate ? <StatusBadge status="late" label="Gecikmiş" tone="danger" /> : <StatusBadge status={w.status} kind="work_order" />}
                        </span>
                      </div>
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <span className="min-w-0 flex-1 truncate">{w.productName}</span>
                        {/* Kök neden (Tur 2 P1 kokpit-wo-wrap-01): bu sütun satıra göre ya bitiş tarihi
                            ya üretilen miktar basıyordu (tek sütun, iki veri tipi). Artık HER satırda
                            aynı alan (üretilen miktar) — tek veri tipi. */}
                        <QtyCell value={w.producedQty} uom={w.uomCode} className="shrink-0" />
                      </div>
                    </RowLink>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Son duruşlar" href="/uretim/hatlar">
            {data.recentDowntimes.length === 0 ? (
              <EmptyState compact title="Kayıtlı duruş yok" />
            ) : (
              <ul className="divide-y divide-border/50">
                {data.recentDowntimes.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{d.lineName}</span>
                      <span className="text-muted-foreground"> · {DOWNTIME_REASON_LABEL[d.reason] ?? d.reason}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {d.ongoing ? <StatusBadge status="in_progress" label="Devam ediyor" tone="warning" /> : `${d.minutes} dk`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </DashboardGrid>
    </>
  );
}
