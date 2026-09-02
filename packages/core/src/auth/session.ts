import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, inArray } from 'drizzle-orm';
import { sessions, users, userRoles, roles, rolePermissions, permissions, type DbOrTx } from '@plantero/db';
import type { UserCtx } from '../types.js';

export const SESSION_COOKIE = 'plantero_session';
const DEFAULT_TTL_DAYS = 14;

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export type SessionMeta = { userAgent?: string | null; ip?: string | null; ttlDays?: number };

/** Rastgele 32 byte token üretir; DB'de yalnızca sha256 hash'i saklanır. */
export async function createSession(tx: DbOrTx, userId: string, meta: SessionMeta = {}): Promise<{ token: string; expiresAt: Date; sessionId: string }> {
  const token = randomBytes(32).toString('base64url');
  const ttl = meta.ttlDays ?? DEFAULT_TTL_DAYS;
  const expiresAt = new Date(Date.now() + ttl * 24 * 60 * 60 * 1000);
  const [row] = await tx
    .insert(sessions)
    .values({ userId, tokenHash: hashToken(token), userAgent: meta.userAgent ?? null, ip: meta.ip ?? null, expiresAt })
    .returning({ id: sessions.id });
  await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  return { token, expiresAt, sessionId: row!.id };
}

/** Token → kullanıcı, roller ve izinler. Süresi dolmuş/pasif kullanıcı → null. */
export async function resolveSession(db: DbOrTx, token: string | null | undefined): Promise<UserCtx | null> {
  if (!token) return null;
  const [row] = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      locale: users.locale,
      avatarUrl: users.avatarUrl,
      isActive: users.isActive,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row || !row.isActive) return null;
  const { roles: roleCodes, permissions: permCodes } = await loadUserAccess(db, row.userId);
  return {
    user: { id: row.userId, email: row.email, fullName: row.fullName, locale: row.locale, avatarUrl: row.avatarUrl },
    roles: roleCodes,
    permissions: permCodes,
    sessionId: row.sessionId,
  };
}

/** Kullanıcının rol kodları ve rol izinlerinin birleşimi */
export async function loadUserAccess(db: DbOrTx, userId: string): Promise<{ roles: string[]; permissions: string[] }> {
  const roleRows = await db
    .select({ id: roles.id, code: roles.code })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  const roleIds = roleRows.map((r) => r.id);
  let permCodes: string[] = [];
  if (roleIds.length) {
    const permRows = await db
      .select({ code: permissions.code })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(inArray(rolePermissions.roleId, roleIds));
    permCodes = Array.from(new Set(permRows.map((p) => p.code)));
  }
  return { roles: roleRows.map((r) => r.code), permissions: permCodes };
}

export async function destroySession(tx: DbOrTx, token: string | null | undefined): Promise<void> {
  if (!token) return;
  await tx.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function destroyUserSessions(tx: DbOrTx, userId: string): Promise<void> {
  await tx.delete(sessions).where(eq(sessions.userId, userId));
}
