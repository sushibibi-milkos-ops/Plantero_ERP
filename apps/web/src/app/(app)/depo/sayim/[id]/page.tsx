import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission, userCan } from '@/lib/auth';
import { getCountDetail, listProductsForPicker } from '@/modules/stock/queries';
import { CountWorkspace, type CountLineVm } from '@/modules/stock/components/count-workspace';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Sayım Detayı' };
export const dynamic = 'force-dynamic';

export default async function CountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('stock.count');
  const [detail, products] = await Promise.all([getCountDetail(id), listProductsForPicker()]);
  if (!detail) notFound();
  const { count, lines, warehouse } = detail;

  const lineVms: CountLineVm[] = lines.map((l) => ({
    id: l.line.id, productId: l.line.productId, productName: l.productName, sku: l.sku, lotId: l.line.lotId, lotNo: l.lotNo,
    locationId: l.line.locationId, locationCode: l.locationCode, uomCode: l.uomCode, systemQty: l.line.systemQty,
    countedQty: l.line.countedQty, varianceQty: l.line.varianceQty, unitCost: l.line.unitCost,
  }));

  return (
    <>
      <PageHeader eyebrow="Sayım" title={<span className="font-mono">{count.docNo}</span>} description={`${warehouse?.name ?? ''} · ${formatDate(count.countDate)}`}>
        <StatusBadge status={count.status} kind="count" size="md" />
      </PageHeader>
      <CountWorkspace
        countId={count.id}
        status={count.status}
        varianceValue={count.varianceValue}
        lines={lineVms}
        products={products}
        canCount={userCan(user, 'stock.count')}
        canApprove={userCan(user, 'stock.approve_count')}
      />
    </>
  );
}
