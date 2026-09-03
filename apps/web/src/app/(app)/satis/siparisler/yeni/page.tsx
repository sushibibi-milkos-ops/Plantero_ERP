import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listCustomers, listChannels, listWarehouses, listPriceListsBasic, listSellableProducts } from '@/modules/sales/queries';
import { SalesDocForm } from '@/modules/sales/components/sales-doc-form';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Yeni Sipariş' };
export const dynamic = 'force-dynamic';

export default async function NewSalesOrderPage() {
  await requirePermission('sales.order');
  const [customers, channels, warehouses, priceLists, products] = await Promise.all([listCustomers(), listChannels(), listWarehouses(), listPriceListsBasic(), listSellableProducts()]);

  return (
    <>
      <PageHeader title="Yeni Sipariş" description="Onaylandığında stok kullanılabilirliği kontrol edilir ve irsaliye taslağı otomatik açılır" />
      <SalesDocForm docType="order" customers={customers} channels={channels} warehouses={warehouses} priceLists={priceLists} products={products} />
    </>
  );
}
