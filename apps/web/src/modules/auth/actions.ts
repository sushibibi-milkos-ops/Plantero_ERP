'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db, schema } from '@plantero/db';
import { createSession, destroySession, loadUserAccess } from '@plantero/core/auth/session';
import { writeAudit } from '@plantero/core/audit/index';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { NAV, makeCan } from '@/lib/nav';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Geçerli bir e-posta girin'),
  password: z.string().min(1, 'Şifre gerekli'),
  next: z.string().optional(),
});

export type LoginState = { error?: string; fieldErrors?: Record<string, string[]>; /** Hatada formda kalsın */ email?: string } | null;

/** Güvenli yönlendirme: yalnızca site içi mutlak yollar. `fallback` yoksa çağıran '/kokpit' varsayar. */
function safeNext(next: string | undefined, fallback = '/kokpit'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback;
  return next;
}

/**
 * Kök neden (Tur 21 P1, shell-middleware-login-redirect-cockpit-loop-01): `next` parametresi
 * olmadan girişte varsayılan hedef HER ZAMAN '/kokpit' idi — ama depo/satın_alma/kalite gibi
 * `cockpit.view` izni OLMAYAN roller ilk girişte doğrudan ForbiddenError alıyordu, ve (app)/error.tsx
 * içindeki tek eylem butonu ('Kokpite dön') de yine '/kokpit'e gittiğinden kullanıcı çıkışsız bir
 * döngüde kalıyordu. Artık varsayılan hedef `nav.ts`teki menü sırasına göre kullanıcının GERÇEKTEN
 * erişebileceği ilk kalem (ör. `depo` rolü `masterdata.view` de taşıdığından /ana-veri/urunler'e,
 * yalnızca kendi modül iznine sahip bir rol ise doğrudan kendi modülüne düşer — önemli olan hedefin
 * ForbiddenError ATMAYACAĞININ garanti olması). Kalıcı olarak izinsiz (herhangi bir modül izni
 * olmayan, teorik) bir kullanıcı için son çare '/onaylar' — o kalem `nav.ts`te `permission`
 * taşımıyor (herkese açık onay merkezi), bu yüzden döngüye asla girmez.
 */
function defaultLandingRoute(roles: string[], permissions: string[]): string {
  const can = makeCan(roles, permissions);
  for (const group of NAV) {
    for (const item of group.items) {
      if (item.permission && can(item.permission)) return item.href;
    }
  }
  return '/onaylar';
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') ?? undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (fieldErrors[String(issue.path[0] ?? '_')] ??= []).push(issue.message);
    return { error: 'Lütfen alanları kontrol edin.', fieldErrors, email: String(formData.get('email') ?? '') };
  }
  const { email, password, next } = parsed.data;

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  // Kullanıcı yoksa da bcrypt çalıştır: zamanlama farkıyla hesap keşfini önle
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : await bcrypt.compare(password, '$2a$10$abcdefghijklmnopqrstuuA9kZ2h8YvI8nP7iUbZQqXm1x0WcWyf6');
  if (!user || !ok || !user.isActive) {
    return { error: 'E-posta veya şifre hatalı.', email };
  }

  const h = await headers();
  const meta = {
    userAgent: h.get('user-agent') ?? undefined,
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
  };

  const session = await db.transaction(async (tx) => {
    const s = await createSession(tx, user.id, meta);
    await tx.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
    await writeAudit(
      tx,
      { action: 'login', tableName: 'users', recordId: user.id, summary: `${user.email} giriş yaptı` },
      { userId: user.id, userEmail: user.email, ip: meta.ip },
    );
    return s;
  });

  const { roles: roleCodes, permissions: permCodes } = await loadUserAccess(db, user.id);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.token, sessionCookieOptions(new Date(session.expiresAt)));
  redirect(safeNext(next, defaultLandingRoute(roleCodes, permCodes)));
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await destroySession(db, token);
    } catch (err) {
      console.error('[logout] oturum silinemedi', err);
    }
  }
  jar.delete(SESSION_COOKIE);
  redirect('/login');
}
