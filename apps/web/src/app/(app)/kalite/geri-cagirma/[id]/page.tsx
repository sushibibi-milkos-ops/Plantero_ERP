import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { getRecallDetail } from '@/modules/quality/queries';
import { RecallDetail } from '@/modules/quality/components/recall-detail';

export const metadata: Metadata = { title: 'Geri Çağırma Detayı' };
export const dynamic = 'force-dynamic';

export default async function RecallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('quality.recall');
  const { id } = await params;
  const detail = await getRecallDetail(id);
  if (!detail) notFound();

  return (
    <>
      <PageHeader eyebrow={detail.recall.docNo} title={`${detail.recall.productName} — Lot ${detail.recall.lotNo}`} />
      <RecallDetail recall={detail.recall} items={detail.items} customers={detail.customers} chain={detail.chain} draftMessage={detail.draftMessage} />
    </>
  );
}
