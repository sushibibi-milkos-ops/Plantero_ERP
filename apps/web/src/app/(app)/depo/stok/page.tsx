import type { Metadata } from 'next';
import { Boxes, Wheat, PackageCheck as PackageCheckIcon, Beaker, CalendarClock, Lock } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { listStockRows, getStockKpis } from '@/modules/stock/queries';
import { StockTable } from '@/modules/stock/components/stock-table';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';

export const metadata: Metadata = { title: 'Stok' };
export const dynamic = 'force-dynamic';

export default async function StockPage() {
  await requirePermission('stock.view');
  const [rows, kpis] = await Promise.all([listStockRows(), getStockKpis()]);
  const criticalCount = rows.filter((r) => r.isCritical).length;

  return (
    <>
      <PageHeader
        title="Stok"
        description={`${rows.length} ürün × depo satırı${criticalCount ? ` · ${criticalCount} kritik seviyede` : ''}`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard title="Toplam envanter değeri" value={kpis.totalValue} format="money" icon={<Boxes strokeWidth={1.75} />} />
        <KpiCard title="Hammadde/ambalaj değeri" value={kpis.rawValue} format="money" icon={<Wheat strokeWidth={1.75} />} />
        <KpiCard title="Mamul değeri" value={kpis.finishedValue} format="money" icon={<PackageCheckIcon strokeWidth={1.75} />} />
        <KpiCard title="Karantinada" value={kpis.quarantineValue} format="money" icon={<Beaker strokeWidth={1.75} />} />
        <KpiCard title="30 gün içinde SKT" value={kpis.expiringValue30} format="money" icon={<CalendarClock strokeWidth={1.75} />} />
        <KpiCard title="Rezerve değeri" value={kpis.reservedValue} format="money" icon={<Lock strokeWidth={1.75} />} />
      </div>

      <StockTable rows={rows} />
    </>
  );
}
