import { eq } from 'drizzle-orm';
import { db, machines, productionLines } from '@plantero/db';

/**
 * Günlük OEE hesaplama — iskelet.
 * TODO: core bağlanacak — üretim/bakım modülü `downtimes` + `work_order_events` +
 * `work_order_outputs` verisinden günlük availability/performance/quality/OEE hesaplayıp
 * `oee_records`'a yazan servisi sağladığında burada çağrılacak. Şimdilik yalnızca aktif
 * hat/makine sayısını raporluyoruz.
 */
export async function runOeeDaily(): Promise<Record<string, unknown>> {
  const activeMachines = await db.select({ id: machines.id }).from(machines).where(eq(machines.isActive, true));
  const activeLines = await db.select({ id: productionLines.id }).from(productionLines).where(eq(productionLines.isActive, true));

  return { activeMachines: activeMachines.length, activeLines: activeLines.length, status: 'core bağlanacak (üretim/bakım modülü)' };
}
