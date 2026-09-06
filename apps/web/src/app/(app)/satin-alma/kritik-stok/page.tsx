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

      {/* Motor hiç çalışmamışsa 'Kritik'/'Uyarı' 0 DEĞİL '—' — 36/36 kuralın hiçbiri değerlendirilmemişken
          "0" basmak "risk yok" gibi okunuyordu (Tur 3 P0 tedarik-kritik-stok-06); 'Toplam kural' her
          zaman gerçek bir sayımdır (motor durumundan bağımsız), o yüzden hep sayı basar.
          Tur 9 P2 tedarik-kritik-stok-density-01 kök neden: ayrı amber şerit (h38 + 16px boşluk =
          54px) tabloyu aşağı itiyordu; aynı bilgi artık KPI kartlarının kendi `hint`ine indirgendi —
          ayrı bir satır/kutu YOK, tablo bir satır daha yukarı çıkar ("Motor hiç çalışmadı" kısa notu
          ayrıca DataTable'ın araç çubuğunda da tekrarlanır, bkz. replenishment-panel.tsx). */}
      <KpiStripRow>
        <KpiCard
          variant="strip"
          title="Kritik"
          value={neverEvaluated ? null : critical}
          format="int"
          hint={neverEvaluated ? 'Motor henüz çalıştırılmadı' : undefined}
        />
        <KpiCard
          variant="strip"
          title="Uyarı"
          value={neverEvaluated ? null : warning}
          format="int"
          hint={neverEvaluated ? 'Motor henüz çalıştırılmadı' : undefined}
        />
        <KpiCard variant="strip" title="Toplam kural" value={rows.length} format="int" />
      </KpiStripRow>

      <ReplenishmentPanel rows={rows} canRun={userCan(user, 'purchasing.draft')} canManageRule={userCan(user, 'purchasing.approve')} suppliers={suppliers} />
    </>
  );
}
