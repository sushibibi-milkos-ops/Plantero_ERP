import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth';
import { listCounts, listWarehouses, listLocations } from '@/modules/stock/queries';
import { CountsTable } from '@/modules/stock/components/counts-table';
import { CreateCountDialog } from '@/modules/stock/components/create-count-dialog';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { NextStepHint } from '@/components/next-step-hint';
import { ZERO, D, toDb } from '@plantero/core';

export const metadata: Metadata = { title: 'Sayım' };
export const dynamic = 'force-dynamic';

export default async function CountsPage() {
  const user = await requirePermission('stock.count');
  const [counts, warehouses, locations] = await Promise.all([listCounts(), listWarehouses(), listLocations()]);
  const active = counts.filter((c) => !['posted', 'cancelled'].includes(c.status)).length;
  // varianceValue işaretli (fazla/eksik) — |fark| toplamı gösterilir, birbirini götürmesin diye.
  const totalVarianceValue = toDb(counts.reduce((a, c) => a.plus(D(c.varianceValue).abs()), ZERO));
  // Az kayıtlı listelerde (≤5) dar bir içerik kabı kullanılır (Tur 4 P2 bulgusu: 1 sayımda geniş
  // tablo altında ~950px boşluk kalıyordu). Kök neden (Tur 5 P1 bulgusu): önceki sürüm bu dalda KPI
  // şeridini de GİZLİYORDU — yani az kayıtta hem sinyal (KPI) hem alan kullanımı azaltılıyordu, ters
  // yön: 1440×900'de içerik 470px'te bitip altında ~950px öksüz boşluk kalıyordu (yoğunluk kriteri
  // 5/2). Artık az kayıtta da KPI şeridi TUTULUR (yalnızca en yönlendirici iki metrik — "Toplam
  // sayım" tabloda zaten görünür bir sayı olduğundan bu daralmış görünümde tekrarlanmaz), yalnızca
  // kap daraltılır.
  const isSparse = counts.length <= 5;

  return (
    <div className={isSparse ? 'max-w-3xl' : undefined}>
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
        {!isSparse ? <KpiCard variant="strip" title="Toplam sayım" value={counts.length} format="int" /> : null}
      </KpiStripRow>

      <CountsTable counts={counts} />
      {isSparse ? (
        <NextStepHint
          action={
            userCan(user, 'stock.count') ? (
              <CreateCountDialog
                warehouses={warehouses}
                locations={locations.map((l) => ({ id: l.id, code: l.code, usage: l.usage, warehouseId: l.warehouseId }))}
                trigger={
                  <button type="button" className="shrink-0 font-medium text-primary hover:underline">
                    + Yeni sayım
                  </button>
                }
              />
            ) : undefined
          }
        >
          Depo ya da lokasyon bazında yeni bir sayım oturumu başlatarak fiziksel stok doğrulaması yapabilirsiniz.
        </NextStepHint>
      ) : null}
    </div>
  );
}
