import type { WarehouseCards } from '@plantero/core/cockpit/kpis';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { LotBadge } from '@/components/lot-badge';
import { ExpiryBadge } from '@/components/expiry-badge';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { formatMoney } from '@/lib/format';
import type { CockpitTodayItem } from '../queries';
import { Section, RowLink, ExpiryBucketStrip, TodayRow } from './shared';

/** Depo rolü panosu — büyük dokunma hedefleri (KpiCard strip zaten 72/80px), tek amaca odaklı sayaçlar.
 *  Kök neden (Tur 1 P1 kokpit-depo-density-01): önceden "Karantina değeri" tek bir sayı için 110px'lik
 *  bir kart harcıyordu ve "SKT riski" GM'nin aksine alt lot listesiz kalıyordu — ilk ekranın %20'si boş,
 *  toplam 6 satır. Artık ikisi de GM'deki gibi kova/özet ŞERİDİ + en değerli/en yakın 5 LOT LİSTESİ. */
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
        <Section title="Karantina" href="/depo/lotlar">
          <div className="flex h-11 items-center justify-between border-b border-border/60 px-4 text-[13px]">
            <span className="text-muted-foreground">{data.quarantine.count} lot bekliyor</span>
            <span className="num font-medium tabular-nums">{formatMoney(data.quarantine.value, 'TRY', { digits: 0 })}</span>
          </div>
          {data.quarantine.top5.length === 0 ? (
            <EmptyState compact title="Karantinada lot yok" />
          ) : (
            <ul className="divide-y divide-border/50">
              {data.quarantine.top5.map((r) => (
                <li key={r.quantId}>
                  {/* Kök neden (Tur 2 P1 kokpit-depo-mobile-card-02): önceki 3-grup yapı (rozet / ürün
                      adı / konum+tutar) mobilde (flex-col) yine 3 AYRI satıra düşüp 83-84px'e çıkıyordu
                      — `sm:contents` yalnızca konum+tutar İKİLİSİNİ tek satıra topluyordu, rozeti değil.
                      Artık rozet + konum+tutar TEK satır 1 grubunda (`justify-between`), ürün adı satır
                      2'de kendi başına — 2 satırlık anatomi (hedef ≤72px). `sm:order-3/4` masaüstü
                      sırasını (rozet, ürün adı, konum, tutar) KORUR: flatten sonrası doğal DOM sırası
                      rozet→konum→tutar→ürünadı olurdu, order ile ürün adı öne (2) alınır. */}
                  <RowLink href={`/depo/lotlar/${r.lotId}`}>
                    <span className="flex min-w-0 items-center justify-between gap-3 sm:contents">
                      <LotBadge lotNo={r.lotNo} status="quarantine" />
                      <span className="flex shrink-0 items-center gap-3 sm:contents">
                        <span className="text-xs text-muted-foreground sm:order-3">{r.locationCode}</span>
                        <MoneyCell value={r.value} className="sm:order-4" />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1 truncate sm:order-2">{r.productName}</span>
                  </RowLink>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="SKT riski" href="/depo/skt">
          <ExpiryBucketStrip totals={data.expiry.totals} />
          {data.expiry.top5.length === 0 ? (
            <EmptyState compact title="Yaklaşan SKT yok" />
          ) : (
            <ul className="divide-y divide-border/50">
              {data.expiry.top5.map((r) => (
                <li key={r.quantId}>
                  {/* Kök neden (Tur 2 P1 kokpit-depo-mobile-card-02, GM ile aynı — shared.tsx yorumuna
                      bkz.): rozet + SKT rozeti tek satır 1 grubunda, ürün adı satır 2 — 2 satırlık
                      anatomi (hedef ≤72px). */}
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

        <Section title="Bugün" href="/depo/mal-kabul" className="lg:col-span-2">
          {today.length === 0 ? (
            <EmptyState compact title="Bugün henüz mal kabul/sevkiyat yok" />
          ) : (
            <ul className="divide-y divide-border/50">
              {today.map((t) => (
                <li key={`${t.k}-${t.no}`}>
                  {/* Kök neden (Tur 2 P1 kokpit-depo-row-void-02): Tur 1'in `sm:max-w-3xl` düzeltmesi
                      satır İÇİ boşluğu kapatırken (kokpit-depo-row-void-01) satırı 768px'te sınırlayıp
                      1152px'lik bölümün SAĞINDA 352-368px'lik yeni bir ölü alan açmıştı — aynı boşluk,
                      yalnızca satırın dışına taşınmıştı. `sm:max-w-3xl` kaldırıldı: satır artık `TodayRow`
                      deseninin kendi mantığıyla (partner `flex-1`) tam genişliğe yayılıyor, tutar/rozet
                      `justify-between`+`sm:order-last` ile satırın (=bölümün) GERÇEK sağ kenarına
                      hizalanıyor — satır sonunda kullanılmayan kolon kalmıyor. */}
                  <RowLink href={t.href}>
                    <TodayRow item={t} />
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
