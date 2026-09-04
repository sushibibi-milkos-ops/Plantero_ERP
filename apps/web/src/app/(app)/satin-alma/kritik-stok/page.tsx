import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth';
import { listCriticalStock, listSuppliers } from '@/modules/purchasing/queries';
import { ReplenishmentPanel } from '@/modules/purchasing/components/replenishment-panel';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';

export const metadata: Metadata = { title: 'Kritik Stok' };
export const dynamic = 'force-dynamic';

export default async function CriticalStockPage() {
  const user = await requirePermission('purchasing.view');
  const [rows, suppliers] = await Promise.all([listCriticalStock(), listSuppliers()]);

  const critical = rows.filter((r) => r.risk === 'critical').length;
  const warning = rows.filter((r) => r.risk === 'warning').length;
  const neverEvaluated = rows.every((r) => !r.lastEvaluatedAt);

  return (
    <>
      <PageHeader
        title="Kritik Stok"
        description={`${rows.length} kural — kapsama süresi lead time altındaysa kritik, lead+güvenlik altındaysa uyarı`}
      />

      <KpiStripRow>
        <KpiCard variant="strip" title="Kritik" value={critical} format="int" />
        <KpiCard variant="strip" title="Uyarı" value={warning} format="int" />
        <KpiCard variant="strip" title="Toplam kural" value={rows.length} format="int" />
      </KpiStripRow>

      {neverEvaluated ? (
        <p className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[13px] text-foreground/80">
          Motor henüz çalıştırılmadı — kapsama süresi ve önerilen sipariş miktarları için &quot;Motoru çalıştır&quot;a basın (her gün 06:00&apos;da otomatik de çalışır).
        </p>
      ) : null}

      <ReplenishmentPanel rows={rows} canRun={userCan(user, 'purchasing.draft')} canManageRule={userCan(user, 'purchasing.approve')} suppliers={suppliers} />
    </>
  );
}
