import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { relativeTime } from '@/lib/format';
import { getForecastPage } from '@/modules/finance/forecast-queries';
import { ensureInitialForecasts } from '@/modules/finance/forecast-bootstrap';
import { ForecastPanels } from '@/modules/finance/components/forecast-panel';

export const metadata: Metadata = { title: 'Tahmin' };
export const dynamic = 'force-dynamic';

export default async function ForecastPage() {
  await requirePermission('finance.view');
  let data = await getForecastPage();

  // Kriter 3 kök neden düzeltmesi (Tur 3, P1 finans-tahmin-05): `forecasts` tablosu hiç kimse
  // "Yeniden üret"e basmadan boş kalıyordu — ilk açılışta boşsa bir kez tohum tahmin üretilip
  // kalıcılaştırılır (bkz. forecast-bootstrap.ts başlık yorumu); ikinci yüklemede artık boş
  // olmadığından bu dal hiç çalışmaz (idempotent).
  if (data.salesForecast.length === 0) {
    await ensureInitialForecasts();
    data = await getForecastPage();
  }

  // Kriter 3 kök neden düzeltmesi (Tur 2, P1): sayfada hiçbir KPI şeridi yoktu, ilk ekranda okunabilir
  // tek bir sayı bulunmuyordu (1440x900'de yalnızca eksen tick'leri) — diğer tüm finans rotaları ≥4
  // KPI ile açılıyor. Sunucu tarafında mevcut veriden 4 KPI türetilir.
  const salesTotal6mo = data.salesForecast.reduce((acc, f) => acc + Number(f.predicted), 0);
  const bandRows = data.salesForecast.filter((f) => f.low !== null && f.high !== null);
  const avgBandPct = bandRows.length
    ? bandRows.reduce((acc, f) => acc + (Number(f.high) - Number(f.low!)) / (Number(f.predicted) || 1) * 100, 0) / bandRows.length
    : null;
  const lastGenerated = [...data.salesForecast, ...data.cashForecast].sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())[0]?.generatedAt ?? null;
  const aiCount = data.salesForecast.filter((f) => f.method === 'ai').length;

  return (
    <>
      <PageHeader title="AI Satış / Nakit Tahmini" description="Son 12 ay + gelecek 6 ay tahmin (AI, yoksa mevsimsel hareketli ortalama fallback)" />

      <KpiStripRow>
        <KpiCard variant="strip" title="Tahmini 6 ay toplam ciro" value={data.salesForecast.length ? salesTotal6mo.toFixed(2) : null} format="money" hint={lastGenerated ? `son üretim ${relativeTime(lastGenerated)}` : 'henüz üretilmedi'} />
        <KpiCard variant="strip" title="Ortalama bant genişliği" value={avgBandPct === null ? null : avgBandPct.toFixed(2)} format="pct" />
        <KpiCard variant="strip" title="Tahmin noktası (satış)" value={data.salesForecast.length} format="int" hint={`${aiCount} AI, ${data.salesForecast.length - aiCount} mevsimsel`} />
        <KpiCard variant="strip" title="Kanal tahmini kalemi" value={data.channelForecast.length} format="int" />
      </KpiStripRow>

      <ForecastPanels data={data} />
    </>
  );
}
