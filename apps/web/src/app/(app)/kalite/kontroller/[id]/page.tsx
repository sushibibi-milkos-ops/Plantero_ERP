import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { getCheckDetail, listDecisionLocations } from '@/modules/quality/queries';
import { CheckDetail } from '@/modules/quality/components/check-detail';

export const metadata: Metadata = { title: 'Kalite Kontrolü' };
export const dynamic = 'force-dynamic';

export default async function QualityCheckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('quality.view');
  const { id } = await params;
  const detail = await getCheckDetail(id);
  if (!detail) notFound();

  const { release, reject } = await listDecisionLocations(detail.lot?.warehouseId ?? null);

  return (
    <>
      <PageHeader eyebrow={detail.check.docNo} title={detail.product.name} description={detail.lot ? `Lot ${detail.lot.lotNo}` : 'Lota bağlı değil'} />
      <CheckDetail detail={detail} releaseLocations={release} rejectLocations={reject} />
    </>
  );
}
