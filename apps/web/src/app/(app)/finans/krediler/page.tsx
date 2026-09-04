import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { listLoans, getConsolidatedSchedule, getMonthlyLoanBurden } from '@/modules/finance/loans-queries';
import { LoanCards, BurdenChart, ConsolidatedScheduleTable } from '@/modules/finance/components/loan-panel';

export const metadata: Metadata = { title: 'Krediler' };
export const dynamic = 'force-dynamic';

export default async function LoansPage() {
  const user = await requirePermission('finance.view');
  const [loans, schedule, burden] = await Promise.all([listLoans(), getConsolidatedSchedule(), getMonthlyLoanBurden()]);

  const totalRemaining = loans.reduce((acc, l) => acc + Number(l.remainingPrincipal), 0);
  const totalMonthlyInstallment = loans.filter((l) => l.remainingInstallments > 0).reduce((acc, l) => acc + Number(l.monthlyInstallment), 0);
  const variableCount = loans.filter((l) => l.rateKind === 'variable').length;

  return (
    <>
      <PageHeader title="Krediler" description={`${loans.length} kredi — konsolide taksit takvimi ve aylık yük`} />

      <KpiStripRow>
        <KpiCard variant="strip" title="Toplam kalan anapara" value={totalRemaining.toFixed(2)} format="money" />
        <KpiCard variant="strip" title="Bu ay toplam taksit" value={totalMonthlyInstallment.toFixed(2)} format="money" />
        <KpiCard variant="strip" title="Aktif kredi" value={loans.filter((l) => l.isActive).length} format="int" />
        <KpiCard variant="strip" title="Değişken faizli" value={variableCount} format="int" />
      </KpiStripRow>

      <LoanCards loans={loans} canEdit={userCan(user, 'finance.manage')} />

      <div className="mt-4 rounded-xl border border-border/70 bg-card p-4">
        <h2 className="mb-3 text-[13px] font-semibold">Toplam aylık taksit yükü</h2>
        <BurdenChart points={burden} />
      </div>

      <div className="mt-4">
        <h2 className="mb-3 text-[13px] font-semibold">Konsolide taksit takvimi</h2>
        <ConsolidatedScheduleTable periods={schedule.periods} loanCodes={schedule.loanCodes} cellByKey={schedule.cellByKey} totalsByPeriod={schedule.totalsByPeriod} />
      </div>
    </>
  );
}
