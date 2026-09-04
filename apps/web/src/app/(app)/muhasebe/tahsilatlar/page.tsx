import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { listAccountingPayments } from '@/modules/accounting/queries';
import { PaymentsTable } from '@/modules/accounting/components/payments-table';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { D, ZERO } from '@plantero/core/money';

export const metadata: Metadata = { title: 'Tahsilatlar' };
export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  const user = await requirePermission('accounting.view');
  const rows = await listAccountingPayments();

  const posted = rows.filter((r) => r.status === 'posted');
  const inbound = posted.filter((r) => r.direction === 'inbound').reduce((a, r) => a.plus(D(r.amountTry)), ZERO);
  const outbound = posted.filter((r) => r.direction === 'outbound').reduce((a, r) => a.plus(D(r.amountTry)), ZERO);
  const unallocated = posted.reduce((a, r) => a.plus(D(r.unallocatedAmount)), ZERO);

  return (
    <>
      <PageHeader
        title="Tahsilatlar"
        description={`${rows.length} kayıt`}
        actions={
          userCan(user, 'accounting.post') ? (
            <Button asChild>
              <Link href="/muhasebe/tahsilatlar/yeni"><Plus className="size-4" /> Yeni tahsilat/ödeme</Link>
            </Button>
          ) : undefined
        }
      />

      {/* fractionDigits={2} (kritik bulgu muhasebe-faturalar-04 — kök neden, modül geneli): tüm
          muhasebe KPI şeritleri tek ondalık kuralına (2) sahip olmalı — bkz. /muhasebe/page.tsx. */}
      <KpiStripRow>
        <KpiCard variant="strip" title="Toplam tahsilat" value={inbound.toFixed(4)} format="money" fractionDigits={2} />
        <KpiCard variant="strip" title="Toplam ödeme" value={outbound.toFixed(4)} format="money" fractionDigits={2} />
        <KpiCard variant="strip" title="Tahsissiz (avans)" value={unallocated.toFixed(4)} format="money" fractionDigits={2} />
        <KpiCard variant="strip" title="Son 30 gün" value={posted.filter((r) => r.paymentDate >= new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)).length} format="int" />
      </KpiStripRow>

      <PaymentsTable rows={rows} canManage={userCan(user, 'accounting.post')} />
    </>
  );
}
