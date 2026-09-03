import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@plantero/db';
import { findBarcodeConflicts } from '@plantero/core';
import { requirePermission, userCan } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import {
  getProductById, listProductBarcodes, getProductStockBreakdown, listProductMoves, listProductBoms,
  listProductPriceItems, listProductCustomerPrices, listProductSuppliers, listAuditFor, getBomCostRollup, listPartners,
} from '@/modules/masterdata/queries';
import { DetailTabs, type ProductTabDef } from '@/modules/masterdata/components/product-detail-tabs';
import { ProductGeneralTab } from '@/modules/masterdata/components/product-general-tab';
import { ProductEditSheet } from '@/modules/masterdata/components/product-edit-sheet';
import { ProductIdentityDialog } from '@/modules/masterdata/components/product-identity-dialog';
import { ProductBarcodesTab } from '@/modules/masterdata/components/product-barcodes-tab';
import { ProductStockTab } from '@/modules/masterdata/components/product-stock-tab';
import { ProductBomTab } from '@/modules/masterdata/components/product-bom-tab';
import { ProductPricesTab } from '@/modules/masterdata/components/product-prices-tab';
import { ProductSuppliersTab } from '@/modules/masterdata/components/product-suppliers-tab';
import { ProductMovesTab } from '@/modules/masterdata/components/product-moves-tab';
import { AuditTab } from '@/modules/masterdata/components/audit-tab';
import { PRODUCT_TYPE_LABELS } from '@/modules/masterdata/product-labels';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductById(id);
  return { title: product ? `${product.p.sku} — ${product.p.name}` : 'Ürün' };
}

export const dynamic = 'force-dynamic';

export default async function ProductDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  await searchParams;
  const user = await requirePermission('masterdata.view');
  const canManage = userCan(user, 'masterdata.manage');
  const canChangeIdentity = userCan(user, 'admin.settings');

  const product = await getProductById(id);
  if (!product) notFound();
  const { p, uomCode, uomName } = product;

  const [barcodes, stockRows, moves, boms, priceItems, customerPrices, suppliers, audit, partners] = await Promise.all([
    listProductBarcodes(id),
    getProductStockBreakdown(id),
    listProductMoves(id),
    listProductBoms(id),
    listProductPriceItems(id),
    listProductCustomerPrices(id),
    listProductSuppliers(id),
    listAuditFor('products', id),
    listPartners(),
  ]);

  const conflicts = p.barcode ? await findBarcodeConflicts(db, p.barcode, p.id) : [];

  // Sıralı değil paralel: N reçete için N ayrı bekleme yerine tek Promise.all (sayfa yükleme süresi ~N kat düşer).
  const unitCostsByBom: Record<string, string> = {};
  await Promise.all(
    boms.map(async (b) => {
      try {
        const rollup = await getBomCostRollup(b.id);
        unitCostsByBom[b.id] = rollup.unitCost;
      } catch {
        unitCostsByBom[b.id] = '0';
      }
    }),
  );

  const supplierOptions = partners
    .filter((pt) => pt.kind === 'supplier' || pt.kind === 'both')
    .map((pt) => ({ value: pt.id, label: `${pt.name} (${pt.code})` }));

  const tabs: ProductTabDef[] = [
    { value: 'genel', label: 'Genel', content: <ProductGeneralTab product={product} uomName={uomName} /> },
    {
      value: 'barkodlar',
      label: 'Barkodlar',
      content: (
        <ProductBarcodesTab
          productId={id}
          mainBarcode={p.barcode}
          caseBarcode={p.caseBarcode}
          extra={barcodes}
          conflicts={conflicts}
          canManage={canManage}
        />
      ),
    },
    { value: 'stok', label: 'Stok', content: <ProductStockTab rows={stockRows} uomCode={uomCode} /> },
    { value: 'recete', label: 'Reçete', content: <ProductBomTab boms={boms} unitCosts={unitCostsByBom} /> },
    { value: 'fiyatlar', label: 'Fiyatlar', content: <ProductPricesTab priceItems={priceItems} customerPrices={customerPrices} /> },
    { value: 'tedarikciler', label: 'Tedarikçiler', content: <ProductSuppliersTab productId={id} suppliers={suppliers} supplierOptions={supplierOptions} canManage={canManage} /> },
    { value: 'hareketler', label: 'Hareketler', content: <ProductMovesTab rows={moves as never} uomCode={uomCode} /> },
    { value: 'denetim', label: 'Denetim', content: <AuditTab rows={audit as never} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow={PRODUCT_TYPE_LABELS[p.type] ?? p.type}
        title={
          <span className="inline-flex items-center gap-2">
            {p.name}
            <StatusBadge status={p.status} kind="product" />
          </span>
        }
        description={
          <span className="font-mono text-[12px]">
            {p.sku}
            {p.shortCode ? ` · ${p.shortCode}` : ''}
          </span>
        }
        actions={
          <>
            {canChangeIdentity ? <ProductIdentityDialog productId={id} name={p.name} barcode={p.barcode} /> : null}
            {canManage ? <ProductEditSheet product={product} /> : null}
          </>
        }
      />
      <DetailTabs tabs={tabs} defaultTab="genel" />
    </>
  );
}
