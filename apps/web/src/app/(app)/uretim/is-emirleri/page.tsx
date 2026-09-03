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
          `hint`: delta null geldiğinde (Tur 2 bulgusu — seed verisindeki tüm iş emirleri son 7 gün
          içinde açıldığından "bir hafta önce" tabanı sıfır, pctChange() null döner) kart alt yarısı
          boş kalmasın diye bağlamsal bir ipucu gösterilir; `delta` doluysa `hint` yoksayılır (KpiCard). */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-h-[104px]">
        <KpiCard title="Açık iş emri" value={kpis.openCount} format="int" icon={<ListChecks strokeWidth={1.75} />} delta={kpis.openCountDelta ?? undefined} hint={kpis.openCountDelta === null ? `${kpis.inProgressCount} üretimde` : undefined} />
        <KpiCard title="Üretimde" value={kpis.inProgressCount} format="int" icon={<PlayCircle strokeWidth={1.75} />} delta={kpis.inProgressCountDelta ?? undefined} hint={kpis.inProgressCountDelta === null ? `${kpis.openCount} açık iş emri` : undefined} />
        <KpiCard title="Açık iş emri değeri" value={kpis.plannedValue} format="money" icon={<PackageCheck strokeWidth={1.75} />} delta={kpis.plannedValueDelta ?? undefined} invertDelta hint={kpis.plannedValueDelta === null ? 'geçmiş dönem verisi yok' : undefined} />
        <KpiCard title="Ortalama verim" value={kpis.avgYieldPct} format="pct" icon={<Percent strokeWidth={1.75} />} delta={kpis.avgYieldPctDelta ?? undefined} hint={kpis.avgYieldPctDelta === null ? 'son 30 gün' : undefined} />
      </div>

      <WorkOrdersTable workOrders={workOrders} />
    </>
  );
}
