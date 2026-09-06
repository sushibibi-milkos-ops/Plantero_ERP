import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listEligibleExportOrders } from '@/modules/export/queries';
import { ShipmentCreateForm } from '@/modules/export/components/shipment-create-form';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Yeni İhracat Sevkiyatı' };
export const dynamic = 'force-dynamic';

export default async function NewExportShipmentPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  await requirePermission('export.manage');
  const [orders, sp] = await Promise.all([listEligibleExportOrders(), searchParams]);

  return (
    <>
      <PageHeader title="Yeni İhracat Sevkiyatı" description="İhracat siparişinden proforma/çeki listesi/belge takibi zincirini başlatır." />
      <ShipmentCreateForm orders={orders} initialOrderId={sp.order} />
    </>
  );
}
