import { eq, inArray } from 'drizzle-orm';
import { notifications, userRoles, roles, type DbOrTx } from '@plantero/db';
import type { ActorCtx } from '../types.js';

/**
 * Bildirim gönderimi — TEK yazma noktası (docs/modules/bildirimler.md §4).
 * `packages/core` entegrasyon paketi import ETMEZ (sözleşme #3 katman kuralı) — bu fonksiyon yalnızca
 * `notifications` satırlarını yazar: `in_app` anında "gönderilmiş" sayılır (uygulama içinde okunur),
 * `email`/`whatsapp`/`sms` `pending` bırakılır. Gerçek dış gönderim web katmanında
 * (`@plantero/integrations`, `apps/web/src/modules/**\/actions.ts`) transaction DIŞINDA yapılır —
 * `purchasing/actions.ts` `sendPurchaseOrderAction`/`runReplenishmentAction` ile aynı örüntü — ya da
 * `apps/worker/src/jobs/notifications.ts` (anlık kuyruk) tarafından işlenir.
 */

export type NotifyChannel = 'in_app' | 'email' | 'whatsapp' | 'sms';

export type NotifyInput = {
  userIds?: string[];
  roleCodes?: string[];
  partnerId?: string | null;
  title: string;
  body: string;
  href?: string | null;
  channel?: NotifyChannel[];
  refTable?: string | null;
  refId?: string | null;
};

export type NotifyResult = { ids: string[]; userTargets: number; partnerTargets: number };

export async function notify(tx: DbOrTx, input: NotifyInput, ctx: ActorCtx): Promise<NotifyResult> {
  const userIds = new Set(input.userIds ?? []);
  if (input.roleCodes?.length) {
    const rows = await tx
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(inArray(roles.code, input.roleCodes));
    for (const r of rows) userIds.add(r.userId);
  }

  const ids: string[] = [];
  const now = new Date();

  if (userIds.size) {
    const userChannels = input.channel?.length ? input.channel : (['in_app'] as NotifyChannel[]);
    for (const userId of userIds) {
      for (const channel of userChannels) {
        const [row] = await tx
          .insert(notifications)
          .values({
            userId, channel, status: channel === 'in_app' ? 'sent' : 'pending',
            title: input.title, body: input.body, href: input.href ?? null,
            refTable: input.refTable ?? null, refId: input.refId ?? null,
            sentAt: channel === 'in_app' ? now : null, createdBy: ctx.userId ?? null,
          })
          .returning({ id: notifications.id });
        if (row) ids.push(row.id);
      }
    }
  }

  let partnerTargets = 0;
  if (input.partnerId) {
    const partnerChannels = (input.channel?.length ? input.channel : (['email', 'whatsapp'] as NotifyChannel[])).filter((c) => c !== 'in_app');
    for (const channel of partnerChannels) {
      const [row] = await tx
        .insert(notifications)
        .values({
          partnerId: input.partnerId, channel, status: 'pending',
          title: input.title, body: input.body, href: input.href ?? null,
          refTable: input.refTable ?? null, refId: input.refId ?? null, createdBy: ctx.userId ?? null,
        })
        .returning({ id: notifications.id });
      if (row) ids.push(row.id);
    }
    partnerTargets = 1;
  }

  return { ids, userTargets: userIds.size, partnerTargets };
}
