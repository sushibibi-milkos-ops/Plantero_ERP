import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { listActiveMachinesForForm } from '@/modules/maintenance/queries';
import { ReportBreakdownForm } from '@/modules/maintenance/components/report-breakdown-form';

export const metadata: Metadata = { title: 'Arıza Bildir' };
export const dynamic = 'force-dynamic';

export default async function ReportBreakdownPage() {
  await requirePermission('maintenance.report');
  const machines = await listActiveMachinesForForm();

  return (
    <>
      <PageHeader title="Arıza Bildir" description="Makineyi tarayın ya da seçin, fotoğraf ekleyin" className="mx-auto max-w-xl" />
      <ReportBreakdownForm machines={machines} />
    </>
  );
}
