import { db } from '@plantero/db';
import { businessDate } from '@plantero/core/dates';
import { recomputeOeeForDay } from '@plantero/core/maintenance/oee';

/**
 * Günlük OEE hesaplama (worker cron `oee-daily`, 23:30) — docs/modules/bakim.md §4.
 * Hesap `packages/core/src/production/yield.ts::computeLineOeeForDay`de (üretim modülü `/uretim/hatlar`
 * canlı gösterim için zaten yazmıştı); bu job yalnızca GÜNÜN SONUNDA (23:30, gün büyük ölçüde
 * tamamlanmışken) o günün sonucunu `oee_records`'a KALICI olarak yazar (`packages/core/src/maintenance/oee.ts`)
 * — `/bakim/oee` trend grafiği ve duruş pareto'su bu kalıcı kayıtlardan beslenir.
 */
export async function runOeeDaily(): Promise<Record<string, unknown>> {
  const today = businessDate(new Date());
  const rows = await db.transaction((tx) => recomputeOeeForDay(tx, today));
  return { day: today, linesComputed: rows.length, records: rows };
}
