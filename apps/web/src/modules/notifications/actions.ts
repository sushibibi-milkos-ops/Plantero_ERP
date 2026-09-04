'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@plantero/db';
import { approveQueueItem, rejectQueueItem, permissionForKind } from '@plantero/core/notifications/approvals/dispatch';
import { requirePermission, requireUser } from '@/lib/auth';
import { withAudit } from '@/lib/actions';

const { notifications } = schema;

/* ==================================================================== */
/* Bildirimler — kullanıcı kendi bildirimlerini yönetir (izin kodu yok;
 * bildirimler.md §"izinler mevcut modül izinleri" — okuma/okundu işaretleme herkese açık kişisel
 * bir işlemdir, `rbac.ts` dondurulmuş listede buna özel bir kod yok).                              */
/* ==================================================================== */

const idSchema = z.object({ id: z.string().uuid() });

export const markNotificationReadAction = withAudit('notifications.markRead', async (raw: z.infer<typeof idSchema>) => {
  const user = await requireUser();
  const input = idSchema.parse(raw);
  await db.update(notifications).set({ status: 'read', readAt: new Date() }).where(and(eq(notifications.id, input.id), eq(notifications.userId, user.userId)));
  revalidatePath('/bildirimler');
  return { data: { id: input.id } };
});

export const markAllNotificationsReadAction = withAudit('notifications.markAllRead', async () => {
  const user = await requireUser();
  await db.update(notifications).set({ status: 'read', readAt: new Date() }).where(and(eq(notifications.userId, user.userId), eq(notifications.channel, 'in_app'), eq(notifications.status, 'sent')));
  revalidatePath('/bildirimler');
  return { data: { ok: true } };
});

export async function getUnreadCountAction(): Promise<number> {
  const user = await requireUser();
  const rows = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, user.userId), eq(notifications.channel, 'in_app'), eq(notifications.status, 'sent')));
  return rows.length;
}

/* ==================================================================== */
/* Onay merkezi — /onaylar                                               */
/* ==================================================================== */

const approvalItemSchema = z.object({ kind: z.string(), id: z.string().uuid(), reason: z.string().trim().optional().nullable() });

export const approveQueueItemAction = withAudit('notifications.approveQueueItem', async (raw: z.infer<typeof approvalItemSchema>) => {
  const input = approvalItemSchema.parse(raw);
  const user = await requirePermission(permissionForKind(input.kind));
  await db.transaction((tx) => approveQueueItem(tx, input.kind, input.id, user.actor));
  revalidatePath('/onaylar');
  revalidatePath('/satin-alma/onay-kuyrugu');
  revalidatePath('/satin-alma/siparisler');
  revalidatePath('/depo/sayim');
  revalidatePath('/finans/tahsilat-takibi');
  revalidatePath('/muhasebe/mutabakat');
  return { data: { ok: true }, audit: { action: 'approve', tableName: 'approvals', recordId: input.id, summary: `Onay kuyruğu: ${input.kind} onaylandı (${input.id})` } };
});

export const rejectQueueItemAction = withAudit('notifications.rejectQueueItem', async (raw: z.infer<typeof approvalItemSchema>) => {
  const input = approvalItemSchema.parse(raw);
  const user = await requirePermission(permissionForKind(input.kind));
  await db.transaction((tx) => rejectQueueItem(tx, input.kind, input.id, input.reason || null, user.actor));
  revalidatePath('/onaylar');
  revalidatePath('/satin-alma/onay-kuyrugu');
  revalidatePath('/satin-alma/siparisler');
  revalidatePath('/depo/sayim');
  revalidatePath('/finans/tahsilat-takibi');
  revalidatePath('/muhasebe/mutabakat');
  return { data: { ok: true }, audit: { action: 'reject', tableName: 'approvals', recordId: input.id, summary: `Onay kuyruğu: ${input.kind} reddedildi (${input.id})` } };
});
