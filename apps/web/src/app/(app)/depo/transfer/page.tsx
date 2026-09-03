import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { listTransfers } from '@/modules/stock/queries';
import { TransfersTable } from '@/modules/stock/components/transfers-table';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { ZERO, D, toDb } from '@plantero/core';

export const metadata: Metadata = { title: 'Transfer' };
export const dynamic = 'force-dynamic';

export default async function TransfersPage() {
  const user = await requirePermission('stock.view');
  const transfers = await listTransfers();
  const inTransit = transfers.filter((t) => t.status === 'in_transit').length;
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const completedThisMonth = transfers.filter((t) => t.status === 'done' && t.createdAt.toISOString().slice(0, 7) === monthPrefix).length;
  const transferredValue = toDb(transfers.filter((t) => t.status !== 'cancelled').reduce((a, t) => a.plus(D(t.value)), ZERO));

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

      {/* Kardeş ekranlarla aynı KPI anatomisi — tek satır + geniş boşluktan ibaret görünmesin (Tur 2). */}
      <KpiStripRow>
        <KpiCard variant="strip" title="Yolda" value={inTransit} format="int" />
        <KpiCard variant="strip" title="Bu ay tamamlanan" value={completedThisMonth} format="int" />
        <KpiCard variant="strip" title="Transfer edilen değer" value={transferredValue} format="money" />
      </KpiStripRow>

      <TransfersTable transfers={transfers} />
    </>
  );
}
