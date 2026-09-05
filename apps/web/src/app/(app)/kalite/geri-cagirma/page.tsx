import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { listRecalls } from '@/modules/quality/queries';
import { RecallsTable } from '@/modules/quality/components/recalls-table';
import { RecallSimulateForm } from '@/modules/quality/components/recall-simulate-form';

export const metadata: Metadata = { title: 'Geri Çağırma' };
export const dynamic = 'force-dynamic';

export default async function RecallsPage() {
  await requirePermission('quality.recall');
  const recalls = await listRecalls();

  return (
    <>
      <PageHeader title="Geri Çağırma" description={`${recalls.length} kayıt`} actions={<RecallSimulateForm />} />
      <RecallsTable recalls={recalls} />
    </>
  );
}
