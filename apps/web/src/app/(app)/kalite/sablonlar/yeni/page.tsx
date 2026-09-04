import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { listProductsForTemplate } from '@/modules/quality/queries';
import { TemplateForm } from '@/modules/quality/components/template-form';

export const metadata: Metadata = { title: 'Yeni Kalite Şablonu' };
export const dynamic = 'force-dynamic';

export default async function NewQualityTemplatePage() {
  await requirePermission('quality.inspect');
  const products = await listProductsForTemplate();

  return (
    <>
      <PageHeader title="Yeni Kalite Şablonu" description="Girdi/ara/final kontrol kalemlerini tanımlayın" />
      <TemplateForm mode="create" products={products} />
    </>
  );
}
