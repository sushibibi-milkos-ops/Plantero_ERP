import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { getBreakEvenPage, getSensitivityPage, currentPeriod } from '@/modules/finance/cashflow-queries';
import { BreakEvenPanel } from '@/modules/finance/components/breakeven-panel';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Başabaş' };
export const dynamic = 'force-dynamic';

export default async function BreakEvenPage() {
  await requirePermission('finance.view');
  const period = currentPeriod();
  const [data, sensitivity] = await Promise.all([getBreakEvenPage(period), getSensitivityPage(period)]);

  return (
    <>
      <PageHeader title="Canlı Başabaş" description={`${formatDate(`${period}-01`)} — bu ay gereken minimum ciro vs gerçekleşen`} />
      <BreakEvenPanel data={data} sensitivity={sensitivity} />
    </>
  );
}
