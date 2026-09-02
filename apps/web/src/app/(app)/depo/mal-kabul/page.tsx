import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { listReceipts } from '@/modules/stock/queries';
import { ReceiptsTable } from '@/modules/stock/components/receipts-table';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Mal Kabul' };
export const dynamic = 'force-dynamic';

export default async function ReceiptsPage() {
  const user = await requirePermission('stock.view');
  const receipts = await listReceipts();
  const pending = receipts.filter((r) => r.status === 'qc_pending').length;

  return (
    <>
      <PageHeader
        title="Mal Kabul"
        description={`${receipts.length} belge${pending ? ` · ${pending} kalite bekliyor` : ''}`}
        actions={
          userCan(user, 'stock.receive') ? (
            <Button asChild>
              <Link href="/depo/mal-kabul/yeni">
                <Plus className="size-4" /> Yeni mal kabul
              </Link>
            </Button>
          ) : undefined
        }
      />
      <ReceiptsTable receipts={receipts} />
    </>
  );
}
