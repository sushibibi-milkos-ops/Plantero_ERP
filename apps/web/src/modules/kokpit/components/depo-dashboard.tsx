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
                  {/* 390px'te 4 ayrı satır yerine 3: rozet / ürün adı / konum+tutar (aynı satır) —
                      konum+tutar tek `sm:contents` grubuna alındı, masaüstü sırası DEĞİŞMEDİ. */}
                  <RowLink href={`/depo/lotlar/${r.lotId}`}>
                    <span className="flex min-w-0 items-center gap-2 sm:contents">
                      <LotBadge lotNo={r.lotNo} status="quarantine" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{r.productName}</span>
                    <span className="flex shrink-0 items-center justify-between gap-3 sm:contents">
                      <span className="text-xs text-muted-foreground">{r.locationCode}</span>
                      <MoneyCell value={r.value} />
                    </span>
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
                  <RowLink href={`/depo/lotlar/${r.lotId}`}>
                    <span className="flex min-w-0 items-center gap-2 sm:contents">
                      <LotBadge lotNo={r.lotNo} status="released" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{r.productName}</span>
                    <ExpiryBadge date={new Date(`${r.expiryDate}T00:00:00Z`)} showDate={false} className="shrink-0" />
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
                  {/* Kök neden (Tur 1 P1 kokpit-depo-row-void-01): satır Section ile birlikte
                      lg:col-span-2 (1152px) genişliğe yayılıyordu ama `flex-1` alan partner metni yine
                      kısa kalıp sağdaki tutarla arasında ~930px "ölü alan" bırakıyordu. `sm:max-w-3xl`
                      satırın toplam genişliğini 768px'te sınırlar — en büyük boşluk hedefin (≤240px)
                      altına iner; geniş bölümün geri kalanı satırın SAĞINDA (satır içinde değil) boş kalır,
                      bu normal bir liste sonrası boşluktur, satır İÇİ bir kopukluk değildir. */}
                  <RowLink href={t.href} className="sm:max-w-3xl">
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
