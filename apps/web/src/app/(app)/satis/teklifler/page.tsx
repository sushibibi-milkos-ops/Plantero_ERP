import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { listQuotations } from '@/modules/sales/queries';
import { SalesDocsTable } from '@/modules/sales/components/sales-docs-table';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Teklifler' };
export const dynamic = 'force-dynamic';

export default async function QuotationsPage() {
  const user = await requirePermission('sales.quote');
  const quotations = await listQuotations();
  const pending = quotations.filter((q) => q.status === 'sent').length;

  return (
    <>
      <PageHeader
        title="Teklifler"
        description={`${quotations.length} teklif · ${pending} yanıt bekliyor`}
        actions={userCan(user, 'sales.quote') ? (
          <Button asChild>
            <Link href="/satis/teklifler/yeni"><Plus className="size-4" /> Yeni teklif</Link>
          </Button>
        ) : undefined}
      />
      <SalesDocsTable rows={quotations} docType="quotation" />
    </>
  );
}
