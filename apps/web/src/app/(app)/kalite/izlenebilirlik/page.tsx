import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { TraceSearch } from '@/modules/quality/components/trace-search';

export const metadata: Metadata = { title: 'İzlenebilirlik' };
export const dynamic = 'force-dynamic';

export default async function TraceabilityPage() {
  await requirePermission('quality.view');

  return (
    <>
      <PageHeader title="İzlenebilirlik" description="Lot, ürün, müşteri veya tedarikçi ara — iki yönlü izleme grafiği ve miktar dengesi" />
      <Suspense>
        <TraceSearch />
      </Suspense>
    </>
  );
}
