import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { listTemplates } from '@/modules/quality/queries';
import { TemplatesTable } from '@/modules/quality/components/templates-table';

export const metadata: Metadata = { title: 'Kalite Şablonları' };
export const dynamic = 'force-dynamic';

export default async function QualityTemplatesPage() {
  await requirePermission('quality.inspect');
  const templates = await listTemplates();

  return (
    <>
      <PageHeader
        title="Kalite Şablonları"
        description={`${templates.length} şablon`}
        actions={<Button asChild><Link href="/kalite/sablonlar/yeni"><Plus className="size-4" /> Yeni Şablon</Link></Button>}
      />
      <TemplatesTable templates={templates} />
    </>
  );
}
