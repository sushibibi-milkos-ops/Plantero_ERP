import { projectCashflow, refreshActuals, SCENARIOS, SYSTEM_ACTOR } from '@plantero/core';
import type { DbOrTx } from '../client.js';
import { log, type SeedSummary } from './_helpers.js';

/**
 * Nakit akışı projeksiyonunu (`cashflow_lines`, 36 ay × 3 senaryo) ve bütçe/nakit akışı
 * "gerçekleşen" alanlarını (`budget_lines.actual`, `cashflow_lines.actual*`) üretir.
 *
 * SIRALAMA: dizinin EN SONUNDA çalışır (`purchasing-backfill`'den bile sonra) — `refreshActuals`
 * muhasebedeki (posted yevmiye satırları) TÜM satış/alış/tahsilat/gider hareketlerini okur; bu veri
 * yalnızca `sales`, `stock`, `finance-payments`, `accounting-docs`, `bank`, `purchasing-backfill`
 * adımlarının hepsi bittikten sonra tamdır. `projectCashflow` ise yalnızca `finance` adımının
 * (Excel içe aktarımı: varsayımlar/kanal tablosu/kredi takvimi) sonucuna bağlıdır ama aynı adımda
 * kalması (tek transaction, idempotent, tek özet satırı) daha basit.
 *
 * İdempotent: `projectCashflow`/`refreshActuals` ikisi de upsert (onConflictDoUpdate) kullanır —
 * ikinci çalıştırmada aynı sonucu üretir, çift kayıt oluşturmaz.
 */
export async function seedFinanceProjections(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  log('finance-projections', '36 aylık nakit akışı projeksiyonu (3 senaryo)...');
  let lineCount = 0;
  for (const scenario of SCENARIOS) {
    const lines = await projectCashflow(tx, scenario, { persist: true });
    lineCount += lines.length;
  }
  summary.add('cashflow_lines', lineCount);

  log('finance-projections', 'bütçe + nakit akışı gerçekleşenleri (muhasebeden)...');
  const currentYear = new Date().getUTCFullYear();
  const result = await refreshActuals(tx, SYSTEM_ACTOR, { year: currentYear });
  summary.add('budget_lines_actualized', result.budgetLinesUpdated);
  summary.add('cashflow_lines_actualized', result.cashflowLinesUpdated);
}
