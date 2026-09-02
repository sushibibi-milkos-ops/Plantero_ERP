import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@plantero/db';
import { resolveSession } from '@plantero/core/auth/session';
import { hasPermission } from '@plantero/core/auth/rbac';
import { ForbiddenError } from '@plantero/core/auth/errors';

export const SESSION_COOKIE = 'plantero_session';
/** Oturum süresi: 14 gün */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

export type UserCtx = {
  userId: string;
  userEmail: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  /** Core servislerine geçilen aktör bağlamı */
  actor: { userId: string; userEmail: string; requestId?: string; ip?: string };
};

type ResolvedSession = NonNullable<Awaited<ReturnType<typeof resolveSession>>>;

function toUserCtx(session: ResolvedSession, meta: { requestId?: string; ip?: string }): UserCtx {
  const user = session.user as { id: string; email: string; fullName?: string | null };
  const roles = (session.roles as Array<string | { code: string }>).map((r) => (typeof r === 'string' ? r : r.code));
  const permissions = (session.permissions as Array<string | { code: string }>).map((p) => (typeof p === 'string' ? p : p.code));
  return {
    userId: user.id,
    userEmail: user.email,
    fullName: user.fullName ?? user.email,
    roles,
    permissions,
    actor: { userId: user.id, userEmail: user.email, ...meta },
  };
}

/** İstek başına önbellekli: cookie → oturum → kullanıcı. Oturum yoksa null. */
export const getCurrentUser = cache(async (): Promise<UserCtx | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await resolveSession(db, token);
  if (!session) return null;
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? undefined;
  const requestId = h.get('x-request-id') ?? undefined;
  return toUserCtx(session, { ip, requestId });
});

/** Oturum yoksa /login'e yönlendirir */
export async function requireUser(): Promise<UserCtx> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/** İzin kontrolü: kullanıcı yoksa /login, izin yoksa ForbiddenError (sayfa error boundary'si yakalar) */
export async function requirePermission(code: string): Promise<UserCtx> {
  const user = await requireUser();
  if (!hasPermission({ roles: user.roles, permissions: user.permissions }, code)) {
    throw new ForbiddenError(code);
  }
  return user;
}

/** Sayfa içi koşullu gösterim için (yönlendirme yapmaz) */
export function userCan(user: UserCtx | null, code: string): boolean {
  if (!user) return false;
  return hasPermission({ roles: user.roles, permissions: user.permissions }, code);
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  };
}
