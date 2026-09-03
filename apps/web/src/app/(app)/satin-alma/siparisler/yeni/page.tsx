import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listWarehouses, listSuppliers, listPurchasableProducts } from '@/modules/purchasing/queries';
import { PurchaseOrderForm } from '@/modules/purchasing/components/order-form';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Yeni Satın Alma Siparişi' };
export const dynamic = 'force-dynamic';

export default async function NewPurchaseOrderPage() {
  await requirePermission('purchasing.draft');
  const [warehouses, suppliers, products] = await Promise.all([listWarehouses(), listSuppliers(), listPurchasableProducts()]);

  return (
    <>
      <PageHeader title="Yeni Satın Alma Siparişi" description="Tedarikçiye gönderilecek sipariş taslağını oluşturun" />
      <PurchaseOrderForm warehouses={warehouses} suppliers={suppliers} products={products} />
    </>
  );
}
