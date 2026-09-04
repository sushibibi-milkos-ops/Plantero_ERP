import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth';
import { listRecentRates, getLatestRates } from '@/modules/export/queries';
import { RateChart } from '@/modules/export/components/rate-chart';
import { FetchRatesButton } from '@/modules/export/components/fetch-rates-button';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { EmptyState } from '@/components/empty-state';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'İhracat Kurları' };
export const dynamic = 'force-dynamic';

const CURRENCY_ORDER = ['USD', 'EUR', 'GBP'];

export default async function ExportRatesPage() {
  const user = await requirePermission('export.view');
  const [rows, latest] = await Promise.all([listRecentRates(90), getLatestRates()]);
  const latestByCurrency = new Map(latest.map((r) => [r.currency, r]));
  const latestDate = latest[0]?.rateDate ?? null;

  const recent = [...rows].reverse().slice(0, 60);

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
          return <KpiCard key={c} variant="strip" title={`${c} satış`} value={r?.selling ?? null} format="money" currency="TRY" fractionDigits={4} hint={r ? `Alış ₺${Number(r.buying).toFixed(4)}` : undefined} />;
        })}
      </KpiStripRow>

      {rows.length > 1 ? (
        <div className="mb-6 rounded-lg border border-border/60 p-4">
          <RateChart rows={rows} />
        </div>
      ) : (
        <EmptyState title="Yeterli kur geçmişi yok" description="Grafik en az 2 farklı gün verisi gerektirir." className="mb-6" />
      )}

      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground uppercase">
              <th className="px-3 py-2 font-medium">Tarih</th>
              <th className="px-3 py-2 font-medium">Para birimi</th>
              <th className="px-3 py-2 text-right font-medium">Alış</th>
              <th className="px-3 py-2 text-right font-medium">Satış</th>
              <th className="px-3 py-2 font-medium">Kaynak</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={`${r.currency}-${r.rateDate}`} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                <td className="px-3 py-2.5">{formatDate(r.rateDate)}</td>
                <td className="px-3 py-2.5 font-medium">{r.currency}</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">₺{Number(r.buying).toFixed(4)}</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">₺{Number(r.selling).toFixed(4)}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{r.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {recent.length === 0 ? <EmptyState compact title="Kur verisi yok" /> : null}
      </div>
    </>
  );
}
