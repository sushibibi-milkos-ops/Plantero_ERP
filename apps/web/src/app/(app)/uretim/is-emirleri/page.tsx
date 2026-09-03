import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { listWorkOrders, getWorkOrderKpis } from '@/modules/production/queries';
import { WorkOrdersTable } from '@/modules/production/components/work-orders-table';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'İş Emirleri' };
export const dynamic = 'force-dynamic';

export default async function WorkOrdersPage() {
  const user = await requirePermission('production.view');
  const [workOrders, kpis] = await Promise.all([listWorkOrders(), getWorkOrderKpis()]);

  return (
    <>
      <PageHeader
        title="İş Emirleri"
        description={`${workOrders.length} iş emri`}
        actions={
          userCan(user, 'production.plan') ? (
            <Button asChild>
              <Link href="/uretim/is-emirleri/yeni">
                <Plus className="size-4" /> Yeni iş emri
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* `strip` varyant: depo/stok, depo/mal-kabul, depo/sayim, depo/sevkiyat, depo/transfer,
          depo/skt ve satis/net-ciro ile aynı Stripe kalıbı — çerçevesiz, 80px, dikey hairline
          ayraçlı (masaüstü), 140×72 yatay snap şeridi (mobil). Üretim modülü eskiden tek başına
          134px'lik kutulu `card` varyantında kalmıştı (Tur 4 bulgusu, P1).
          `hint`: yalnızca delta yokken ve gerçekten yeni bilgi taşıyorsa gösterilir — eskiden iki
          kart birbirinin birincil değerini tekrar ediyordu ("Açık iş emri 4 / 1 üretimde" ↔
          "Üretimde 1 / 4 açık iş emri", sıfır yeni bilgi) ve diğer ikisinde "geçmiş dönem verisi
          yok"/"son 30 gün" gibi dolgu metin vardı — Stripe'ta ikincil satır ya karşılaştırma
          deltasıdır ya hiç yoktur (Tur 3 bulgusu, P1). */}
      <KpiStripRow>
        <KpiCard variant="strip" title="Açık iş emri" value={kpis.openCount} format="int" delta={kpis.openCountDelta ?? undefined} hint={kpis.openCountDelta === null ? (kpis.overdueCount > 0 ? `${kpis.overdueCount} gecikmiş` : 'gecikme yok') : undefined} />
        <KpiCard variant="strip" title="Üretimde" value={kpis.inProgressCount} format="int" delta={kpis.inProgressCountDelta ?? undefined} hint={kpis.inProgressCountDelta === null ? `${kpis.runningLines}/${kpis.totalLines} hatta çalışıyor` : undefined} />
        <KpiCard variant="strip" title="Açık iş emri değeri" value={kpis.plannedValue} format="money" delta={kpis.plannedValueDelta ?? undefined} invertDelta />
        <KpiCard variant="strip" title="Ortalama verim" value={kpis.avgYieldPct} format="pct" delta={kpis.avgYieldPctDelta ?? undefined} />
      </KpiStripRow>

      <WorkOrdersTable workOrders={workOrders} />
    </>
  );
}
