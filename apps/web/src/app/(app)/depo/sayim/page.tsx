import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth';
import { listCounts, listWarehouses, listLocations } from '@/modules/stock/queries';
import { CountsTable } from '@/modules/stock/components/counts-table';
import { CreateCountDialog } from '@/modules/stock/components/create-count-dialog';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { ZERO, D, toDb } from '@plantero/core';

export const metadata: Metadata = { title: 'Sayım' };
export const dynamic = 'force-dynamic';

export default async function CountsPage() {
  const user = await requirePermission('stock.count');
  const [counts, warehouses, locations] = await Promise.all([listCounts(), listWarehouses(), listLocations()]);
  const active = counts.filter((c) => !['posted', 'cancelled'].includes(c.status)).length;
  // varianceValue işaretli (fazla/eksik) — |fark| toplamı gösterilir, birbirini götürmesin diye.
  const totalVarianceValue = toDb(counts.reduce((a, c) => a.plus(D(c.varianceValue).abs()), ZERO));

  return (
    <>
      <PageHeader
        title="Sayım"
        description={`${counts.length} sayım oturumu${active ? ` · ${active} aktif` : ''}`}
        actions={userCan(user, 'stock.count') ? <CreateCountDialog warehouses={warehouses} locations={locations.map((l) => ({ id: l.id, code: l.code, usage: l.usage, warehouseId: l.warehouseId }))} /> : undefined}
      />

      {/* Kardeş ekranlarla aynı KPI anatomisi (Tur 2 bulgusu: tek kayıtlı sayfa hiç yönlendirici sinyal
          taşımıyordu). "Son sayım tarihi" yerine "Toplam sayım": KpiCard/NumberFlow sayısal değer
          bekler, ham tarih metnini bu bileşende göstermenin temiz bir yolu yok — sayım tarihi zaten
          tablonun kendi sütununda görünür. */}
      <KpiStripRow>
        <KpiCard variant="strip" title="Açık oturum" value={active} format="int" />
        <KpiCard variant="strip" title="Toplam fark değeri" value={totalVarianceValue} format="money" />
        <KpiCard variant="strip" title="Toplam sayım" value={counts.length} format="int" />
      </KpiStripRow>

      <CountsTable counts={counts} />
    </>
  );
}
