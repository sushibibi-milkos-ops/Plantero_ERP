import { db } from '@plantero/db';
import { SYSTEM_ACTOR } from '@plantero/core';
import { generateExpiryAlerts } from '@plantero/core/notifications/systemAlerts';

/**
 * SKT uyarı motoru (worker cron `expiry-alerts`, 07:00) — docs/modules/bildirimler.md §3.
 * Mantık `packages/core/src/notifications/systemAlerts.ts`'de (ARCHITECTURE §12: worker yalnızca
 * tetikler); aynı fonksiyon seed'in `notifications` adımında da çalışır, ikisi de aynı 30/60/90
 * kovalarını depo + kalite rollerine `notify()` ile yazar. Eski sürüm `notifications`a kullanıcısız
 * satır yazıyor, bildirimler hiçbir gelen kutusunda görünmüyordu (ayrıntı core dosyasının başlığında).
 */
export async function runExpiryAlerts(): Promise<Record<string, unknown>> {
  const res = await db.transaction((tx) => generateExpiryAlerts(tx, SYSTEM_ACTOR));
  return { ...res };
}
