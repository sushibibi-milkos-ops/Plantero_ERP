import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@plantero/db';
import { listApprovalQueue, type ApprovalQueueItem } from '@plantero/core/notifications/approvals/dispatch';

const { notifications } = schema;

export type { ApprovalQueueItem };

export async function getApprovalQueue(): Promise<ApprovalQueueItem[]> {
  return listApprovalQueue(db);
}

export type NotificationRow = typeof notifications.$inferSelect;

export async function listMyNotifications(userId: string, opts: { onlyUnread?: boolean } = {}): Promise<NotificationRow[]> {
  const conds = [eq(notifications.userId, userId), eq(notifications.channel, 'in_app')];
  if (opts.onlyUnread) conds.push(eq(notifications.status, 'sent'));
  return db.select().from(notifications).where(and(...conds)).orderBy(desc(notifications.createdAt)).limit(200);
}

export async function getUnreadCount(userId: string): Promise<number> {
  const rows = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.channel, 'in_app'), eq(notifications.status, 'sent')));
  return rows.length;
}
