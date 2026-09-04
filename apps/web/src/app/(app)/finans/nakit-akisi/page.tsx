import type { Metadata } from 'next';
import { Lock } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { formatDate } from '@/lib/format';
import { getCashflowPage, getAssumptions, getChannelAssumptions } from '@/modules/finance/cashflow-queries';
import { CashflowChart } from '@/modules/finance/components/cashflow-chart';
import { CashflowTable } from '@/modules/finance/components/cashflow-table';
import { ScenarioSelect, RecomputeCashflowButton } from '@/modules/finance/components/cashflow-toolbar';
import { AssumptionsDrawer } from '@/modules/finance/components/assumptions-drawer';

export const metadata: Metadata = { title: 'Nakit Akışı' };
export const dynamic = 'force-dynamic';

type Scenario = 'base' | 'optimistic' | 'pessimistic';

export default async function CashflowPage({ searchParams }: { searchParams: Promise<{ senaryo?: string }> }) {
  const user = await requirePermission('finance.view');
  const { senaryo } = await searchParams;
  const scenario: Scenario = senaryo === 'optimistic' || senaryo === 'pessimistic' ? senaryo : 'base';

  const [{ lines, channels, computedAt }, assumptions, channelAssumptions] = await Promise.all([
    getCashflowPage(scenario),
    getAssumptions(),
    getChannelAssumptions(),
  ]);

  const first = lines[0];
  const openingCash = first?.openingCash ?? '0';
  const currentNetCash = first?.netCashflow ?? '0';
  const first12 = lines.slice(0, 12);
  const avg12 = first12.length ? first12.reduce((acc, l) => acc + Number(l.netCashflow), 0) / first12.length : 0;
  const minLine = lines.reduce((min, l) => (Number(l.closingCash) < Number(min.closingCash) ? l : min), lines[0]!);

  const chartPoints = lines.map((l) => ({ period: l.period, closingCash: Number(l.closingCash), netCashflow: Number(l.netCashflow) }));
  const canEdit = userCan(user, 'finance.manage');

  return (
    <>
      <PageHeader
        title="Nakit Akışı"
        description={`36 aylık projeksiyon — ${formatDate(`${lines[0]?.period}-01`)} → ${formatDate(`${lines[lines.length - 1]?.period}-01`)}${computedAt ? ` · gerçekleşen veri en son ${formatDate(computedAt)} güncellendi` : ''}`}
        actions={
          <>
            <ScenarioSelect scenario={scenario} />
            {canEdit ? <RecomputeCashflowButton scenario={scenario} /> : null}
            {canEdit ? <AssumptionsDrawer assumptions={assumptions} channels={channelAssumptions} /> : null}
          </>
        }
      />

      <KpiStripRow>
        <KpiCard variant="strip" title="Dönem başı nakit" value={openingCash} format="money" hint={lines[0]?.period ? formatDate(`${lines[0].period}-01`) : undefined} />
        <KpiCard variant="strip" title="Bu ay net nakit" value={currentNetCash} format="money" />
        <KpiCard variant="strip" title="12 ay ortalama net nakit" value={avg12.toFixed(2)} format="money" />
        <KpiCard
          variant="strip"
          title="Minimum nakit ayı"
          value={minLine?.closingCash ?? '0'}
          format="money"
          hint={minLine ? `${formatDate(`${minLine.period}-01`)}${Number(minLine.closingCash) < 0 ? ' — negatif!' : ''}` : undefined}
        />
      </KpiStripRow>

      <div className="mb-4 rounded-xl border border-border/70 bg-card p-4">
        <CashflowChart points={chartPoints} />
      </div>

      {!canEdit ? (
        <div className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" />
          Tabloyu düzenlemek için &quot;Kredi, bütçe, nakit akışı yönet&quot; yetkisi gerekir — hücreler salt okunur gösteriliyor.
        </div>
      ) : null}
      <CashflowTable lines={lines} channels={channels} scenario={scenario} canEdit={canEdit} />
    </>
  );
}
