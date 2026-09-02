import { and, eq, lte } from 'drizzle-orm';
import { db, maintenancePlans } from '@plantero/db';

/**
 * Bakım planlayıcı — iskelet.
 * TODO: core bağlanacak — bakım modülü için `packages/core/src/maintenance/*.ts` servisi hazır
 * olduğunda, vadesi gelen (`nextDueAt <= bugün`) her plan için otomatik `maintenance_orders`
 * kaydı (MO-YYYY-NNNNNN, `nextDocNo` ile) burada açılacak. Şimdilik yalnızca vadesi gelen plan
 * sayısını okuyup raporluyoruz.
 */
export async function runMaintenanceScheduler(): Promise<Record<string, unknown>> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const due = await db
    .select({ id: maintenancePlans.id, name: maintenancePlans.name, machineId: maintenancePlans.machineId })
    .from(maintenancePlans)
    .where(and(eq(maintenancePlans.isActive, true), lte(maintenancePlans.nextDueAt, todayIso)));

  return { duePlans: due.length, status: 'core bağlanacak (bakım modülü)' };
}
