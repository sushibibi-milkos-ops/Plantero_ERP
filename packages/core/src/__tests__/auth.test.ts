import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { users, roles, permissions, rolePermissions, userRoles, sessions } from '@plantero/db';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { createSession, resolveSession, destroySession, hashToken } from '../auth/session.js';
import { PERMISSIONS, ROLE_PRESETS, ROLE_CODES, hasPermission, permissionsForRoles } from '../auth/rbac.js';
import { ForbiddenError, UnauthorizedError, DomainError } from '../auth/errors.js';
import { writeAudit } from '../audit/index.js';
import { withRollback, suffix, ctx } from './helpers.js';

describe('auth', () => {
  it('parola hash/verify (bcrypt)', async () => {
    const h = await hashPassword('Plantero!2026');
    expect(h.startsWith('$2')).toBe(true);
    expect(await verifyPassword('Plantero!2026', h)).toBe(true);
    expect(await verifyPassword('yanlış', h)).toBe(false);
    expect(await verifyPassword('x', null)).toBe(false);
  });

  it('PERMISSIONS ve ROLE_PRESETS tutarlı; admin hepsine sahip', () => {
    const codes = new Set(PERMISSIONS.map((p) => p.code));
    expect(codes.size).toBe(PERMISSIONS.length);
    for (const p of PERMISSIONS) expect(p.code).toMatch(/^[a-z]+\.[a-z_]+$/);
    expect(ROLE_CODES).toHaveLength(13);
    for (const role of ROLE_CODES) {
      expect(ROLE_PRESETS[role].length).toBeGreaterThan(0);
      for (const c of ROLE_PRESETS[role]) expect(codes.has(c)).toBe(true);
    }
    expect(ROLE_PRESETS.admin.length).toBe(PERMISSIONS.length);
    expect(ROLE_PRESETS.depo).toContain('stock.receive');
    expect(ROLE_PRESETS.depo).not.toContain('accounting.post');
    expect(ROLE_PRESETS.uretim_operatoru).toContain('production.operate');
    expect(hasPermission({ roles: ['admin'], permissions: [] }, 'accounting.close_period')).toBe(true);
    expect(hasPermission({ roles: ['depo'], permissions: permissionsForRoles(['depo']) }, 'stock.pick')).toBe(true);
    expect(hasPermission({ roles: ['depo'], permissions: permissionsForRoles(['depo']) }, 'admin.users')).toBe(false);
    expect(hasPermission(null, 'stock.view')).toBe(false);
  });

  it('oturum: oluştur → çöz → yok et; token DB’de hash olarak', async () => {
    await withRollback(async (tx) => {
      const s = suffix();
      const [u] = await tx.insert(users).values({ email: `t${s}@plantero.local`, fullName: 'Test', passwordHash: await hashPassword('x1234') }).returning();
      const [role] = await tx.insert(roles).values({ code: `depo_${s}`, name: 'Depo' }).returning();
      const [perm] = await tx.insert(permissions).values({ code: 'stock.view', module: 'stock', description: 'x' }).onConflictDoNothing({ target: permissions.code }).returning();
      const permId = perm?.id ?? (await tx.select().from(permissions).where(eq(permissions.code, 'stock.view')))[0]!.id;
      await tx.insert(rolePermissions).values({ roleId: role!.id, permissionId: permId });
      await tx.insert(userRoles).values({ userId: u!.id, roleId: role!.id });

      const { token, expiresAt } = await createSession(tx, u!.id, { userAgent: 'vitest', ip: '127.0.0.1' });
      expect(token.length).toBeGreaterThan(30);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
      const [row] = await tx.select().from(sessions).where(eq(sessions.userId, u!.id));
      expect(row!.tokenHash).toBe(hashToken(token));
      expect(row!.tokenHash).not.toBe(token);

      const resolved = await resolveSession(tx, token);
      expect(resolved?.user.email).toBe(`t${s}@plantero.local`);
      expect(resolved?.roles).toEqual([`depo_${s}`]);
      expect(resolved?.permissions).toEqual(['stock.view']);
      expect(await resolveSession(tx, 'gecersiz')).toBeNull();

      await tx.update(users).set({ isActive: false }).where(eq(users.id, u!.id));
      expect(await resolveSession(tx, token)).toBeNull();
      await tx.update(users).set({ isActive: true }).where(eq(users.id, u!.id));

      await destroySession(tx, token);
      expect(await resolveSession(tx, token)).toBeNull();

      const a = await writeAudit(tx, { action: 'login', tableName: 'users', recordId: u!.id, summary: 'giriş', after: { passwordHash: 'gizli', ok: true } }, { ...ctx, userId: u!.id });
      expect(a.id).toBeTruthy();
    });
  });

  it('hata sınıfları', () => {
    const f = new ForbiddenError('stock.pick');
    expect(f).toBeInstanceOf(DomainError);
    expect(f.code).toBe('FORBIDDEN');
    expect(f.message).toContain('stock.pick');
    expect(new UnauthorizedError().code).toBe('UNAUTHORIZED');
  });
});
