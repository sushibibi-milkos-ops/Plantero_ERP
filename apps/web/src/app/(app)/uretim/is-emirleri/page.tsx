import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, ListChecks, PlayCircle, PackageCheck, Percent } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { listWorkOrders, getWorkOrderKpis } from '@/modules/production/queries';
import { WorkOrdersTable } from '@/modules/production/components/work-orders-table';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
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

      {/* min-h-[104px]: iki satıra sarabilen başlıklarda (ör. "Açık iş emri değeri" 2 sütunlu mobil
          ızgarada) kart yüksekliği sabitlenir, komşu kartla değer taban çizgisi kaymaz.
          `hint`: yalnızca delta yokken ve gerçekten yeni bilgi taşıyorsa gösterilir — eskiden iki
          kart birbirinin birincil değerini tekrar ediyordu ("Açık iş emri 4 / 1 üretimde" ↔
          "Üretimde 1 / 4 açık iş emri", sıfır yeni bilgi) ve diğer ikisinde "geçmiş dönem verisi
          yok"/"son 30 gün" gibi dolgu metin vardı — Stripe'ta ikincil satır ya karşılaştırma
          deltasıdır ya hiç yoktur (Tur 3 bulgusu, P1). */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-h-[104px]">
        <KpiCard title="Açık iş emri" value={kpis.openCount} format="int" icon={<ListChecks strokeWidth={1.75} />} delta={kpis.openCountDelta ?? undefined} hint={kpis.openCountDelta === null ? (kpis.overdueCount > 0 ? `${kpis.overdueCount} gecikmiş` : 'gecikme yok') : undefined} />
        <KpiCard title="Üretimde" value={kpis.inProgressCount} format="int" icon={<PlayCircle strokeWidth={1.75} />} delta={kpis.inProgressCountDelta ?? undefined} hint={kpis.inProgressCountDelta === null ? `${kpis.runningLines}/${kpis.totalLines} hatta çalışıyor` : undefined} />
        <KpiCard title="Açık iş emri değeri" value={kpis.plannedValue} format="money" icon={<PackageCheck strokeWidth={1.75} />} delta={kpis.plannedValueDelta ?? undefined} invertDelta />
        <KpiCard title="Ortalama verim" value={kpis.avgYieldPct} format="pct" icon={<Percent strokeWidth={1.75} />} delta={kpis.avgYieldPctDelta ?? undefined} />
      </div>

      <WorkOrdersTable workOrders={workOrders} />
    </>
  );
}
