import { auditLog, type DbOrTx } from '@plantero/db';
import type { ActorCtx, AuditAction } from '../types.js';

export type AuditInput = {
  action: AuditAction;
  tableName: string;
  recordId?: string | null;
  summary?: string | null;
  before?: unknown;
  after?: unknown;
};

/** Standart audit satırı: tablo, kayıt id, eylem, önce/sonra JSON, kullanıcı, zaman */
export async function writeAudit(tx: DbOrTx, input: AuditInput, ctx: ActorCtx): Promise<{ id: string }> {
  const [row] = await tx
    .insert(auditLog)
    .values({
      userId: ctx.userId ?? null,
      userEmail: ctx.userEmail ?? null,
      action: input.action,
      tableName: input.tableName,
      recordId: input.recordId ?? null,
      summary: input.summary ?? null,
      before: input.before === undefined ? null : sanitize(input.before),
      after: input.after === undefined ? null : sanitize(input.after),
      ip: ctx.ip ?? null,
      requestId: ctx.requestId ?? null,
    })
    .returning({ id: auditLog.id });
  return { id: row!.id };
}

/** Decimal/Date gibi değerleri JSON'a uygun hale getirir; parola hash'lerini maskeler */
export function sanitize(v: unknown): unknown {
  return JSON.parse(
    JSON.stringify(v, (key, val) => {
      if (key === 'passwordHash' || key === 'pinHash' || key === 'tokenHash') return '***';
      if (val && typeof val === 'object' && typeof (val as { toFixed?: unknown }).toFixed === 'function' && 'd' in (val as object)) {
        return (val as { toString(): string }).toString();
      }
      return val;
    }) ?? 'null',
  );
}
