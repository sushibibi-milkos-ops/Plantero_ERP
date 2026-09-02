import type { Metadata } from 'next';
import { db } from '@plantero/db';
import { getExpiryBuckets } from '@plantero/core';
import { requirePermission, userCan } from '@/lib/auth';
import { ExpiryBoard } from '@/modules/stock/components/expiry-board';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'SKT Takibi' };
export const dynamic = 'force-dynamic';

export default async function ExpiryPage() {
  const user = await requirePermission('stock.view');
  const buckets = await getExpiryBuckets(db);

  return (
    <>
      <PageHeader title="SKT Takibi" description={`${buckets.rows.length} lot 90 gün içinde son kullanma tarihine yaklaşıyor`} />
      <ExpiryBoard buckets={buckets} canScrap={userCan(user, 'stock.count')} />
    </>
  );
}
