import Link from 'next/link';
import { Wallet, Plus } from 'lucide-react';
import type { GmDashboard } from '@plantero/core/cockpit/kpis';
import { groupConsecutiveActivity } from '@plantero/core/cockpit/kpis';
import type { CockpitTodayItem } from '../queries';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { ExpiryBadge } from '@/components/expiry-badge';
import { LotBadge } from '@/components/lot-badge';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { formatDateTime, relativeTime } from '@/lib/format';
import { ChannelBars } from './channel-bars';
import { Section, RowLink, DashboardGrid, StatStrip, ExpiryBucketStrip, AgingStrip, OverdueTop5List, BreakEvenPanel, TodayRow, ProductionLineRow } from './shared';

export function GmDashboardView({ data, today }: { data: GmDashboard; today: CockpitTodayItem[] }) {
  const { channelSales, bank, lines, criticalStock, expiry, overdue, breakEven, approvals, activity } = data;
  // Ardışık aynı (kullanıcı, özet) audit satırları tek satıra katlanır (Tur 1 P2 kokpit-activity-dupe-01)
  // — 8 özdeş "… giriş yaptı" satırı yerine tek satır + tekrar sayısı.
  const activityGroups = groupConsecutiveActivity(activity);

  return (
    <>
      {/* Mobilde en kritik 4 kart üstte — masaüstünde tek KPI şeridi (Stripe dili, kpi-strip.tsx) */}
      <KpiStripRow>
        <KpiCard title="Bugünkü net ciro" value={channelSales.netTotal} format="money" fractionDigits={0} delta={channelSales.netDeltaPct} deltaLabel="dünden" href="/satis/net-ciro" variant="strip" />
        <KpiCard title="Kritik stok kalemi" value={criticalStock.count} format="int" invertDelta href="/satin-alma/kritik-stok" variant="strip" />
        <KpiCard title="Vadesi geçen alacak" value={overdue.aging.totalOverdue} format="money" fractionDigits={0} invertDelta href="/finans/tahsilat-takibi" variant="strip" />
        <KpiCard title="Break-even ilerleme" value={breakEven.progressPct} format="pct" href="/finans/break-even" variant="strip" />
      </KpiStripRow>

      <DashboardGrid>
        <div className="min-w-0 flex flex-col gap-4">
          <Section title="Günlük kanal satışları" href="/satis/net-ciro">
            {/* Kök neden (Tur 1 P0 kokpit-kpi-clip-01 + P1 kokpit-nested-card-01 + kokpit-numeric-scale-01):
                bu iki değer önceden çerçeveli+gölgeli `variant="card"` (22px değer) olarak basılıyordu —
                zaten çerçeveli Section'ın İÇİNE ikinci bir kutu (kutu içinde kutu) koyuyordu VE sparkline'lı
                kartta 262px'lik dar alanda değer kutusuna 119px kalıp NumberFlow kırpılıyordu. `variant="strip"`
                (KpiStripRow ile) hem çerçevesiz/hairline'lı hem de KPI şeridiyle AYNI 19px tabular-nums
                kademesini kullanır — ekrandaki "büyük sayı" için toplam kademe sayısı 2'ye iner (KPI 19px,
                blok içi StatStrip 15px). Sparkline'ın kendi min-genişlik koruması artık kpi-card.tsx'te
                (container query) — dar hücrede otomatik gizlenir, kırpma bir daha oluşamaz. */}
            <div className="border-b border-border/60 p-2 sm:p-4">
              {/* Kök neden (Tur 2 P2 kokpit-kpi-dupe-01): "Net (bugün)" burada üstteki KPI şeridindeki
                  "Bugünkü net ciro" ile BİREBİR aynı değer+delta çiftini tekrar ediyordu (130px altında,
                  görsel olarak da yakın) — aynı ölçü ekranda iki kez. Yalnızca şeritte YER ALMAYAN "Brüt"
                  burada kalır; net ciro zaten üstteki KPI şeridinde bir kez gösteriliyor. */}
              <KpiStripRow className="mb-0!">
                <KpiCard title="Brüt (bugün)" value={channelSales.grossTotal} format="money" fractionDigits={0} delta={channelSales.grossDeltaPct} deltaLabel="dünden" sparkline={channelSales.trend7d.map((t) => Number(t.net))} variant="strip" />
              </KpiStripRow>
            </div>
            {channelSales.rows.length === 0 ? (
              <EmptyState compact title="Bugün henüz sipariş yok" description="İlk sipariş girildiğinde kanal çubukları burada görünür." />
            ) : (
              <div className="p-4">
                <ChannelBars rows={channelSales.rows.map((r) => ({ name: r.name, net: Number(r.net) }))} />
              </div>
            )}
          </Section>

          <Section title="Break-even'a uzaklık" href="/finans/break-even">
            <BreakEvenPanel breakEven={breakEven} />
          </Section>

          <Section title="Bugün" href="/satis/siparisler">
            {today.length === 0 ? (
              <EmptyState
                compact
                title="Bugün henüz belge yok"
                description="Sevkiyat, iş emri, mal kabul veya fatura oluştuğunda burada görünür."
                action={
                  <Button asChild variant="outline" size="sm" className="h-11 md:h-8">
                    <Link href="/satis/siparisler/yeni"><Plus className="size-3.5" /> Yeni sipariş oluştur</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-border/50">
                {today.map((t) => (
                  <li key={`${t.k}-${t.no}`}>
                    <RowLink href={t.href}>
                      <TodayRow item={t} />
                    </RowLink>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Onay kuyruğu" href="/onaylar">
            {approvals.total === 0 ? (
              <EmptyState compact title="Onay bekleyen öğe yok" />
            ) : (
              <StatStrip
                items={[
                  { key: 'purchase', value: approvals.purchaseDrafts, label: 'AI satın alma', href: '/satin-alma/onay-kuyrugu' },
                  { key: 'recon', value: approvals.reconciliation, label: 'Mutabakat', href: '/muhasebe/mutabakat' },
                  { key: 'count', value: approvals.countVariance, label: 'Sayım farkı', href: '/depo/sayim' },
                  { key: 'dunning', value: approvals.dunning, label: 'Hatırlatma', href: '/finans/tahsilat-takibi' },
                ]}
              />
            )}
          </Section>

          {/* href yok: /ayarlar/audit (Denetim Kaydı) henüz inşa edilmedi (ayarlar modülü kapsamı) —
              var olmayan bir rotaya "Tümü" bağlantısı vermek yerine burada başlıksız bırakılır. */}
          <Section title="Son aktiviteler">
            {activityGroups.length === 0 ? (
              <EmptyState compact title="Henüz aktivite yok" />
            ) : (
              <ul className="divide-y divide-border/50">
                {activityGroups.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-muted-foreground">{a.userName ?? 'Sistem'}</span>
                      {a.summary ? <span> · {a.summary}</span> : <span> · {a.action} · {a.tableName}</span>}
                      {a.count > 1 ? <span className="text-muted-foreground"> · {a.count} kez</span> : null}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground" title={formatDateTime(a.at)}>{relativeTime(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="min-w-0 flex flex-col gap-4">
          <Section title="Banka" href="/muhasebe/banka">
            <div className="flex h-11 items-center justify-between border-b border-border/60 px-4 text-[13px]">
              <span className="text-muted-foreground">Toplam (TRY hesaplar)</span>
              <MoneyCell value={bank.totalTry} className="font-medium" />
            </div>
            {bank.accounts.length === 0 ? (
              <EmptyState compact title="Banka hesabı yok" />
            ) : (
              <ul className="divide-y divide-border/50">
                {bank.accounts.map((a) => (
                  <li key={a.id} className="flex h-11 items-center justify-between gap-3 px-4 text-[13px]">
                    <span className="flex min-w-0 items-center gap-2">
                      <Wallet className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                      <span className="min-w-0 truncate">{a.bankName} · {a.code}</span>
                    </span>
                    <MoneyCell value={a.statementBalance} currency={a.currency} className="shrink-0" />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Üretim hatları" href="/uretim/hatlar">
            <ul className="divide-y divide-border/50">
              {lines.map((l) => (
                <li key={l.lineId}>
                  <ProductionLineRow line={l} href="/uretim/hatlar" />
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Kritik stok" href="/satin-alma/kritik-stok">
            {criticalStock.items.length === 0 ? (
              <EmptyState
                compact
                title="Kritik stok yok"
                description="Kapsama süresi tedarik süresinin altına düşen kalemler burada listelenir."
                action={
                  <Button asChild variant="outline" size="sm" className="h-11 md:h-8">
                    <Link href="/satin-alma/siparisler/yeni"><Plus className="size-3.5" /> Satın alma siparişi oluştur</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-border/50">
                {criticalStock.items.map((it) => (
                  <li key={it.productId}>
                    <RowLink href="/satin-alma/kritik-stok">
                      <span className="min-w-0 flex-1 truncate">{it.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{it.warehouseCode} · {it.leadTimeDays}g tedarik</span>
                      <QtyCell value={it.daysOfCover} uom="gün kapsama" className="shrink-0" />
                    </RowLink>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="SKT riski" href="/depo/skt">
            <ExpiryBucketStrip totals={expiry.totals} />
            {expiry.top5.length === 0 ? (
              <EmptyState compact title="Yaklaşan SKT yok" />
            ) : (
              <ul className="divide-y divide-border/50">
                {expiry.top5.map((r) => (
                  <li key={r.quantId}>
                    {/* Kök neden (Tur 2 P1 kokpit-skt-mobile-card-01): rozet / ürün adı / SKT rozeti üç
                        AYRI `RowLink` çocuğuydu — mobilde (flex-col) 3 satıra düşüp 84.5px'e çıkıyordu
                        (hedef ≤72px). LotBadge + ExpiryBadge artık TEK `sm:contents` grubunda (satır 1,
                        `justify-between`), ürün adı kendi satırında (satır 2) — 2 satırlık anatomi,
                        "Bugün/OverdueTop5List" ile aynı desen. `sm:order-last` masaüstü sırasını
                        DEĞİŞTİRMEZ: rozet, ürün adı, SKT (flatten sonrası doğal DOM sırası zaten böyle). */}
                    <RowLink href={`/depo/lotlar/${r.lotId}`}>
                      <span className="flex min-w-0 items-center justify-between gap-3 sm:contents">
                        <LotBadge lotNo={r.lotNo} status="released" />
                        <ExpiryBadge date={new Date(`${r.expiryDate}T00:00:00Z`)} showDate={false} className="shrink-0 sm:order-last" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{r.productName}</span>
                    </RowLink>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Geciken alacak" href="/finans/tahsilat-takibi">
            <AgingStrip aging={overdue.aging} />
            {overdue.top5.length === 0 ? <EmptyState compact title="Vadesi geçen alacak yok" /> : <OverdueTop5List items={overdue.top5} href="/finans/tahsilat-takibi" />}
          </Section>
        </div>
      </DashboardGrid>
    </>
  );
}
