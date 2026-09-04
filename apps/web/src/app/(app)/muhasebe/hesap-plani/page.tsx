import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { getChartOfAccounts } from '@/modules/accounting/queries';
import { ChartOfAccountsView } from '@/modules/accounting/components/chart-of-accounts-view';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Hesap Planı' };
export const dynamic = 'force-dynamic';

export default async function ChartOfAccountsPage() {
  await requirePermission('accounting.view');
  // Muavin (cari alt hesap) ayrıntısı /muhasebe/cariler/[id]/ekstre'de — burada yalnızca ana hesap planı.
  const accounts = (await getChartOfAccounts()).filter((a) => !a.isPartnerAccount);

  return (
    <>
      <PageHeader title="Hesap Planı" description={`${accounts.length} hesap — Tek Düzen Hesap Planı, VUK ve UFRS bakiyeleri yan yana`} />
      <ChartOfAccountsView accounts={accounts} />
    </>
  );
}
