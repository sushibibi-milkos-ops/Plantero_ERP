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
    <>
      {/* PageHeader artık ortalanmış form kabının DIŞINDA: içindeyken H1 içerik alanının sol
          kenarından ~196px içeride başlıyordu, hemen üstündeki üst çubuk kırıntısı sol kenara
          hizalıydı — aynı sayfada iki farklı sol hiza ekseni (Tur 5 bulgusu, P2). Yalnızca form
          ortalanmış kabında kalır. */}
      <PageHeader title="Yeni İş Emri" description="Ürün ve miktar seçin; reçete malzemeleri otomatik hesaplanır." />
      <div className="mx-auto max-w-3xl">
        <CreateWorkOrderForm products={products} lines={lines} warehouses={warehouses} />
      </div>
    </>
  );
}
