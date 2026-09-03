import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listPriceListsWithCounts, listCustomerPrices, listCustomers, listSellableProducts } from '@/modules/sales/queries';
import { PriceListDrawer } from '@/modules/sales/components/price-list-drawer';
import { CustomerPricesTable } from '@/modules/sales/components/customer-prices-table';
import { CustomerPriceDialog } from '@/modules/sales/components/customer-price-dialog';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Fiyat Listeleri' };
export const dynamic = 'force-dynamic';

export default async function PriceListsPage() {
  await requirePermission('sales.price');
  const [lists, customerPrices, customers, products] = await Promise.all([listPriceListsWithCounts(), listCustomerPrices(), listCustomers(), listSellableProducts()]);

  return (
    <>
      <PageHeader title="Fiyat Listeleri" description="Kanal fiyat listeleri ve müşteriye özel fiyatlar — öncelik: müşteri özel > kanal listesi > ürün liste fiyatı" />
      <Tabs defaultValue="lists">
        <TabsList>
          <TabsTrigger value="lists">Fiyat listeleri</TabsTrigger>
          <TabsTrigger value="customer">Müşteriye özel fiyatlar</TabsTrigger>
        </TabsList>

        <TabsContent value="lists">
          <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Liste</TableHead>
                  <TableHead>Kanal</TableHead>
                  <TableHead>Para birimi</TableHead>
                  <TableHead>KDV</TableHead>
                  <TableHead>Geçerlilik</TableHead>
                  <TableHead className="text-right">Satır</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lists.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="font-medium">{l.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{l.code}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{l.channelName ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{l.currency}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{l.includesVat ? 'Dahil' : 'Hariç'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{l.validFrom ? formatDate(l.validFrom) : 'Süresiz'}{l.validTo ? ` → ${formatDate(l.validTo)}` : ''}</TableCell>
                    <TableCell className="text-right">
                      <PriceListDrawer listId={l.id} listName={l.name} currency={l.currency} itemCount={l.itemCount} products={products} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="customer" className="space-y-3">
          <div className="flex justify-end">
            <CustomerPriceDialog customers={customers} products={products} />
          </div>
          <CustomerPricesTable rows={customerPrices} />
        </TabsContent>
      </Tabs>
    </>
  );
}
