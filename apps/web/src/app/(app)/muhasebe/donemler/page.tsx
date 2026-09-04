import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth';
import { listFiscalPeriods } from '@/modules/accounting/queries';
import { FiscalPeriodsTable } from '@/modules/accounting/components/fiscal-periods-table';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Dönemler' };
export const dynamic = 'force-dynamic';

export default async function FiscalPeriodsPage() {
  const user = await requirePermission('accounting.view');
  const periods = (await listFiscalPeriods()).sort((a, b) => b.code.localeCompare(a.code));
  const canClose = userCan(user, 'accounting.close_period');

  return (
    <>
      <PageHeader title="Dönemler" description="Kapalı döneme fiş atılamaz — yevmiye servisi bunu her zaman zorlar" />
      <FiscalPeriodsTable periods={periods} canClose={canClose} />
    </>
  );
}
