import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { listReceipts } from '@/modules/stock/queries';
import { ReceiptsTable } from '@/modules/stock/components/receipts-table';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { ZERO, D, toDb } from '@plantero/core';

export const metadata: Metadata = { title: 'Mal Kabul' };
export const dynamic = 'force-dynamic';

export default async function ReceiptsPage() {
  const user = await requirePermission('stock.view');
  const receipts = await listReceipts();
  const pending = receipts.filter((r) => r.status === 'qc_pending').length;
  const distinctWarehouses = Array.from(new Set(receipts.map((r) => r.warehouseCode)));
  const warehouseSuffix = distinctWarehouses.length === 1 ? ` · ${distinctWarehouses[0]}` : '';

  // Kardeş ekranlarla (sayım, transfer, stok, sevkiyat, SKT) aynı KPI anatomisi — mal kabul tek başına
  // hiç KPI şeridi göstermiyordu, modül içi header kalıbı tutarsızdı (Tur 3 P2 bulgusu). "Kalite
  // bekleyen" zaten hesaplanıyordu; "bu ay kabul edilen tutar" ve "ortalama kabul süresi" eklendi.
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const receivedThisMonth = receipts.filter((r) => r.receivedAt && r.receivedAt.toISOString().slice(0, 7) === monthPrefix);
  const receivedThisMonthValue = toDb(receivedThisMonth.reduce((a, r) => a.plus(D(r.totalValue)), ZERO));
  const leadTimes = receipts
    .filter((r) => r.receivedAt)
    .map((r) => (r.receivedAt!.getTime() - r.createdAt.getTime()) / 3_600_000);
  const avgLeadTimeHours = leadTimes.length ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : null;

  return (
    <>
      <PageHeader
        title="Mal Kabul"
        description={`${receipts.length} belge${warehouseSuffix}${pending ? ` · ${pending} kalite bekliyor` : ''}`}
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

      <KpiStripRow>
        <KpiCard variant="strip" title="Kalite bekleyen" value={pending} format="int" />
        <KpiCard variant="strip" title="Bu ay kabul edilen tutar" value={receivedThisMonthValue} format="money" />
        <KpiCard variant="strip" title="Ortalama kabul süresi" value={avgLeadTimeHours ?? 0} format="qty" suffix="sa" hint={avgLeadTimeHours === null ? 'Henüz kabul edilen belge yok' : undefined} />
      </KpiStripRow>

      <ReceiptsTable receipts={receipts} />
    </>
  );
}
