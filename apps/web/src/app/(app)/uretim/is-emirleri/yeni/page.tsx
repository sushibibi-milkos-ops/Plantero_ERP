import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listManufacturableProducts, listLineOptions, listWarehousesForProduction } from '@/modules/production/queries';
import { CreateWorkOrderForm } from '@/modules/production/components/create-work-order-form';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Yeni İş Emri' };
export const dynamic = 'force-dynamic';

export default async function NewWorkOrderPage() {
  await requirePermission('production.plan');
  const [products, lines, warehouses] = await Promise.all([listManufacturableProducts(), listLineOptions(), listWarehousesForProduction()]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Yeni İş Emri" description="Ürün ve miktar seçin; reçete malzemeleri otomatik hesaplanır." />
      <CreateWorkOrderForm products={products} lines={lines} warehouses={warehouses} />
    </div>
  );
}
