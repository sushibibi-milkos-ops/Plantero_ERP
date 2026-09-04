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
      <PageHeader title="Geri Çağırma" description={`${recalls.length} kayıt`} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecallsTable recalls={recalls} />
        </div>
        <div className="rounded-xl border border-border/60 p-4">
          <h2 className="mb-4 text-sm font-medium">Yeni Simülasyon</h2>
          <RecallSimulateForm />
        </div>
      </div>
    </>
  );
}
