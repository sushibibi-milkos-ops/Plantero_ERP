import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission, userCan } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import {
  getPartnerById, listPartnerAddresses, listPartnerContacts, listPartnerCustomerPrices, listPartnerSupplierProducts,
  listPartnerOrders, listPartnerInvoices, listPartnerPayments, listAuditFor, listChannels, listBomComponentCandidates,
} from '@/modules/masterdata/queries';
import { DetailTabs, type ProductTabDef } from '@/modules/masterdata/components/product-detail-tabs';
import { PartnerGeneralTab } from '@/modules/masterdata/components/partner-general-tab';
import { PartnerEditSheet } from '@/modules/masterdata/components/partner-edit-sheet';
import { PartnerAddressesTab } from '@/modules/masterdata/components/partner-addresses-tab';
import { PartnerContactsTab } from '@/modules/masterdata/components/partner-contacts-tab';
import { PartnerBalanceTab } from '@/modules/masterdata/components/partner-balance-tab';
import { PartnerCustomerPricesTab } from '@/modules/masterdata/components/partner-customer-prices-tab';
import { PartnerSupplierProductsTab } from '@/modules/masterdata/components/partner-supplier-products-tab';
import { PartnerQualityTab } from '@/modules/masterdata/components/partner-quality-tab';
import { AuditTab } from '@/modules/masterdata/components/audit-tab';
import { PARTNER_KIND_LABELS } from '@/modules/masterdata/product-labels';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const partner = await getPartnerById(id);
  return { title: partner ? `${partner.code} — ${partner.name}` : 'Cari' };
}

export const dynamic = 'force-dynamic';

export default async function PartnerDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  await searchParams;
  const user = await requirePermission('masterdata.view');
  const canManage = userCan(user, 'masterdata.manage');

  // `getPartnerById` diğer sekiz sorguyla PARALEL çalışır — önceden ayrı `await`lenip sonra 10 sorguluk
  // Promise.all beklenirdi (11 sıralı adım); yalnızca müşteri/tedarikçi'ye özel iki sorgu partner.kind'e
  // bağımlı olduğu için ayrı bir ikinci Promise.all'da kalır (Tur 3 P1 bulgusu — algılanan yükleniyor süresi).
  const [partner, addresses, contacts, orders, invoices, payments, audit, channels, componentProducts] = await Promise.all([
    getPartnerById(id),
    listPartnerAddresses(id),
    listPartnerContacts(id),
    listPartnerOrders(id),
    listPartnerInvoices(id),
    listPartnerPayments(id),
    listAuditFor('partners', id),
    listChannels(),
    listBomComponentCandidates(),
  ]);
  if (!partner) notFound();

  const isSupplierKind = partner.kind === 'supplier' || partner.kind === 'both';
  const isCustomerKind = partner.kind === 'customer' || partner.kind === 'both';

  const [customerPrices, supplierProducts] = await Promise.all([
    isCustomerKind ? listPartnerCustomerPrices(id) : Promise.resolve([]),
    isSupplierKind ? listPartnerSupplierProducts(id) : Promise.resolve([]),
  ]);

  const channelName = channels.find((c) => c.id === partner.defaultChannelId)?.name ?? null;
  const productOptions = componentProducts.map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}`, keywords: [p.sku] }));

  const tabs: ProductTabDef[] = [
    {
      value: 'genel',
      label: 'Genel',
      content: (
        <PartnerGeneralTab
          partner={partner}
          channelName={channelName}
          lastOrder={orders[0] ?? null}
          orders={orders}
          invoices={invoices}
          payments={payments}
          addresses={addresses}
          contacts={contacts}
        />
      ),
    },
    { value: 'adresler', label: 'Adresler', content: <PartnerAddressesTab partnerId={id} addresses={addresses} canManage={canManage} /> },
    { value: 'kisiler', label: 'Kişiler', content: <PartnerContactsTab partnerId={id} contacts={contacts} canManage={canManage} /> },
    { value: 'bakiye', label: 'Bakiye & Hareketler', content: <PartnerBalanceTab balance={partner.balance} currency={partner.currency} orders={orders} invoices={invoices} payments={payments} /> },
  ];
  if (isCustomerKind) tabs.push({ value: 'ozel-fiyatlar', label: 'Özel Fiyatlar', content: <PartnerCustomerPricesTab rows={customerPrices} /> });
  if (isSupplierKind) {
    tabs.push({ value: 'tedarikci-urunleri', label: 'Tedarikçi Ürünleri', content: <PartnerSupplierProductsTab partnerId={id} rows={supplierProducts} productOptions={productOptions} canManage={canManage} /> });
    tabs.push({ value: 'kalite-skoru', label: 'Kalite Skoru', content: <PartnerQualityTab score={partner.supplierQualityScore} /> });
  }
  tabs.push({ value: 'denetim', label: 'Denetim', content: <AuditTab rows={audit as never} /> });

  return (
    <>
      {/* Tur 9/10 P1 bulgusu: başlık `<span className="inline-flex …">{ad}<StatusBadge/></span>` idi —
          PageHeader'ın h1'i `truncate` (overflow-hidden + ellipsis + nowrap) taşıyor ama bu ellipsis
          algoritması yalnızca h1'in DOĞRUDAN metin içeriğinde çalışır; içerik nested bir inline-flex
          span (metin + rozet iki ayrı çocuk) olunca tarayıcı üç nokta basmadan ham kırpma yapıyor ve
          390px'te StatusBadge tamamen görünüm dışına taşıyordu. Kök neden PageHeader'da değil (ortak
          bileşen değiştirilmedi) — bu sayfanın başlığı yalnızca DÜZ METİN olacak şekilde yeniden
          kuruldu (h1'in kendi `truncate`'i böylece gerçek "…" üretir), durum rozeti başlığın hemen
          altına, açıklama satırına taşındı — her genişlikte normal metin akışıyla sarar, asla kırpılmaz. */}
      <PageHeader
        eyebrow={PARTNER_KIND_LABELS[partner.kind] ?? partner.kind}
        title={partner.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={partner.isActive ? 'active' : 'inactive'} />
            <span className="font-mono text-[12px]">{partner.code}</span>
          </span>
        }
        actions={canManage ? <PartnerEditSheet partner={partner} /> : undefined}
      />
      <DetailTabs tabs={tabs} defaultTab="genel" />
    </>
  );
}
