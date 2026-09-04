import { and, asc, eq, inArray } from 'drizzle-orm';
import { projectCashflow, refreshActuals, SCENARIOS, SYSTEM_ACTOR } from '@plantero/core';
import type { DbOrTx } from '../client.js';
import { invoices } from '../schema/index.js';
import { log, type SeedSummary } from './_helpers.js';

/**
 * `/finans/tahsilat-takibi` P1 bulgusu (Tur 2): canlı veritabanında hiçbir fatura vadesi geçmiş
 * (unpaid + due_date < bugün) kalmıyordu — "Taslak oluştur → Onayla ve gönder → dunningLevel 1"
 * akışı bu yüzden uçtan uca doğrulanamıyordu. Kök neden çevresel: seed'in ürettiği satış faturaları
 * hep "bugünden sonra" vadeli (Excel/senaryo verisi bu şekilde). `invoices` tablosu sales/finance
 * modülleri ARASINDA paylaşılan ana veri olduğundan (şema dondurulmuş, satır INSERT etmiyoruz —
 * yalnızca iki mevcut faturanın vade tarihini test amaçlı geçmişe çekiyoruz) bu adım kasıtlı olarak
 * dizinin EN SONUNDA (sales/bank'tan sonra, faturalar zaten var) çalışır. docNo'ya göre deterministik
 * seçim + SABİT hedef tarih ⇒ idempotent (her çalıştırmada aynı iki fatura, aynı tarihe ayarlanır).
 */
async function seedOverdueDunningDemo(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  const candidates = await tx
    .select({ id: invoices.id, docNo: invoices.docNo })
    .from(invoices)
    .where(and(eq(invoices.kind, 'sales'), inArray(invoices.status, ['posted', 'partially_paid'])))
    .orderBy(asc(invoices.docNo))
    .limit(2);
  if (candidates.length === 0) {
    log('finance-projections', 'tahsilat takibi demo verisi: uygun satış faturası bulunamadı, atlanıyor.');
    return;
  }
  const targetDueDates = ['2026-08-01', '2026-08-22'];
  for (const [i, c] of candidates.entries()) {
    await tx.update(invoices).set({ dueDate: targetDueDates[i] ?? targetDueDates[targetDueDates.length - 1]! }).where(eq(invoices.id, c.id));
  }
  log('finance-projections', `tahsilat takibi demo verisi: ${candidates.map((c) => c.docNo).join(', ')} vadesi geçmişe çekildi.`);
  summary.add('dunning_demo_overdue_invoices', candidates.length);
}

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

  log('finance-projections', 'tahsilat takibi demo verisi (vadesi geçmiş faturalar)...');
  await seedOverdueDunningDemo(tx, summary);
}
