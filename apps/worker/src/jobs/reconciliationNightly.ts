import { db } from '@plantero/db';
import { runReconciliation, SYSTEM_ACTOR } from '@plantero/core';

/**
 * Gece mutabakat ajanı (cron 02:00, `apps/worker/src/queues.ts`): eşleşmemiş banka hareketlerini
 * `packages/core/src/finance/bankReconciliation.ts::runReconciliation` — `reconciliation_matches` /
 * `bank_transactions` yazan TEK gerçek akış — üzerinden değerlendirir.
 *
 * (I29, tur 10 P0 düzeltmesi) Daha önce burada ayrı, uyumsuz bir yol vardı: `packages/ai`
 * `matchBankTransaction` ile güven ≥0.92 sonuçlar için doğrudan `reconciliation_matches` satırı
 * `status:'auto_applied'` ile ekleniyor ama `recordPayment` hiç çağrılmıyordu (payment_id her zaman
 * NULL) ve `bank_transactions.status` her zaman 'suggested' bırakılıyordu (autoOk olsa bile) —
 * tüketicisi olmayan bir `approvals(kind='reconciliation')` satırı ekleniyordu. `runReconciliation`
 * zaten aynı eşiği (güven ≥0.92 VE tek aday) kural tabanlı skorlamayla uyguluyor; otomatik uygulanan
 * her eşleşme `applyInvoiceAllocation` → `recordPayment` ile gerçek bir tahsilat/ödeme + muhasebe fişi
 * üretir ve `bank_transactions.status`'u 'matched' yapar (I11/I29 bunu doğrular). `packages/ai`
 * entegrasyonu bu modülün kapsamı dışında bırakıldı — bkz. `bankReconciliation.ts` dosya başı yorumu.
 */
export async function runReconciliationNightly(): Promise<Record<string, unknown>> {
  const result = await db.transaction((tx) => runReconciliation(tx, {}, SYSTEM_ACTOR));
  return {
    evaluated: result.evaluated,
    suggested: result.suggested,
    autoApplied: result.autoApplied,
    note: 'Otomatik uygulanan (auto_applied) her eşleşme runReconciliation → recordPayment ile gerçek bir tahsilat/ödeme fişi üretti; onay bekleyenler /muhasebe/mutabakat ekranında listelenir.',
  };
}
