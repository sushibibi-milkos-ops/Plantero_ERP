import { asc, eq, inArray, sql } from 'drizzle-orm';
import { roles, permissions, rolePermissions, userRoles, settings, type DbOrTx } from '@plantero/db';
import { ValidationError, NotFoundError } from '../auth/errors.js';
import { writeAudit } from '../audit/index.js';
import type { ActorCtx } from '../types.js';

/**
 * Rol/izin yönetimi (Ayarlar > Roller).
 *
 * ŞEMA TALEBİ (rapora da yazılır): `roles` tablosunda `is_active` kolonu yok (şema dondurulmuş,
 * bu modül ekleyemez). "Pasifleştirme" bu yüzden `settings` tablosundaki tek bir JSON anahtarla
 * (bkz. `DEACTIVATED_SETTINGS_KEY`) simüle edilir: pasifleştirilen rolün TÜM `role_permissions`
 * satırları silinir (rol artık fiilen hiçbir izin taşımaz — `hasPermission`/`resolveSession`
 * başka bir "aktif" bayrağı kontrol etmediği için gerçek erişim engeli budur) ve önceki izin
 * kodları bu ayar anahtarında saklanır; "aktifleştir" aynı kodları geri yükler. Kullanıcıların
 * `user_roles` ataması dokunulmadan kalır (rol etiketi görünür kalır, yalnızca izinler geri gelir).
 * Doğru çözüm: `roles.is_active boolean not null default true` + `resolveSession`'ın pasif rolleri
 * es geçmesi — şema sahibine iletilmelidir.
 */

const DEACTIVATED_SETTINGS_KEY = 'settings.roles.deactivated_roles';
/** Bu koda sahip rol asla değiştirilemez/pasifleştirilemez (UI'da kilitli gösterilir) */
export const LOCKED_ROLE_CODE = 'admin';
export const ROLE_CODE_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

export type DeactivationEntry = { at: string; previousPermissionCodes: string[]; deactivatedBy: string | null };
type DeactivationMap = Record<string, DeactivationEntry>;

async function readDeactivationMap(tx: DbOrTx): Promise<DeactivationMap> {
  const [row] = await tx.select({ value: settings.value }).from(settings).where(eq(settings.key, DEACTIVATED_SETTINGS_KEY)).limit(1);
  return (row?.value as DeactivationMap | undefined) ?? {};
}

async function writeDeactivationMap(tx: DbOrTx, map: DeactivationMap, updatedBy: string | null): Promise<void> {
  await tx
    .insert(settings)
    .values({
      key: DEACTIVATED_SETTINGS_KEY,
      value: map,
      description: 'Pasifleştirilmiş roller ve önceki izin kodları (roles.is_active kolonu yok — bkz. şema talebi)',
      updatedBy,
    })
    .onConflictDoUpdate({ target: settings.key, set: { value: map, updatedBy, updatedAt: new Date() } });
}

export type RoleOverview = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  /** admin rolü — matris ve pasifleştirme kilitli */
  isLocked: boolean;
  isActive: boolean;
  userCount: number;
  permissionCodes: string[];
};

/** Tüm roller + kullanıcı sayısı + izin kodları + aktiflik (settings anahtarından) */
export async function listRolesOverview(tx: DbOrTx): Promise<RoleOverview[]> {
  const [roleRows, rpRows, countRows, deactivated] = await Promise.all([
    tx.select().from(roles).orderBy(asc(roles.code)),
    tx
      .select({ roleId: rolePermissions.roleId, code: permissions.code })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId)),
    tx.select({ roleId: userRoles.roleId, n: sql<string>`count(*)` }).from(userRoles).groupBy(userRoles.roleId),
    readDeactivationMap(tx),
  ]);

  const permsByRole = new Map<string, string[]>();
  for (const r of rpRows) {
    const arr = permsByRole.get(r.roleId) ?? [];
    arr.push(r.code);
    permsByRole.set(r.roleId, arr);
  }
  const countByRole = new Map(countRows.map((c) => [c.roleId, Number(c.n)]));

  return roleRows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    isLocked: r.code === LOCKED_ROLE_CODE,
    isActive: !deactivated[r.id],
    userCount: countByRole.get(r.id) ?? 0,
    permissionCodes: (permsByRole.get(r.id) ?? []).sort(),
  }));
}

export type CreateRoleInput = { code: string; name: string; description?: string | null };

export async function createRole(tx: DbOrTx, input: CreateRoleInput, ctx: ActorCtx): Promise<typeof roles.$inferSelect> {
  const code = input.code.trim().toLowerCase();
  const name = input.name.trim();
  if (!ROLE_CODE_PATTERN.test(code)) {
    throw new ValidationError('Rol kodu küçük harf, rakam ve alt çizgiden oluşmalı, bir harfle başlamalı (2-40 karakter)');
  }
  if (!name) throw new ValidationError('Rol adı gerekli');

  const [existing] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.code, code)).limit(1);
  if (existing) throw new ValidationError(`Rol kodu zaten kullanılıyor: ${code}`);

  const [row] = await tx.insert(roles).values({ code, name, description: input.description?.trim() || null, isSystem: false }).returning();
  await writeAudit(
    tx,
    { action: 'create', tableName: 'roles', recordId: row!.id, summary: `Rol oluşturuldu: ${row!.name} (${row!.code})`, after: row },
    ctx,
  );
  return row!;
}

/** Seçili rolün TÜM izinlerini verilen kod kümesiyle değiştirir (transaction: sil + ekle). admin rolü reddedilir. */
export async function updateRolePermissions(
  tx: DbOrTx,
  roleId: string,
  permissionCodes: string[],
  ctx: ActorCtx,
): Promise<{ roleId: string; permissionCodes: string[] }> {
  const [role] = await tx.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) throw new NotFoundError('Rol', roleId);
  if (role.code === LOCKED_ROLE_CODE) throw new ValidationError('Sistem yöneticisi (admin) rolünün izinleri değiştirilemez');

  const deactivated = await readDeactivationMap(tx);
  if (deactivated[roleId]) throw new ValidationError('Pasif bir rolün izinleri değiştirilemez — önce rolü aktifleştirin');

  const beforeRows = await tx
    .select({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, roleId));
  const beforeCodes = beforeRows.map((b) => b.code).sort();

  const uniqueCodes = Array.from(new Set(permissionCodes));
  const permRows = uniqueCodes.length
    ? await tx.select({ id: permissions.id, code: permissions.code }).from(permissions).where(inArray(permissions.code, uniqueCodes))
    : [];
  const foundCodes = new Set(permRows.map((p) => p.code));
  const unknown = uniqueCodes.filter((c) => !foundCodes.has(c));
  if (unknown.length) throw new ValidationError(`Bilinmeyen izin kodu: ${unknown.join(', ')}`);

  await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  if (permRows.length) await tx.insert(rolePermissions).values(permRows.map((p) => ({ roleId, permissionId: p.id })));

  const afterCodes = permRows.map((p) => p.code).sort();
  await writeAudit(
    tx,
    {
      action: 'update',
      tableName: 'role_permissions',
      recordId: roleId,
      summary: `${role.name} rolünün izinleri güncellendi (${afterCodes.length} izin)`,
      before: { roleCode: role.code, permissionCodes: beforeCodes },
      after: { roleCode: role.code, permissionCodes: afterCodes },
    },
    ctx,
  );
  return { roleId, permissionCodes: afterCodes };
}

/** Rolü pasifleştirir (izinlerini kaldırıp saklar) ya da aktifleştirir (saklanan izinleri geri yükler). */
export async function setRoleActive(tx: DbOrTx, roleId: string, active: boolean, ctx: ActorCtx): Promise<{ roleId: string; isActive: boolean }> {
  const [role] = await tx.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) throw new NotFoundError('Rol', roleId);
  if (role.code === LOCKED_ROLE_CODE) throw new ValidationError('Sistem yöneticisi (admin) rolü pasifleştirilemez');

  const map = await readDeactivationMap(tx);

  if (!active) {
    if (map[roleId]) return { roleId, isActive: false };
    const current = await tx
      .select({ code: permissions.code })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(rolePermissions.roleId, roleId));
    const codes = current.map((c) => c.code).sort();
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    map[roleId] = { at: new Date().toISOString(), previousPermissionCodes: codes, deactivatedBy: ctx.userId };
    await writeDeactivationMap(tx, map, ctx.userId);
    await writeAudit(
      tx,
      {
        action: 'update',
        tableName: 'roles',
        recordId: roleId,
        summary: `Rol pasifleştirildi: ${role.name} (${codes.length} izin kaldırıldı, aktifleştirilince geri yüklenir)`,
        before: { isActive: true, permissionCodes: codes },
        after: { isActive: false, permissionCodes: [] },
      },
      ctx,
    );
    return { roleId, isActive: false };
  }

  const entry = map[roleId];
  if (!entry) return { roleId, isActive: true };
  const permRows = entry.previousPermissionCodes.length
    ? await tx.select({ id: permissions.id, code: permissions.code }).from(permissions).where(inArray(permissions.code, entry.previousPermissionCodes))
    : [];
  if (permRows.length) await tx.insert(rolePermissions).values(permRows.map((p) => ({ roleId, permissionId: p.id })));
  delete map[roleId];
  await writeDeactivationMap(tx, map, ctx.userId);
  const restoredCodes = permRows.map((p) => p.code).sort();
  await writeAudit(
    tx,
    {
      action: 'update',
      tableName: 'roles',
      recordId: roleId,
      summary: `Rol yeniden aktifleştirildi: ${role.name} (${restoredCodes.length} izin geri yüklendi)`,
      before: { isActive: false, permissionCodes: [] },
      after: { isActive: true, permissionCodes: restoredCodes },
    },
    ctx,
  );
  return { roleId, isActive: true };
}
