import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth';
import { listVatPeriods, getVatCarryforwardSeries, listComputableVatPeriods } from '@/modules/accounting/queries';
import { VatCarryforwardChart } from '@/modules/accounting/components/vat-carryforward-chart';
import { CloseVatPeriodButton } from '@/modules/accounting/components/close-vat-period-button';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { MoneyCell } from '@/components/money-cell';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'KDV' };
export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  open: { label: 'Açık', className: 'text-muted-foreground' },
  declared: { label: 'Hesaplandı', className: 'text-success' },
  paid: { label: 'Ödendi', className: 'text-success' },
};

export default async function VatPage() {
  const user = await requirePermission('accounting.view');
  const [periods, series, computable] = await Promise.all([listVatPeriods(), getVatCarryforwardSeries(), listComputableVatPeriods()]);
  const latest = periods[0];

  return (
    <>
      <PageHeader
        title="KDV"
        description="Satış %1 (gıda) · alış %20 ağırlıklı — asimetri devreden KDV birikimine yol açar"
        actions={userCan(user, 'accounting.post') ? <CloseVatPeriodButton computablePeriods={computable} /> : undefined}
      />

      {latest ? (
        <KpiStripRow>
          <KpiCard variant="strip" title="Hesaplanan (391)" value={latest.outputVat} format="money" />
          <KpiCard variant="strip" title="İndirilecek (191)" value={latest.inputVat} format="money" />
          <KpiCard variant="strip" title="Devreden" value={latest.carriedToNext} format="money" />
          <KpiCard variant="strip" title="Ödenecek (360)" value={latest.payable} format="money" />
        </KpiStripRow>
      ) : null}

      <div className="mb-6 rounded-lg border border-border/60 p-4">
        <div className="mb-2 text-[13px] font-medium text-muted-foreground">Devreden KDV birikimi</div>
        {series.length ? <VatCarryforwardChart series={series} /> : <p className="py-10 text-center text-[13px] text-muted-foreground">Henüz hesaplanmış dönem yok.</p>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
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
            {periods.map((p) => (
              <tr key={p.id} className="border-b border-border/40 last:border-0">
                <td className="px-3 py-2 font-mono">{p.period}</td>
                <td className="px-3 py-2 text-right"><MoneyCell value={p.outputVat} /></td>
                <td className="px-3 py-2 text-right"><MoneyCell value={p.inputVat} /></td>
                <td className="px-3 py-2 text-right"><MoneyCell value={p.carriedFromPrev} muted={Number(p.carriedFromPrev) === 0} /></td>
                <td className="px-3 py-2 text-right"><MoneyCell value={p.payable} muted={Number(p.payable) === 0} /></td>
                <td className="px-3 py-2 text-right"><MoneyCell value={p.carriedToNext} muted={Number(p.carriedToNext) === 0} /></td>
                <td className={`px-3 py-2 font-medium ${STATUS_LABELS[p.status]?.className ?? ''}`}>{STATUS_LABELS[p.status]?.label ?? p.status}</td>
              </tr>
            ))}
            {!periods.length ? <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">Henüz hesaplanmış KDV dönemi yok.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {latest?.declaredAt ? <p className="mt-2 text-[12px] text-muted-foreground">Son hesaplama: {formatDate(latest.declaredAt)}</p> : null}
    </>
  );
}
