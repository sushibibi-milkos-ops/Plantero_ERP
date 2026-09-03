import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listCustomers, listChannels, listWarehouses, listPriceListsBasic, listSellableProducts } from '@/modules/sales/queries';
import { SalesDocForm } from '@/modules/sales/components/sales-doc-form';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Yeni Teklif' };
export const dynamic = 'force-dynamic';

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<{ opportunityId?: string; partnerId?: string }> }) {
  await requirePermission('sales.quote');
  const sp = await searchParams;
  const [customers, channels, warehouses, priceLists, products] = await Promise.all([listCustomers(), listChannels(), listWarehouses(), listPriceListsBasic(), listSellableProducts()]);

  return (
    <>
      <PageHeader title="Yeni Teklif" description="Fiyat çözümleme önceliği: müşteri özel > kanal fiyat listesi > ürün liste fiyatı" />
      <SalesDocForm docType="quotation" customers={customers} channels={channels} warehouses={warehouses} priceLists={priceLists} products={products} opportunityId={sp.opportunityId} initialPartnerId={sp.partnerId} />
    </>
  );
}
