'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@plantero/db';
import { createRole, updateRolePermissions, setRoleActive } from '@plantero/core/settings/roles';
import { requirePermission } from '@/lib/auth';
import { withAudit } from '@/lib/actions';

/**
 * Ayarlar > Roller server action'ları.
 * İzin: `admin.users` (nav.ts'te /ayarlar/roller ve /ayarlar/kullanicilar zaten bu izinle
 * korunuyor — ARCHITECTURE.md §4 izin sözlüğünde rol/izin yönetimi için ayrı bir
 * `settings.manage`/`users.manage` kodu YOK; en yakın karşılığı `admin.users`).
 */

function revalidateRoles() {
  revalidatePath('/ayarlar/roller');
}

const createRoleSchema = z.object({
  code: z.string().trim().min(2, 'En az 2 karakter').max(40, 'En fazla 40 karakter'),
  name: z.string().trim().min(1, 'Rol adı gerekli').max(100),
  description: z.string().trim().max(300).optional().nullable(),
});

export const createRoleAction = withAudit('settings.createRole', async (raw: z.infer<typeof createRoleSchema>) => {
  const user = await requirePermission('admin.users');
  const input = createRoleSchema.parse(raw);
  const role = await db.transaction((tx) => createRole(tx, input, user.actor));
  revalidateRoles();
  return {
    data: { id: role.id, code: role.code, name: role.name },
    message: `Rol oluşturuldu: ${role.name}`,
    audit: { action: 'create' as const, tableName: 'roles', recordId: role.id, summary: `Rol oluşturuldu: ${role.name} (${role.code})`, after: role },
  };
});

const updatePermissionsSchema = z.object({
  roleId: z.string().uuid(),
  permissionCodes: z.array(z.string()),
});

export const updateRolePermissionsAction = withAudit('settings.updateRolePermissions', async (raw: z.infer<typeof updatePermissionsSchema>) => {
  const user = await requirePermission('admin.users');
  const input = updatePermissionsSchema.parse(raw);
  const result = await db.transaction((tx) => updateRolePermissions(tx, input.roleId, input.permissionCodes, user.actor));
  revalidateRoles();
  return {
    data: result,
    message: `İzinler kaydedildi (${result.permissionCodes.length} izin)`,
    audit: {
      action: 'update' as const,
      tableName: 'role_permissions',
      recordId: input.roleId,
      summary: `Rol izinleri güncellendi (${result.permissionCodes.length} izin)`,
      after: { permissionCodes: result.permissionCodes },
    },
  };
});

const setActiveSchema = z.object({ roleId: z.string().uuid(), active: z.boolean() });

export const setRoleActiveAction = withAudit('settings.setRoleActive', async (raw: z.infer<typeof setActiveSchema>) => {
  const user = await requirePermission('admin.users');
  const input = setActiveSchema.parse(raw);
  const result = await db.transaction((tx) => setRoleActive(tx, input.roleId, input.active, user.actor));
  revalidateRoles();
  return {
    data: result,
    message: result.isActive ? 'Rol aktifleştirildi' : 'Rol pasifleştirildi',
    audit: {
      action: 'update' as const,
      tableName: 'roles',
      recordId: input.roleId,
      summary: result.isActive ? 'Rol aktifleştirildi' : 'Rol pasifleştirildi',
      after: { isActive: result.isActive },
    },
  };
});
