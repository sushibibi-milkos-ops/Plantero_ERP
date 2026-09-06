import type { SalesCards } from '@plantero/core/cockpit/kpis';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { StatusBadge } from '@/components/status-badge';
import { QtyCell } from '@/components/qty-cell';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { formatDate } from '@/lib/format';
import { ChannelBars } from './channel-bars';
import { Section, DashboardGrid, RowLink, RankBar } from './shared';

const FUNNEL_ORDER = ['lead', 'qualified', 'proposal', 'negotiation'];

/** Satış panosu — huni, bugünkü sipariş sayısı, kanal ciro (bugün), son siparişler, son 30 gün en çok satan 5. */
export function SalesDashboardView({ data }: { data: SalesCards }) {
  const funnel = [...data.funnel].sort((a, b) => FUNNEL_ORDER.indexOf(a.stageCode) - FUNNEL_ORDER.indexOf(b.stageCode)).filter((f) => FUNNEL_ORDER.includes(f.stageCode));
  const maxFunnel = Math.max(...funnel.map((f) => f.count), 1);
  // Kök neden (Tur 3 P2 kokpit-satis-money-dupe-01): brüt indirim/iade olmadığı günlerde net ile
  // BİREBİR aynı sayıya eşitleniyor — o zaman iki ayrı KPI kartı (aynı değer + aynı delta çipi) saf
  // tekrar. Eşitse TEK kart ("brüt = net" başlığında açık); farklıysa ikisi ayrı ayrı kalır.
  const revenueEqual = Number(data.channelToday.grossTotal) === Number(data.channelToday.netTotal);
  // Tek kanal varken "Kanal ciro" bölümü tek çubuklu bir grafikle KPI şeridindeki AYNI toplamı üçüncü
  // kez tekrar ediyordu — kırılım göstermeye değer ≥2 kanal olmadıkça bölüm hiç render edilmez (bilgi
  // zaten KPI şeridinde var).
  const showChannelBreakdown = data.channelToday.rows.length >= 2;

  return (
    <>
      <KpiStripRow>
        <KpiCard title="Bugünkü sipariş" value={data.todayOrders} format="int" href="/satis/siparisler" variant="strip" />
        {revenueEqual ? (
          <KpiCard title="Bugünkü ciro (brüt = net)" value={data.channelToday.netTotal} format="money" fractionDigits={0} delta={data.channelToday.netDeltaPct} deltaLabel="dünden" href="/satis/net-ciro" variant="strip" />
        ) : (
          <>
            <KpiCard title="Bugünkü brüt ciro" value={data.channelToday.grossTotal} format="money" fractionDigits={0} delta={data.channelToday.grossDeltaPct} deltaLabel="dünden" href="/satis/net-ciro" variant="strip" />
            <KpiCard title="Bugünkü net ciro" value={data.channelToday.netTotal} format="money" fractionDigits={0} delta={data.channelToday.netDeltaPct} deltaLabel="dünden" href="/satis/net-ciro" variant="strip" />
          </>
        )}
        <KpiCard title="Açık fırsat" value={funnel.reduce((a, f) => a + f.count, 0)} format="int" href="/satis/firsatlar" variant="strip" />
      </KpiStripRow>

      <DashboardGrid>
        <div className="min-w-0 flex flex-col gap-4">
          {data.channelToday.rows.length === 0 ? (
            <Section title="Kanal ciro (bugün)" href="/satis/net-ciro">
              <EmptyState compact title="Bugün henüz sipariş yok" />
            </Section>
          ) : showChannelBreakdown ? (
            <Section title="Kanal ciro (bugün)" href="/satis/net-ciro">
              <div className="p-4"><ChannelBars rows={data.channelToday.rows.map((r) => ({ name: r.name, net: Number(r.net) }))} /></div>
            </Section>
          ) : null}

          <Section title="Satış hunisi" href="/satis/firsatlar">
            {funnel.every((f) => f.count === 0) ? (
              <EmptyState compact title="Açık fırsat yok" />
            ) : (
              <ul className="space-y-2.5 p-4">
                {funnel.map((f) => (
                  <li key={f.stageCode} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">{f.stageName}</span>
                    <RankBar pct={(f.count / maxFunnel) * 100} />
                    <span className="w-6 shrink-0 text-right text-xs tabular-nums">{f.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

        </div>

        {/* Kök neden (Tur 2 P1 kokpit-satis-col-balance-01): "Son siparişler" sol kolonda üçüncü bölüm
            olunca sol kolon (800px) sağ kolonun (270px) neredeyse 3 katına çıkıyordu. "En çok satan 5"
            artık tek başına ızgaranın 2. kolonu (fark ~20px); "Son siparişler" ise ızgaranın ALTINDA
            `lg:col-span-2` ile tam genişlik bir şerit — bu, bölümü hem dengeden bağımsız kılar hem de
            kokpit-satis-order-trunc-01'in ihtiyaç duyduğu genişliği (1152px) verir. */}
        <Section title="En çok satan 5 (son 30 gün)" href="/satis/net-ciro" className="lg:self-start">
          {data.top5Products.length === 0 ? (
            <EmptyState compact title="Son 30 günde satış yok" />
          ) : (
            <ul className="divide-y divide-border/50">
              {data.top5Products.map((p, i) => (
                <li key={p.productId}>
                  {/* Kök neden (Tur 1 P1 kokpit-top5-mobile-01 + P2 kokpit-top5-consistency-01): bu liste
                      sabit `h-11` + tek satır + tıklanamaz `li` idi — kokpitteki TEK etkileşimsiz/tek-
                      satırlı liste. 390px'te sıra+ad+miktar+tutar tek satıra sıkışınca ad 145.9px'e
                      düşüp kırpılıyordu. Artık diğer tüm listelerle aynı `RowLink` deseni: mobilde 2
                      satıra kırılır (ad tam görünür), masaüstünde `sm:contents` ile tek satıra döner. */}
                  <RowLink href={`/ana-veri/urunler/${p.productId}`}>
                    <span className="flex min-w-0 items-center gap-2 sm:contents">
                      <span className="w-4 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center justify-between gap-3 sm:contents">
                      <QtyCell value={p.qty} uom={p.uomCode} />
                      <MoneyCell value={p.revenue} />
                    </span>
                  </RowLink>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Kök neden (Tur 2 P1 kokpit-satis-order-trunc-01): 568px'lik dar kolonda sabit tarih/belge-no
            sütunları partner kutusuna yalnızca ~100-146px bırakıyordu, 10 satırın 8'inde "· kanal" eki
            hiç görünmüyordu. `lg:col-span-2` bölümü tam genişliğe (1152px) yayar — aynı sabit sütunlar
            partner kutusuna ~700px bırakır. Tarih/belge-no sütunları da biraz daraltıldı
            (sm:w-24→20, sm:w-32→28) — kalan pay partnere. */}
        <Section title="Son siparişler" href="/satis/siparisler" className="lg:col-span-2">
          {data.recentOrders.length === 0 ? (
            <EmptyState compact title="Son 14 günde sipariş yok" />
          ) : (
            <ul className="divide-y divide-border/50">
              {data.recentOrders.map((o) => (
                <li key={o.id}>
                  {/* Kök neden (Tur 3 P1 kokpit-numcol-ragged-03): `sm:contents` masaüstünde tarih, no,
                      partner, tutar, rozeti TEK satıra düzleştiriyordu — rozet tutardan SONRA
                      (`order-last`) geldiği için tutarın sağ kenarı rozet uzunluğuna göre ("Taslak" 60px
                      vs "Sipariş onaylı" 110px) 36px'e kadar kayıyordu. Diğer satırlarla (TodayRow,
                      Son iş emirleri) AYNI kök-neden düzeltmesi: satır HER ZAMAN 2 satır — rozet artık
                      satır 1'de (tarih+no ile, ondan sonra hizalanacak başka öğe yok), tutar satır 2'de
                      partnerle YALNIZ (sağ kenarı her zaman satırın sağ kenarı, ±0px). */}
                  <RowLink href={`/satis/siparisler/${o.id}`} className="sm:h-auto sm:flex-col sm:items-stretch sm:gap-0.5 sm:py-2">
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-xs text-muted-foreground sm:w-20">{formatDate(new Date(`${o.orderDate}T00:00:00Z`))}</span>
                        <span className="truncate font-mono text-xs sm:w-28 sm:shrink-0">{o.docNo}</span>
                      </span>
                      <span className="shrink-0"><StatusBadge status={o.status} kind="sales_order" /></span>
                    </div>
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate">{o.partnerName} <span className="text-muted-foreground">· {o.channelName}</span></span>
                      <MoneyCell value={o.netRevenue} className="shrink-0" />
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
