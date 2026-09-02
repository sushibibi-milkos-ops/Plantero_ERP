import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { listSkuSegments, listUoms, listPartners } from '@/modules/masterdata/queries';
import { ProductWizard } from '@/modules/masterdata/components/product-wizard';

export const metadata: Metadata = { title: 'Yeni Ürün' };
export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  await requirePermission('masterdata.manage');
  const [segments, uoms, partners] = await Promise.all([listSkuSegments(), listUoms(), listPartners()]);

  const supplierOptions = partners
    .filter((p) => p.kind === 'supplier' || p.kind === 'both')
    .map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }));

  return (
    <>
      <PageHeader title="Yeni ürün" description="Konuşan kod sihirbazı — segmentleri seçtikçe SKU canlı önizlenir." />
      <div className="max-w-3xl">
        <ProductWizard segments={segments} uoms={uoms} supplierOptions={supplierOptions} />
      </div>
    </>
  );
}
