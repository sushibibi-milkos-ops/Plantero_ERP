import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { listTransfers } from '@/modules/stock/queries';
import { TransfersTable } from '@/modules/stock/components/transfers-table';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Transfer' };
export const dynamic = 'force-dynamic';

export default async function TransfersPage() {
  const user = await requirePermission('stock.view');
  const transfers = await listTransfers();
  const inTransit = transfers.filter((t) => t.status === 'in_transit').length;

  return (
    <>
      <PageHeader
        title="Transfer"
        description={`${transfers.length} transfer${inTransit ? ` · ${inTransit} yolda` : ''}`}
        actions={
          userCan(user, 'stock.transfer') ? (
            <Button asChild>
              <Link href="/depo/transfer/yeni">
                <Plus className="size-4" /> Yeni transfer
              </Link>
            </Button>
          ) : undefined
        }
      />
      <TransfersTable transfers={transfers} />
    </>
  );
}
