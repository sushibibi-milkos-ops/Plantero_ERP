import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { getTemplateDetail, listProductsForTemplate } from '@/modules/quality/queries';
import { TemplateForm } from '@/modules/quality/components/template-form';

export const metadata: Metadata = { title: 'Kalite Şablonu' };
export const dynamic = 'force-dynamic';

export default async function EditQualityTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('quality.inspect');
  const { id } = await params;
  const [detail, products] = await Promise.all([getTemplateDetail(id), listProductsForTemplate()]);
  if (!detail) notFound();

  return (
    <>
      <PageHeader eyebrow={detail.template.code} title={detail.template.name} description={`${detail.items.length} kalem`} />
      <TemplateForm
        mode="edit"
        products={products}
        initial={{
          id: detail.template.id, code: detail.template.code, name: detail.template.name,
          productId: detail.template.productId, productType: detail.template.productType ?? 'all', isActive: detail.template.isActive,
          items: detail.items.map((i) => ({ name: i.name, kind: i.kind as 'numeric' | 'boolean' | 'text' | 'document', minValue: i.minValue ?? '', maxValue: i.maxValue ?? '', unit: i.unit ?? '', isCritical: i.isCritical })),
        }}
      />
    </>
  );
}
