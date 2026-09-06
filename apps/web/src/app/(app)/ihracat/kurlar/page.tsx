import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth';
import { listRecentRates, getLatestRates } from '@/modules/export/queries';
import { RateChart } from '@/modules/export/components/rate-chart';
import { RatesTable } from '@/modules/export/components/rates-table';
import { FetchRatesButton } from '@/modules/export/components/fetch-rates-button';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { EmptyState } from '@/components/empty-state';
import { formatDate, formatRate } from '@/lib/format';

export const metadata: Metadata = { title: 'İhracat Kurları' };
export const dynamic = 'force-dynamic';

const CURRENCY_ORDER = ['USD', 'EUR', 'GBP'];

export default async function ExportRatesPage() {
  const user = await requirePermission('export.view');
  const [rows, latest] = await Promise.all([listRecentRates(90), getLatestRates()]);
  const latestByCurrency = new Map(latest.map((r) => [r.currency, r]));
  const latestDate = latest[0]?.rateDate ?? null;

  return (
    <>
      <PageHeader
        title="İhracat Kurları"
        description={latestDate ? `TCMB, son güncelleme ${formatDate(latestDate)}` : 'Henüz kur verisi yok'}
        actions={userCan(user, 'export.manage') ? <FetchRatesButton /> : undefined}
      />

      <KpiStripRow>
        {CURRENCY_ORDER.map((c) => {
          const r = latestByCurrency.get(c);
          return <KpiCard key={c} variant="strip" title={`${c} satış`} value={r?.selling ?? null} format="money" currency="TRY" fractionDigits={4} hint={r ? `Alış ${formatRate(r.buying)}` : undefined} />;
        })}
      </KpiStripRow>

      {rows.length > 1 ? (
        <div className="mb-6 rounded-lg border border-border/60 p-4">
          <RateChart rows={rows} />
        </div>
      ) : (
        <EmptyState title="Yeterli kur geçmişi yok" description="Grafik en az 2 farklı gün verisi gerektirir." className="mb-6" />
      )}

      <RatesTable rows={rows} />
    </>
  );
}
