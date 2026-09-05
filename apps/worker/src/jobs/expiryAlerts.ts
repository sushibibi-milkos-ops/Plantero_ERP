import { db, sql } from '@plantero/db';
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

/**
 * Elle tetikleme girişi (Tur 1 P2 bulgusu): dosya yalnızca `runExpiryAlerts`'i export ediyordu, `tsx
 * apps/worker/src/jobs/expiryAlerts.ts` ile doğrudan çalıştırılınca hiçbir çıktı üretmeden sessizce
 * bitiyordu (QA ancak dinamik import + elle çağrı ile dolaylı çalıştırabildi). BullMQ zamanlayıcısı bu
 * bloğu hiç görmez (yalnızca `runExpiryAlerts`'i `jobs/index.ts` üzerinden çağırır); bu yalnızca CLI'dan
 * doğrudan çalıştırma senaryosu içindir.
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  runExpiryAlerts()
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
      return sql.end();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      void sql.end().finally(() => process.exit(1));
    });
}
