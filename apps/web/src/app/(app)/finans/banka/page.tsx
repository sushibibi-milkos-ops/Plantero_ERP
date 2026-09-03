import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth';
import { listBankAccountsSummary, listBankTransactions, getReconciliationKpis, listPartnersForDirection } from '@/modules/finance/queries';
import { BankAccountsCards } from '@/modules/finance/components/bank-accounts-cards';
import { BankTransactionsTable } from '@/modules/finance/components/bank-transactions-table';
import { RunReconciliationButton } from '@/modules/finance/components/run-reconciliation-button';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';

export const metadata: Metadata = { title: 'Banka Mutabakatı' };
export const dynamic = 'force-dynamic';

export default async function BankPage() {
  const user = await requirePermission('finance.view');
  const [accounts, transactions, kpis, customers, suppliers] = await Promise.all([
    listBankAccountsSummary(),
    listBankTransactions(),
    getReconciliationKpis(),
    listPartnersForDirection('inbound'),
    listPartnersForDirection('outbound'),
  ]);
  const partners = [
    ...customers.map((p) => ({ ...p, kind: 'customer' as const })),
    ...suppliers.map((p) => ({ ...p, kind: 'supplier' as const })),
  ];
  const canReconcile = userCan(user, 'accounting.reconcile');

  return (
    <>
      <PageHeader
        title="Banka Mutabakatı"
        description={`${accounts.length} banka hesabı · ${kpis.suggested} öneri onay bekliyor`}
        actions={canReconcile ? <RunReconciliationButton /> : undefined}
      />

      <KpiStripRow>
        <KpiCard variant="strip" title="Eşleşmemiş" value={kpis.unmatched} format="int" />
        <KpiCard variant="strip" title="Öneri bekliyor" value={kpis.suggested} format="int" />
        <KpiCard variant="strip" title="Eşleşti" value={kpis.matched} format="int" />
        <KpiCard variant="strip" title="Bugün otomatik uygulanan" value={kpis.autoAppliedToday} format="int" />
      </KpiStripRow>

      <BankAccountsCards accounts={accounts} />

      <BankTransactionsTable transactions={transactions} partners={partners} canReconcile={canReconcile} />
    </>
  );
}
