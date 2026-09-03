import { db } from '@plantero/db';
import { closeVatPeriod, currentClosablePeriod, SYSTEM_ACTOR } from '@plantero/core';

/**
 * Aylık KDV kapanışı (ARCHITECTURE.md §12, CLAUDE.md kural 8): bir önceki takvim ayını kapatır,
 * `vat_periods` satırını hesaplar ve 190/360 fişini `packages/core/src/accounting/vat.ts` (TEK
 * hesaplama/yazma noktası) üzerinden atar. İdempotent: dönem zaten kapatılmışsa yeniden fiş atmaz.
 */
export async function runVatMonthlyClose(): Promise<Record<string, unknown>> {
  const period = currentClosablePeriod();
  const result = await db.transaction((tx) => closeVatPeriod(tx, period, SYSTEM_ACTOR));
  return {
    period: result.period,
    outputVat: result.outputVat.toFixed(4),
    inputVat: result.inputVat.toFixed(4),
    carriedFromPrev: result.carriedFromPrev.toFixed(4),
    payable: result.payable.toFixed(4),
    carriedToNext: result.carriedToNext.toFixed(4),
    journalEntryId: result.journalEntryId ?? null,
    skipped: result.skipped ?? false,
  };
}
