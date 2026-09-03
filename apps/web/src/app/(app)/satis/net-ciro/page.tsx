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
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <Link
              key={p}
              href={`/satis/net-ciro?period=${p}`}
              className={cn(
                'inline-flex h-8 items-center rounded-md px-3 text-[13px] font-medium',
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
        {/* Vurgu artık çerçeve değil, değerin kendisinde — kardeşleriyle aynı anatomi, tek görsel sinyal (renkli rakam). */}
        <KpiCard variant="strip" title="Net ciro" value={current.netRevenue} format="money" delta={deltas.net ?? undefined} className="[&_.tabular-nums]:text-primary" />
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

      {/* scroll-fade-x: mobilde (kanal kırılımı yatay kayan ham tablo kalır) kaydırılabilir olduğuna
          dair görsel ipucu yoktu (Tur 3 bulgusu) — DataTable'ın kendi masaüstü tablosuyla aynı utility. */}
      <div className="mt-4 scrollbar-thin scroll-fade-x overflow-x-auto rounded-xl border border-border/70 bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-[12px] text-muted-foreground">
              <th className="sticky left-0 z-10 h-9 bg-muted/40 px-3 text-left font-medium">Kanal</th>
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
                  <td className="sticky left-0 z-10 bg-card px-3 font-medium group-hover:bg-accent/40">{r.channelName}</td>
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
