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
  const totalItems = lists.reduce((sum, l) => sum + l.itemCount, 0);

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
          {/* Kapanış şeridi (Tur 10 P2 satis-fiyat-04): /satis/teklifler'de zaten var olan kalıp
              (aynı DataTable temelli ekran, dolu tablodan sonra ~700px boş bırakıp hiçbir kapanış
              öğesi göstermiyordu) — modül içi tutarlılık için birebir aynı anatomi. */}
          {lists.length > 0 ? (
            <div className="mt-2 flex h-9 items-center justify-end border-t border-border/60 px-1 text-[13px] text-muted-foreground">
              {lists.length} liste · {totalItems} satır
            </div>
          ) : null}
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
