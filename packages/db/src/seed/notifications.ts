import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { notifications } from '../schema/index.js';
import { SYSTEM_ACTOR } from '@plantero/core';
import { generateExpiryAlerts } from '@plantero/core/notifications/systemAlerts';
import { log, type SeedSummary } from './_helpers.js';

/**
 * Bildirimler seed'i — docs/modules/bildirimler.md §3 sistem bildirimleri.
 * Worker'ın `expiry-alerts` job'ıyla AYNI core fonksiyonunu (`generateExpiryAlerts`) çalıştırır: taze
 * kurulumda /bildirimler ve üst bar zili, depo + kalite kullanıcıları için ilk günden gerçek SKT
 * 30/60/90 özetlerini gösterir (stock/production seed'lerinin ürettiği lotlardan hesaplanır — elle
 * insert yok). İdempotent: fonksiyonun kendi 20 saatlik tekrar koruması `db:seed` tekrarında çift
 * kayıt üretmez. Diğer sistem bildirimleri (kritik stok, geciken alacak, mutabakat özeti) ilgili
 * worker job'larının kendi çalışma anında üretilir; seed'de zorlanmaz.
 */
export async function seedNotifications(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  const res = await generateExpiryAlerts(tx, SYSTEM_ACTOR);
  log('notifications', `SKT özetleri: ${res.lotsEvaluated} lot değerlendirildi, ${res.alertsCreated} bildirim (${res.recipients} alıcı, ${res.skippedAsDuplicate} tekrar atlandı)`);
  const rows = await tx.select({ id: notifications.id }).from(notifications).where(eq(notifications.refTable, 'expiry_digest'));
  summary.add('notifications (SKT özeti, in_app)', rows.length);
}
