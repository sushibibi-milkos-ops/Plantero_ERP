import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth';
import { listVatPeriods, getVatCarryforwardSeries, listComputableVatPeriods } from '@/modules/accounting/queries';
import { VatCarryforwardChart } from '@/modules/accounting/components/vat-carryforward-chart';
import { CloseVatPeriodButton } from '@/modules/accounting/components/close-vat-period-button';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { MoneyCell } from '@/components/money-cell';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'KDV' };
export const dynamic = 'force-dynamic';

export default async function VatPage() {
  const user = await requirePermission('accounting.view');
  const [periods, series, computable] = await Promise.all([listVatPeriods(), getVatCarryforwardSeries(), listComputableVatPeriods()]);
  const latest = periods[0];
  // Kök neden (tur 2 P0 muhasebe-kdv-01): tek nokta + o nokta sıfır olsa bile tam eksen takımıyla
  // (₺0-₺4 anlamsız çentikler) çiziliyordu — kod yalnızca `series.length` doğruluğunu kontrol
  // ediyordu. Karşılaştırılacak en az 2 dönem VE en az bir sıfır olmayan değer olmadan grafiğin
  // taşıdığı bilgi yoktur.
  const hasChartableSeries = series.length >= 2 && series.some((s) => Number(s.carriedToNext) !== 0);

  return (
    <>
      <PageHeader
        title="KDV"
        description="Satış %1 (gıda) · alış %20 ağırlıklı — asimetri devreden KDV birikimine yol açar"
        actions={userCan(user, 'accounting.post') ? <CloseVatPeriodButton computablePeriods={computable} /> : undefined}
      />

      {latest ? (
        <KpiStripRow>
          {/* fractionDigits={2} (tur 2 P1 muhasebe-kdv-04): önceden 0 ondalıklıydı ('₺443') — hemen
              altındaki tabloda aynı değer 2 ondalıklı basılıyordu ('₺442,56'), küçük tutarlarda
              yuvarlama gözle görülür bir tutarsızlık üretiyordu. */}
          <KpiCard variant="strip" title="Hesaplanan (391)" value={latest.outputVat} format="money" fractionDigits={2} />
          <KpiCard variant="strip" title="İndirilecek (191)" value={latest.inputVat} format="money" fractionDigits={2} />
          <KpiCard variant="strip" title="Devreden" value={latest.carriedToNext} format="money" fractionDigits={2} />
          <KpiCard variant="strip" title="Ödenecek (360)" value={latest.payable} format="money" fractionDigits={2} />
        </KpiStripRow>
      ) : null}

      {/* Kutu yalnızca karşılaştırılabilir bir seri VARKEN çizilir (kritik bulgu, kriter 3): önceden
          seri <2 dönemken de 330px (mobilde 490px) boş-durum kutusu hep basılıyordu — 390px'te
          telefonun İLK ekranı tamamen "veri yok" mesajına ayrılıyor, tek dönem satırı katlamanın
          altında kalıyordu. Grafiğin karşılığı olan eylem zaten PageHeader'da ("Dönemi hesapla") —
          burada tekrar bir boş-durum kutusu açmaya gerek yok; dönem tablosu doğrudan yukarı çıkar. */}
      {hasChartableSeries ? (
        <div className="mb-6 rounded-lg border border-border/60 p-4">
          <div className="mb-2 text-[13px] font-medium text-muted-foreground">Devreden KDV birikimi</div>
          <VatCarryforwardChart series={series} />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border/60">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40 text-left text-[12px] text-muted-foreground">
                <th className="px-3 py-2 font-medium">Dönem</th>
                <th className="px-3 py-2 text-right font-medium">Hesaplanan</th>
                <th className="px-3 py-2 text-right font-medium">İndirilecek</th>
                <th className="px-3 py-2 text-right font-medium">Devreden (önceki)</th>
                <th className="px-3 py-2 text-right font-medium">Ödenecek</th>
                <th className="px-3 py-2 text-right font-medium">Devreden (sonraki)</th>
                <th className="px-3 py-2 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {/* hover:bg-muted/40 (kritik bulgu, kriter 8): mizan/hesap planı tablolarıyla aynı satır
                  geri bildirimi kalıbı — önceden bu tablo hiç hover almıyordu. */}
              {periods.map((p) => (
                <tr key={p.id} className="border-b border-border/40 last:border-0 hover:bg-muted/40">
                  <td className="px-3 py-2 font-mono">{p.period}</td>
                  <td className="px-3 py-2 text-right"><MoneyCell value={p.outputVat} /></td>
                  <td className="px-3 py-2 text-right"><MoneyCell value={p.inputVat} /></td>
                  <td className="px-3 py-2 text-right"><MoneyCell value={p.carriedFromPrev} muted={Number(p.carriedFromPrev) === 0} /></td>
                  <td className="px-3 py-2 text-right"><MoneyCell value={p.payable} muted={Number(p.payable) === 0} /></td>
                  <td className="px-3 py-2 text-right"><MoneyCell value={p.carriedToNext} muted={Number(p.carriedToNext) === 0} /></td>
                  <td className="px-3 py-2"><StatusBadge status={p.status} kind="vat_period" /></td>
                </tr>
              ))}
              {!periods.length ? (
                // EmptyState + eylem (kritik bulgu muhasebe-kdv-07 — kök neden): önceden ikonsuz/
                // eylemsiz düz metin basılıyordu; modülün diğer boş durumları (mobil kart listesi,
                // "Faturaya tahsis" kartı) ortak EmptyState (ikon + başlık + açıklama) kullanıyor.
                // Eylem PageHeader'daki "Dönemi hesapla" düğmesiyle AYNI bileşen (CloseVatPeriodButton) —
                // yeni bir eylem icat edilmedi, boş durumdaki kullanıcıya en yakın yerde tekrarlanır.
                <tr>
                  <td colSpan={7} className="p-0">
                    <EmptyState
                      compact
                      title="Henüz hesaplanmış KDV dönemi yok"
                      description="İlk dönemi hesaplamak için aşağıdaki eylemi kullanın."
                      action={userCan(user, 'accounting.post') && computable.length ? <CloseVatPeriodButton computablePeriods={computable} /> : undefined}
                    />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Mobil kart listesi (tur 2 P0 muhasebe-kdv-02 kök nedeni): 7 sütunlu tablo hiçbir mobil
            kalıba sahip değildi — 390px'te yatay kaydırıcı zorunluydu, "Ödenecek"/"Devreden (sonraki)"/
            "Durum" tamamen ekran dışında kalıyordu. trial-balance-view.tsx ile aynı desen. */}
        <div className="divide-y divide-border/40 md:hidden">
          {periods.map((p) => (
            <div key={p.id} className="space-y-1.5 px-3 py-2.5 text-[13px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-medium">{p.period}</span>
                <StatusBadge status={p.status} kind="vat_period" />
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                <div className="flex justify-between gap-2"><dt>Hesaplanan</dt><dd className="text-foreground"><MoneyCell value={p.outputVat} className="text-[12px]" /></dd></div>
                <div className="flex justify-between gap-2"><dt>İndirilecek</dt><dd className="text-foreground"><MoneyCell value={p.inputVat} className="text-[12px]" /></dd></div>
                <div className="flex justify-between gap-2"><dt>Devreden (önceki)</dt><dd className="text-foreground"><MoneyCell value={p.carriedFromPrev} muted={Number(p.carriedFromPrev) === 0} className="text-[12px]" /></dd></div>
                <div className="flex justify-between gap-2"><dt>Ödenecek</dt><dd className="text-foreground"><MoneyCell value={p.payable} muted={Number(p.payable) === 0} className="text-[12px]" /></dd></div>
                <div className="col-span-2 flex justify-between gap-2 border-t border-border/40 pt-1"><dt>Devreden (sonraki)</dt><dd className="text-foreground"><MoneyCell value={p.carriedToNext} muted={Number(p.carriedToNext) === 0} className="text-[12px]" /></dd></div>
              </dl>
            </div>
          ))}
          {!periods.length ? (
            <EmptyState
              compact
              title="Henüz hesaplanmış KDV dönemi yok"
              description="İlk dönemi hesaplamak için aşağıdaki eylemi kullanın."
              action={userCan(user, 'accounting.post') && computable.length ? <CloseVatPeriodButton computablePeriods={computable} /> : undefined}
            />
          ) : null}
        </div>
      </div>
      {latest?.declaredAt ? <p className="mt-2 text-[12px] text-muted-foreground">Son hesaplama: {formatDate(latest.declaredAt)}</p> : null}
    </>
  );
}
