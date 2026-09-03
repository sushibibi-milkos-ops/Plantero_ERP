import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { getNetRevenueReport } from '@/modules/sales/queries';
import { resolveRange, PERIOD_LABELS, type PeriodKey } from '@/modules/sales/period';
import { NetRevenueChart } from '@/modules/sales/components/net-revenue-chart';
import { NetRevenueDateRange } from '@/modules/sales/components/net-revenue-date-range';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { MoneyCell } from '@/components/money-cell';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Net Ciro' };
export const dynamic = 'force-dynamic';

const PRESETS: PeriodKey[] = ['bugun', '7g', '30g', 'ay'];

/** formatPct gereksiz sıfırları atar (%100 vs %77,4) — bu sütunda karışık hassasiyet yerine her
 *  zaman 1 ondalık basılır ki sağa hizalı ondalık ayracı tüm satırlarda aynı x'e düşsün. */
function formatPctFixed(v: number): string {
  return `%${v.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}

export default async function NetRevenuePage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  await requirePermission('sales.view');
  const sp = await searchParams;
  const { from, to, period } = resolveRange(sp.period, sp.from, sp.to);
  const report = await getNetRevenueReport(from, to);
  const { current, deltas, breakdown, series, channelCodes } = report;

  return (
    <>
      <PageHeader
        title="Net Ciro"
        description={`${from} → ${to} · kanal komisyonu, kargo ve diğer kesintiler düşülmüş satış geliri`}
      >
        {/* Tur 10 P1 satis-net-ciro-03: h-8 (32px) 44px eşiğinin altındaydı; bu 5 kontrol sayfanın
            TEK filtresi. Masaüstünde eski yoğun h-8 korunur. */}
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <Link
              key={p}
              href={`/satis/net-ciro?period=${p}`}
              className={cn(
                'inline-flex h-11 items-center rounded-md px-3 text-[13px] font-medium md:h-8',
                period === p ? 'bg-primary text-primary-foreground' : 'border border-border/70 bg-background hover:bg-accent',
              )}
            >
              {PERIOD_LABELS[p]}
            </Link>
          ))}
          <NetRevenueDateRange from={from} to={to} active={period === 'custom'} />
        </div>
      </PageHeader>

      {/* Stripe tarzı KPI şeridi (KpiStripRow + variant="strip") — /depo/stok ile aynı dil; kutulu
          kart + dekoratif ikon (Banknote/Percent/Truck…) kaldırıldı (Tur 3 bulgusu: bu sayfa,
          aynı üründeki başka bir finans ekranıyla iki farklı KPI anatomisi konuşuyordu). */}
      <KpiStripRow>
        <KpiCard variant="strip" title="Brüt ciro" value={current.grossRevenue} format="money" delta={deltas.gross ?? undefined} />
        <KpiCard variant="strip" title="Komisyon" value={current.commission} format="money" delta={deltas.commission ?? undefined} invertDelta />
        <KpiCard variant="strip" title="Kargo kesintisi" value={current.shipping} format="money" delta={deltas.shipping ?? undefined} invertDelta />
        {/* Vurgu artık çerçeve değil, değerin kendisinde — kardeşleriyle aynı anatomi, tek görsel sinyal (renkli rakam).
            Tur 10 P1 satis-net-ciro-02: sayfanın başlık metriği mobil şeritte 4. sıradaydı (sol kenar
            496px, 390px viewport'un 106px dışında) — ilk boyada hiç görünmüyordu. `order-first`
            mobilde (kaydıran şeritte) ilk karta taşır; `md:order-none` masaüstünde mantıksal/DOM
            sırasını (Brüt→Komisyon→Kargo→Net→Sipariş→Sepet) geri yükler. */}
        <KpiCard variant="strip" title="Net ciro" value={current.netRevenue} format="money" delta={deltas.net ?? undefined} className="order-first [&_.tabular-nums]:text-primary md:order-none" />
        <KpiCard variant="strip" title="Sipariş" value={current.orderCount} format="int" delta={deltas.orderCount ?? undefined} />
        <KpiCard variant="strip" title="Ortalama sepet" value={current.avgBasket} format="money" delta={deltas.avgBasket ?? undefined} />
      </KpiStripRow>

      <div className="mt-4 rounded-xl border border-border/70 bg-card p-4">
        <h2 className="mb-3 text-[13px] font-semibold">Günlük net ciro (kanal bazlı)</h2>
        {series.length && channelCodes.length ? (
          <NetRevenueChart series={series} channels={channelCodes} />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">Bu dönemde onaylı sipariş bulunmuyor.</p>
        )}
      </div>

      {/* Tur 10 P1 satis-net-ciro-01: modüldeki TEK ham <table> DataTable değildi, mobilde kart
          görünümüne hiç düşmüyordu — 952px'lik tablo 358px'lik kaba yatay kaydırmayla sığdırılıyordu
          ve raporun varlık sebebi 'Net'/'Net marj %' sütunları ilk ekranda hiç görünmüyordu. Diğer
          5 satış tablosunun hepsi DataTable'ın mobil kart kalıbına düşüyor — burada da aynı iki
          katmanlı anatomi (başlık + metrik / meta satırı) elle kurulur: masaüstü ham tablo değişmez,
          taşan sütun sayısı ve serbest biçimli hücreler DataTable'ın sütun modeline uymadığından. */}
      <div className="mt-4 space-y-2 md:hidden">
        {breakdown.length === 0 ? (
          <div className="rounded-xl border border-border/70 bg-card py-10 text-center text-sm text-muted-foreground">Kayıt yok</div>
        ) : (
          breakdown.map((r) => (
            <div key={r.channelId} className="rounded-lg border border-border/70 bg-card p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-medium">{r.channelName}</span>
                <MoneyCell value={r.net} digits={0} className="shrink-0 text-[13px] font-medium text-foreground" />
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Brüt <MoneyCell value={r.gross} digits={0} className="inline text-muted-foreground" /></span>
                <span className="num tabular-nums">Net marj {formatPctFixed(r.netMarginPct)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* scroll-fade-x: masaüstünde kaydırılabilir olduğuna dair görsel ipucu (Tur 3 bulgusu) —
          DataTable'ın kendi masaüstü tablosuyla aynı utility. Mobilde artık yukarıdaki kart listesi
          devreye girdiğinden ham tablo `md:block` ile sınırlanır. */}
      <div className="mt-4 hidden scrollbar-thin scroll-fade-x overflow-x-auto rounded-xl border border-border/70 bg-card md:block">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-[12px] text-muted-foreground">
              {/* Tur 10 P2 satis-net-ciro-05: CSS tablo arka plan boyama sırası hücre bg'sini satır
                  bg'sinin ÜZERİNE bindirir — sticky th kendi `bg-muted/40`'ını satırın `bg-muted/40`'ı
                  üzerine ikinci kez uygulayınca alfa iki katına çıkıp başlık şeridi iki tonlu görünüyordu
                  (sticky hücre RGB 248 vs satırın geri kalanı RGB 251). Tek opak katman — satırdaki TEK
                  bg-muted/40 katmanıyla aynı görsel sonucu verir, ayrıca sticky'nin altından kayan
                  içeriği de opak biçimde gizler. */}
              <th className="sticky left-0 z-10 h-9 bg-[color-mix(in_oklch,var(--muted)_40%,var(--card))] px-3 text-left font-medium">Kanal</th>
              <th className="h-9 px-3 text-right font-medium">Brüt</th>
              <th className="h-9 px-3 text-right font-medium">Komisyon</th>
              <th className="h-9 px-3 text-right font-medium">Kargo</th>
              <th className="h-9 px-3 text-right font-medium">Diğer</th>
              <th className="h-9 px-3 text-right font-medium">Net</th>
              <th className="h-9 px-3 text-right font-medium">Net marj %</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.length === 0 ? (
              <tr>
                <td colSpan={7} className="h-16 text-center text-sm text-muted-foreground">Kayıt yok</td>
              </tr>
            ) : (
              breakdown.map((r) => (
                <tr key={r.channelId} className="group h-9 border-b border-border/50 last:border-0 hover:bg-accent/40">
                  {/* Tur 11 P2 satis-net-ciro-06 (kök neden): `tr`nin `hover:bg-accent/40` globals.css'teki
                      `@custom-variant hover` (hover:hover) and (pointer:fine)'a kilitli, ama sabitlenmiş bu
                      hücrenin `group-hover:bg-accent/40`'ı Tailwind'in ÇIPLAK `group-hover` varyantı — o
                      kapıdan geçmez. Dokunmatik ≥768px cihazda (iPad) bir dokunuş `:hover`'ı "takılı"
                      bırakabilir: `tr` gated olduğu için vurgusuz kalır ama bu hücre kapısız olduğundan
                      vurgulu takılı kalırdı (yarım vurgulu satır). `row-actions.tsx`'teki AYNI kaçış kalıbı:
                      group-hover kuralından SONRA `[@media(hover:none)]:bg-card` ile geri alınır. */}
                  <td className="sticky left-0 z-10 bg-card px-3 font-medium group-hover:bg-accent/40 [@media(hover:none)]:bg-card">{r.channelName}</td>
                  {/* text-right eklendi — <th> sağa yaslıyken <td> sola yaslı çiziliyordu, ondalık
                      ayraçları sütun genelinde hizasızdı (Tur 3 P0). Ayrıca 0 ondalık: üstteki KPI
                      şeridiyle aynı hassasiyet (Tur 3 bulgusu: KPI ₺98.193, tablo ₺22.222,87 karışık). */}
                  <td className="px-3 text-right"><MoneyCell value={r.gross} digits={0} /></td>
                  {/* `muted` kaldırıldı: MoneyCell zaten gerçek sıfırı kendi başına soluklaştırıyor —
                      koşulsuz `muted` sıfır OLMAYAN komisyon/kargo/diğer tutarlarını da aynı soluklukta
                      basıp ₺0,00'dan ayırt edilemez kılıyordu (Tur 3 P1: bu sayfanın varlık sebebi). */}
                  <td className="px-3 text-right"><MoneyCell value={r.commission} digits={0} /></td>
                  <td className="px-3 text-right"><MoneyCell value={r.shipping} digits={0} /></td>
                  <td className="px-3 text-right"><MoneyCell value={r.other} digits={0} /></td>
                  <td className="px-3 text-right"><MoneyCell value={r.net} digits={0} className="font-medium text-foreground" /></td>
                  {/* Her zaman 1 ondalık (%100,0) — karışık hassasiyet (%77,4 / %100) sağa hizalı
                      sütunda ondalık ayracını hizasızlaştırıyordu. pr-4: diğer sütunlarla eşit iç boşluk. */}
                  <td className="num px-3 pr-4 text-right text-muted-foreground">{formatPctFixed(r.netMarginPct)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
