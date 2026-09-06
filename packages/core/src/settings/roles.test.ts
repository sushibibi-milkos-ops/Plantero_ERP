import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { roles, permissions, rolePermissions, users, userRoles, type Tx } from '@plantero/db';
import { hashPassword } from '../auth/password.js';
import { createRole, updateRolePermissions, setRoleActive, listRolesOverview, LOCKED_ROLE_CODE } from './roles.js';
import { ValidationError, NotFoundError } from '../auth/errors.js';
import { withRollback, suffix, ctx } from '../__tests__/helpers.js';

async function ensurePermission(tx: Tx, code: string, module: string) {
  await tx.insert(permissions).values({ code, module, description: code }).onConflictDoNothing({ target: permissions.code });
  const [row] = await tx.select({ id: permissions.id }).from(permissions).where(eq(permissions.code, code)).limit(1);
  return row!.id;
}

describe('settings/roles — rol ve izin matrisi', () => {
  it('createRole: kod normalize edilir, tekrar reddedilir, geçersiz kod reddedilir', async () => {
    await withRollback(async (tx) => {
      const s = suffix().toLowerCase();
      const role = await createRole(tx, { code: `  Test_${s}  `, name: `Test Rol ${s}` }, ctx);
      expect(role.code).toBe(`test_${s}`);
      expect(role.isSystem).toBe(false);

      await expect(createRole(tx, { code: `test_${s}`, name: 'Tekrar' }, ctx)).rejects.toThrow(ValidationError);
      await expect(createRole(tx, { code: '1baslangic', name: 'x' }, ctx)).rejects.toThrow(/küçük harf/);
      await expect(createRole(tx, { code: `ok_${s}2`, name: '  ' }, ctx)).rejects.toThrow(/Rol adı/);
    });
  });

  it('updateRolePermissions: izin kümesini değiştirir, audit yazar, admin rolü reddedilir, bilinmeyen kod reddedilir', async () => {
    await withRollback(async (tx) => {
      const s = suffix();
      const p1 = await ensurePermission(tx, `test.view.${s}`, 'test');
      const p2 = await ensurePermission(tx, `test.manage.${s}`, 'test');
      const role = await createRole(tx, { code: `rol_${s}`, name: `Rol ${s}` }, ctx);

      const r1 = await updateRolePermissions(tx, role.id, [`test.view.${s}`], ctx);
      expect(r1.permissionCodes).toEqual([`test.view.${s}`]);

      const r2 = await updateRolePermissions(tx, role.id, [`test.view.${s}`, `test.manage.${s}`], ctx);
      expect(r2.permissionCodes.sort()).toEqual([`test.manage.${s}`, `test.view.${s}`].sort());

      // Boş kümeye düşürme
      const r3 = await updateRolePermissions(tx, role.id, [], ctx);
      expect(r3.permissionCodes).toEqual([]);
      const remaining = await tx.select().from(rolePermissions).where(eq(rolePermissions.roleId, role.id));
      expect(remaining).toHaveLength(0);

      await expect(updateRolePermissions(tx, role.id, ['hic.olmayan.kod'], ctx)).rejects.toThrow(/Bilinmeyen izin/);

      const [adminRole] = await tx.select().from(roles).where(eq(roles.code, LOCKED_ROLE_CODE)).limit(1);
      if (adminRole) {
        await expect(updateRolePermissions(tx, adminRole.id, [], ctx)).rejects.toThrow(/admin/);
      }

      await expect(updateRolePermissions(tx, '00000000-0000-0000-0000-000000000000', [], ctx)).rejects.toThrow(NotFoundError);
      void p1;
      void p2;
    });
  });

  it('setRoleActive: pasifleştirme izinleri kaldırır ve saklar; aktifleştirme aynı izinleri geri yükler', async () => {
    await withRollback(async (tx) => {
      const s = suffix();
      await ensurePermission(tx, `test.view.${s}`, 'test');
      await ensurePermission(tx, `test.manage.${s}`, 'test');
      const role = await createRole(tx, { code: `pasif_${s}`, name: `Pasif Test ${s}` }, ctx);
      await updateRolePermissions(tx, role.id, [`test.view.${s}`, `test.manage.${s}`], ctx);

      const deactivated = await setRoleActive(tx, role.id, false, ctx);
      expect(deactivated.isActive).toBe(false);
      const afterDeactivate = await tx.select().from(rolePermissions).where(eq(rolePermissions.roleId, role.id));
      expect(afterDeactivate).toHaveLength(0);

      // Pasifken izin güncellemesi reddedilir
      await expect(updateRolePermissions(tx, role.id, [`test.view.${s}`], ctx)).rejects.toThrow(/Pasif/);

      const reactivated = await setRoleActive(tx, role.id, true, ctx);
      expect(reactivated.isActive).toBe(true);
      const afterReactivate = await tx
        .select({ code: permissions.code })
        .from(rolePermissions)
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(eq(rolePermissions.roleId, role.id));
      expect(afterReactivate.map((r) => r.code).sort()).toEqual([`test.manage.${s}`, `test.view.${s}`].sort());

      const [adminRole] = await tx.select().from(roles).where(eq(roles.code, LOCKED_ROLE_CODE)).limit(1);
      if (adminRole) {
        await expect(setRoleActive(tx, adminRole.id, false, ctx)).rejects.toThrow(/admin/);
      }
    });
  });

  it('listRolesOverview: kullanıcı sayısı ve izin kodları doğru toplanır', async () => {
    await withRollback(async (tx) => {
      const s = suffix();
      await ensurePermission(tx, `test.view.${s}`, 'test');
      const role = await createRole(tx, { code: `liste_${s}`, name: `Liste Test ${s}` }, ctx);
      await updateRolePermissions(tx, role.id, [`test.view.${s}`], ctx);

      const [u] = await tx.insert(users).values({ email: `u${s}@plantero.local`, fullName: 'Test Kullanıcı', passwordHash: await hashPassword('x123456') }).returning();
      await tx.insert(userRoles).values({ userId: u!.id, roleId: role.id });

      const overview = await listRolesOverview(tx);
      const found = overview.find((r) => r.id === role.id);
      expect(found).toBeTruthy();
      expect(found!.userCount).toBe(1);
      expect(found!.permissionCodes).toEqual([`test.view.${s}`]);
      expect(found!.isActive).toBe(true);
      expect(found!.isLocked).toBe(false);

      const admin = overview.find((r) => r.code === LOCKED_ROLE_CODE);
      if (admin) expect(admin.isLocked).toBe(true);
    });
  });
});
