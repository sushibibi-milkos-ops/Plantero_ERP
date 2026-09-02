import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { listSkuSegments } from '@/modules/masterdata/queries';
import { SegmentsTable } from '@/modules/masterdata/components/segments-table';

export const metadata: Metadata = { title: 'Kod Yapısı' };
export const dynamic = 'force-dynamic';

export default async function CodeStructurePage() {
  const user = await requirePermission('masterdata.view');
  const canManage = userCan(user, 'masterdata.manage');
  const segments = await listSkuSegments();

  return (
    <>
      <PageHeader title="Kod Yapısı" description="Konuşan kod (SKU) segment sözlüğü — T·AA·BB·CC·PP" />
      <SegmentsTable segments={segments} canManage={canManage} />
    </>
  );
}
