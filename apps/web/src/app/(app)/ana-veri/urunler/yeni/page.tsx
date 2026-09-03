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
    // PageHeader gövdeyle aynı sarmalayıcının İÇİNDE — önceden başlık 1152px'e, gövde max-w-3xl (768px)'e
    // yayılıyordu, sağ kenar tırtıklı duruyordu (Tur 3 P1 bulgusu).
    <div className="max-w-[1080px]">
      <PageHeader title="Yeni ürün" description="Konuşan kod sihirbazı — segmentleri seçtikçe SKU canlı önizlenir." />
      <ProductWizard segments={segments} uoms={uoms} supplierOptions={supplierOptions} />
    </div>
  );
}
