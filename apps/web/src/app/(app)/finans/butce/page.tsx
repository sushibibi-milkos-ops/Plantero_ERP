import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { getBudgetOverview, getBudgetSummaryByKind } from '@/modules/finance/budget-queries';
import { BudgetPanel, RefreshActualsButton } from '@/modules/finance/components/budget-panel';
import { EmptyState } from '@/components/empty-state';

export const metadata: Metadata = { title: 'Bütçe' };
export const dynamic = 'force-dynamic';

export default async function BudgetPage() {
  const user = await requirePermission('finance.view');
  const year = new Date().getUTCFullYear();
  const [overview, summary] = await Promise.all([getBudgetOverview(year), getBudgetSummaryByKind(year)]);

  const revenueLines = overview.lines.filter((l) => l.kind === 'revenue');
  const expenseLines = overview.lines.filter((l) => l.kind === 'fixed_expense');
  const plannedRevenue = revenueLines.reduce((acc, l) => acc + Number(l.planned), 0);
  const actualRevenue = revenueLines.reduce((acc, l) => acc + Number(l.actual), 0);
  const plannedExpense = expenseLines.reduce((acc, l) => acc + Number(l.planned), 0);
  const actualExpense = expenseLines.reduce((acc, l) => acc + Number(l.actual), 0);
  // Kriter 4 kök neden düzeltmesi (Tur 6, P1 — finans-butce-14): plan 12 AYLIK, gerçekleşen ise
  // yıl içindeki dolan aya kadarki (YTD) tutar — erken evrede (ör. %3,6 gerçekleşme) delta yapısal
  // olarak −%90'ların üzerinde çıkar. "Gerçekleşen ciro" (invertDelta YOK) bunu kırmızı basıyor,
  // "Gerçekleşen sabit gider" (invertDelta VAR) ise AYNI veri boşluğunu YEŞİL "başarı" olarak basıyor
  // — oysa ikisi de "henüz karşılaştırılabilir gerçekleşen veri yok" demek, "gider kontrolü mükemmel"
  // değil. Gerçekleşme oranı karşılaştırılabilir bir pencereyi yansıtmayacak kadar düşükken (<%20)
  // delta rozetini nötr'e (`delta=null` → KpiCard "—" basar, renk yok) düşürüyoruz — böylece aynı
  // veri boşluğu her iki KPI'da da aynı (renksiz) sinyali verir.
  const REALIZATION_COMPARABLE_THRESHOLD = 0.2;
  const revenueRealizedRatio = plannedRevenue > 0 ? actualRevenue / plannedRevenue : 0;
  const expenseRealizedRatio = plannedExpense > 0 ? actualExpense / plannedExpense : 0;
  const revenueDelta = plannedRevenue > 0 && revenueRealizedRatio >= REALIZATION_COMPARABLE_THRESHOLD ? ((actualRevenue - plannedRevenue) / plannedRevenue) * 100 : null;
  const expenseDelta = plannedExpense > 0 && expenseRealizedRatio >= REALIZATION_COMPARABLE_THRESHOLD ? ((actualExpense - plannedExpense) / plannedExpense) * 100 : null;

  return (
    <>
      <PageHeader
        title="Bütçe"
        description={`${year} bütçesi — plan vs gerçekleşen (${overview.name ?? 'bütçe tanımlı değil'})`}
        actions={userCan(user, 'finance.manage') ? <RefreshActualsButton year={year} /> : null}
      />

      {overview.budgetId === null ? (
        <EmptyState title={`${year} için bütçe tanımlı değil`} description="Bütçe seed adımı çalıştırılmadıysa veya farklı bir yıl seçilmesi gerekiyorsa kontrol edin." />
      ) : (
        <>
          <KpiStripRow>
            <KpiCard variant="strip" title="Planlanan ciro" value={plannedRevenue.toFixed(2)} format="money" />
            <KpiCard variant="strip" title="Gerçekleşen ciro" value={actualRevenue.toFixed(2)} format="money" delta={revenueDelta} deltaLabel="plana göre" />
            <KpiCard variant="strip" title="Planlanan sabit gider" value={plannedExpense.toFixed(2)} format="money" />
            <KpiCard variant="strip" title="Gerçekleşen sabit gider" value={actualExpense.toFixed(2)} format="money" delta={expenseDelta} deltaLabel="plana göre" invertDelta />
          </KpiStripRow>
          <BudgetPanel lines={overview.lines} summary={summary} />
        </>
      )}
    </>
  );
}
