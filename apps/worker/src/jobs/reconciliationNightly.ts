import { db } from '@plantero/db';
import { SYSTEM_ACTOR } from '@plantero/core';
import { runAiReconciliation } from '@plantero/ai';

/**
 * Gece mutabakat ajanı (cron 02:00, `apps/worker/src/queues.ts`): eşleşmemiş banka hareketlerini
 * `@plantero/ai::runAiReconciliation` — web ekranlarıyla (`/muhasebe/mutabakat`, `/muhasebe/banka`,
 * `/finans/banka`) PAYLAŞILAN tek orkestrasyon — üzerinden değerlendirir:
 *   aday topla (`buildCandidates`) → skorla (`matchBankTransaction`: AI varsa AI+kural, yoksa kural)
 *   → kalıcılaştır/uygula (`persistAndApply`: güven ≥0.92 VE tek aday ⇒ auto_applied, aksi halde suggested).
 *
 * Otomatik uygulanan her eşleşme aynı transaction'da gerçek bir tahsilat/ödeme (`recordPayment`) ya da
 * gider/kredi taksiti fişi (`postJournalEntry`/`postLoanInstallmentPayment`) üretir ve
 * `bank_transactions.status`'u 'matched' yapar (I11/I29). Onay bekleyenler sabah `/muhasebe/mutabakat`
 * ekranında listelenir. Bir hareketin uygulanması hata verirse diğerleri etkilenmez (hata sayılır).
 *
 * (I29 geçmişi) Daha önce burada `payment_id`'siz `auto_applied` satırı ekleyen ayrı bir yol vardı; sonra
 * geçici olarak `finance/bankReconciliation.ts::runReconciliation` (yalnızca fatura, kural tabanlı)
 * bağlandı. Muhasebe modülüyle birlikte canlı akış tek motora indirgendi — bkz. `reconciliationRunner.ts`.
 */
export async function runReconciliationNightly(): Promise<Record<string, unknown>> {
  const result = await runAiReconciliation(db, {}, SYSTEM_ACTOR);
  return {
    evaluated: result.evaluated,
    suggested: result.suggested,
    autoApplied: result.autoApplied,
    unresolved: result.unresolved,
    failed: result.failed,
    errors: result.errors,
    note: 'Otomatik uygulanan (auto_applied) her eşleşme gerçek bir tahsilat/ödeme ya da fiş üretti; onay bekleyenler /muhasebe/mutabakat ekranında listelenir.',
  };
}
