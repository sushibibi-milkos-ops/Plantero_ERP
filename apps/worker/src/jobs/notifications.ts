import { eq } from 'drizzle-orm';
import { db, notifications, partners, users } from '@plantero/db';
import { email, whatsapp } from '@plantero/integrations';

export type NotificationJobData = { notificationId: string };

/**
 * Bildirim gönderim işlemcisi (anlık kuyruk): `notifications` satırını okur, kanalına göre
 * (whatsapp/email) ilgili adaptörü çağırır ve durumunu günceller. `in_app` bildirimler
 * doğrudan uygulama içinde okunur, burada atlanır.
 */
export async function processNotification(data: NotificationJobData): Promise<Record<string, unknown>> {
  const [n] = await db.select().from(notifications).where(eq(notifications.id, data.notificationId)).limit(1);
  if (!n) return { ok: false, error: 'Bildirim bulunamadı' };
  if (n.channel === 'in_app') return { ok: true, skipped: true };

  let to: string | undefined;
  if (n.partnerId) {
    const [p] = await db.select({ email: partners.email, whatsapp: partners.whatsapp }).from(partners).where(eq(partners.id, n.partnerId)).limit(1);
    to = n.channel === 'whatsapp' ? (p?.whatsapp ?? undefined) : (p?.email ?? undefined);
  } else if (n.userId) {
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, n.userId)).limit(1);
    to = u?.email;
  }

  if (!to) {
    await db.update(notifications).set({ status: 'failed', error: 'Alıcı bulunamadı' }).where(eq(notifications.id, n.id));
    return { ok: false, error: 'Alıcı bulunamadı' };
  }

  const result = n.channel === 'whatsapp' ? await whatsapp.sendWhatsApp({ to, body: n.body }) : await email.sendEmail({ to, subject: n.title, body: n.body });

  await db
    .update(notifications)
    .set({ status: result.ok ? 'sent' : 'failed', sentAt: result.ok ? new Date() : null, error: result.ok ? null : (result.error ?? null) })
    .where(eq(notifications.id, n.id));

  return { ok: result.ok, sandbox: result.sandbox, providerId: result.providerId, error: result.error };
}
