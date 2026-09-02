import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { getDeliveryDetail } from '@/modules/stock/queries';
import { PickScreen, type PickLine } from '@/modules/stock/components/pick-screen';

export const metadata: Metadata = { title: 'Toplama' };
export const dynamic = 'force-dynamic';

export default async function PickPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission('stock.pick');
  const detail = await getDeliveryDetail(id);
  if (!detail) notFound();

  const lines: PickLine[] = detail.lines.map((l) => ({
    id: l.line.id, productName: l.productName, sku: l.sku, qty: l.line.qty, pickedQty: l.line.pickedQty, uomCode: l.uomCode,
    lotId: l.line.lotId, lotNo: l.lotNo, expiryDate: l.expiryDate, locationCode: l.locationCode,
  }));

  return <PickScreen deliveryId={detail.delivery.id} docNo={detail.delivery.docNo} initialLines={lines} />;
}
