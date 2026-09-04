import type { Db } from '@plantero/db';
import { buildCandidates, listUnmatchedTransactions, persistAndApply, type ActorCtx, type ReconciliationMatchInput } from '@plantero/core';
import { matchBankTransaction, type ReconMatch } from './reconciliation.js';

/**
 * AI Mutabakat Ajanı — TEK orkestrasyon noktası (docs/modules/muhasebe.md §`/muhasebe/mutabakat`,
 * worker `reconciliation-nightly`).
 *
 * `packages/core` hiçbir AI paketini import etmez; bu yüzden "aday topla → skorla → kalıcılaştır/uygula"
 * döngüsü burada, `@plantero/ai` içinde yaşar ve üç çağıran da aynı fonksiyonu kullanır:
 *   - `apps/worker/src/jobs/reconciliationNightly.ts` (02:00 cron)
 *   - `apps/web/src/modules/accounting/actions.ts::runReconciliationAction` (/muhasebe/banka, /muhasebe/mutabakat)
 *   - `apps/web/src/modules/finance/actions.ts::runReconciliationAction` (/finans/banka)
 *
 * Skorlama `matchBankTransaction` (ANTHROPIC_API_KEY varsa AI + kural, yoksa yalnızca kural tabanlı,
 * deterministik). Kalıcılaştırma/otomatik uygulama `packages/core/src/accounting/reconciliation.ts::
 * persistAndApply` (güven ≥0.92 VE tek aday ⇒ auto_applied → tahsilat/ödeme ya da gider/kredi fişi;
 * aksi halde suggested → sabah onay ekranı). `finance/bankReconciliation.ts::runReconciliation` yalnızca
 * fatura eşleştiren kural tabanlı eski motordur; canlı yollar artık onu ÇAĞIRMAZ (seed backfill'i hariç).
 *
 * Her banka hareketi kendi transaction'ında işlenir: bir hareketin uygulanması hata verirse (ör. kapalı
 * dönem, zaten ödenmiş taksit) diğerleri etkilenmez; hata sayılır ve sonuçta raporlanır.
 */

export type AiReconciliationOpts = { bankAccountId?: string; importId?: string; since?: string | Date };

export type AiReconciliationResult = {
  evaluated: number;
  suggested: number;
  autoApplied: number;
  /** Aday bulunamayan (hâlâ `unmatched` kalan) hareketler */
  unresolved: number;
  failed: number;
  errors: Array<{ bankTransactionId: string; message: string }>;
};

function toMatchInput(m: ReconMatch): ReconciliationMatchInput {
  return {
    kind: m.kind,
    partnerId: m.partnerId ?? null,
    invoiceIds: m.invoiceIds,
    allocations: m.allocations,
    loanInstallmentId: m.loanInstallmentId ?? null,
    expenseAccountCode: m.expenseAccountCode ?? null,
    confidence: m.confidence,
    rationale: m.rationale,
    features: m.features,
    source: m.source,
  };
}

/** Eşleşmemiş (`unmatched`) hareketleri tarar; her biri için aday toplar, skorlar, kalıcılaştırır/uygular. */
export async function runAiReconciliation(database: Db, opts: AiReconciliationOpts, ctx: ActorCtx): Promise<AiReconciliationResult> {
  const unmatched = await listUnmatchedTransactions(database, opts);
  const result: AiReconciliationResult = { evaluated: 0, suggested: 0, autoApplied: 0, unresolved: 0, failed: 0, errors: [] };

  for (const bt of unmatched) {
    result.evaluated++;
    try {
      const outcome = await database.transaction(async (tx) => {
        const candidates = await buildCandidates(tx, bt.id);
        const matches = await matchBankTransaction(candidates.tx, candidates);
        return persistAndApply(tx, bt.id, matches.map(toMatchInput), ctx);
      });
      if (outcome.applied) result.autoApplied++;
      else if (outcome.suggestedCount > 0) result.suggested++;
      else result.unresolved++;
    } catch (err) {
      result.failed++;
      result.errors.push({ bankTransactionId: bt.id, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}
