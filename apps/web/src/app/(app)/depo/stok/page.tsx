import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listStockRows, getStockKpis } from '@/modules/stock/queries';
import { StockTable } from '@/modules/stock/components/stock-table';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';

export const metadata: Metadata = { title: 'Stok' };
export const dynamic = 'force-dynamic';

export default async function StockPage() {
  await requirePermission('stock.view');
  const [rows, kpis] = await Promise.all([listStockRows(), getStockKpis()]);
  const criticalCount = rows.filter((r) => r.isCritical).length;
  // Depo bilgisi tabloda tek değerse (204/204 kayıt TIRE'de) sütun kaldırılır (bkz. StockTable) —
  // bilgi kaybolmasın diye başlığa taşınır.
  const distinctWarehouses = Array.from(new Set(rows.map((r) => r.warehouseCode)));
  const warehouseSuffix = distinctWarehouses.length === 1 ? ` · ${distinctWarehouses[0]}` : '';

  return (
    <>
      <PageHeader
        title="Stok"
        description={`${rows.length} ürün × depo satırı${warehouseSuffix}${criticalCount ? ` · ${criticalCount} kritik seviyede` : ''}`}
      />

      <KpiStripRow>
        <KpiCard variant="strip" title="Toplam envanter değeri" value={kpis.totalValue} format="money" />
        <KpiCard variant="strip" title="Hammadde/ambalaj değeri" value={kpis.rawValue} format="money" />
        <KpiCard variant="strip" title="Mamul değeri" value={kpis.finishedValue} format="money" />
        <KpiCard variant="strip" title="Karantinada" value={kpis.quarantineValue} format="money" />
        <KpiCard variant="strip" title="30 gün içinde SKT" value={kpis.expiringValue30} format="money" />
        <KpiCard variant="strip" title="Rezerve değeri" value={kpis.reservedValue} format="money" />
      </KpiStripRow>

      <StockTable rows={rows} />
    </>
  );
}
