import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listPriceListsWithCounts, listCustomerPrices, listCustomers, listSellableProducts } from '@/modules/sales/queries';
import { PriceListsTable } from '@/modules/sales/components/price-lists-table';
import { CustomerPricesTable } from '@/modules/sales/components/customer-prices-table';
import { CustomerPriceDialog } from '@/modules/sales/components/customer-price-dialog';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const metadata: Metadata = { title: 'Fiyat Listeleri' };
export const dynamic = 'force-dynamic';

export default async function PriceListsPage() {
  await requirePermission('sales.price');
  const [lists, customerPrices, customers, products] = await Promise.all([listPriceListsWithCounts(), listCustomerPrices(), listCustomers(), listSellableProducts()]);

  return (
    <>
      <PageHeader title="Fiyat Listeleri" description="Kanal fiyat listeleri ve müşteriye özel fiyatlar — öncelik: müşteri özel › kanal listesi › ürün liste fiyatı" />
      <Tabs defaultValue="lists">
        <TabsList variant="line">
          <TabsTrigger value="lists">Fiyat listeleri</TabsTrigger>
          <TabsTrigger value="customer">Müşteriye özel fiyatlar</TabsTrigger>
        </TabsList>

        <TabsContent value="lists" className="mt-3">
          <PriceListsTable rows={lists} products={products} />
        </TabsContent>

        <TabsContent value="customer" className="mt-3 space-y-3">
          <div className="flex justify-end">
            <CustomerPriceDialog customers={customers} products={products} />
          </div>
          <CustomerPricesTable rows={customerPrices} />
        </TabsContent>
      </Tabs>
    </>
  );
}
