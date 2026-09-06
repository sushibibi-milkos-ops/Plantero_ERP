import { db } from '@plantero/db';
import { SYSTEM_ACTOR } from '@plantero/core';
import { generateDueOrders } from '@plantero/core/maintenance/plans';

/**
 * Bakım planlayıcı (worker cron `maintenance-scheduler`, 05:00) — docs/modules/bakim.md §2.
 * Mantık `packages/core/src/maintenance/plans.ts::generateDueOrders`de (ARCHITECTURE §12: worker
 * yalnızca tetikler); vadesi `bugün + 3 gün` içine düşen her aktif periyodik plan için otomatik
 * `kind: 'preventive'`, `status: 'planned'` bakım iş emri açar. İdempotent: bir plan için zaten açık
 * bir iş emri varsa yenisi açılmaz (worker her gün tekrar çalışır, çift üretmez).
 */
export async function runMaintenanceScheduler(): Promise<Record<string, unknown>> {
  const result = await db.transaction((tx) => generateDueOrders(tx, SYSTEM_ACTOR));
  return { ...result };
}
