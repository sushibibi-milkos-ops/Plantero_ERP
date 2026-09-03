import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { listPayments, getPaymentKpis } from '@/modules/finance/queries';
import { PaymentsTable } from '@/modules/finance/components/payments-table';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';

export const metadata: Metadata = { title: 'Tahsilat / Ödeme' };
export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  const user = await requirePermission('finance.view');
  const [payments, kpis] = await Promise.all([listPayments(), getPaymentKpis()]);

  return (
    <>
      <PageHeader
        title="Tahsilat / Ödeme"
        description={`${payments.length} kayıt · son 30 günde ${kpis.last30dCount}`}
        actions={
          userCan(user, 'finance.manage') ? (
            <Button asChild>
              <Link href="/finans/tahsilat/yeni">
                <Plus className="size-4" /> Yeni tahsilat/ödeme
              </Link>
            </Button>
          ) : undefined
        }
      />

      <KpiStripRow>
        <KpiCard variant="strip" title="Açık alacak" value={kpis.openReceivableTry} format="money" />
        <KpiCard variant="strip" title="Açık borç" value={kpis.openPayableTry} format="money" />
        <KpiCard variant="strip" title="Toplam tahsilat" value={kpis.totalInboundTry} format="money" />
        <KpiCard variant="strip" title="Toplam ödeme" value={kpis.totalOutboundTry} format="money" />
      </KpiStripRow>

      <PaymentsTable payments={payments} />
    </>
  );
}
