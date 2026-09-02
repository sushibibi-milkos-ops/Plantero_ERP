import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '@plantero/db';

export type UserRow = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: string[];
};

/** Kullanıcı listesi + rolleri (users ⟕ user_roles ⟕ roles) */
export async function listUsers(): Promise<UserRow[]> {
  const rows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      fullName: schema.users.fullName,
      isActive: schema.users.isActive,
      lastLoginAt: schema.users.lastLoginAt,
      createdAt: schema.users.createdAt,
      roleCode: schema.roles.code,
    })
    .from(schema.users)
    .leftJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
    .leftJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
    .orderBy(asc(schema.users.fullName), asc(schema.roles.code));

  const map = new Map<string, UserRow>();
  for (const r of rows) {
    let u = map.get(r.id);
    if (!u) {
      u = {
        id: r.id,
        email: r.email,
        fullName: r.fullName,
        isActive: r.isActive,
        lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
        roles: [],
      };
      map.set(r.id, u);
    }
    if (r.roleCode) u.roles.push(r.roleCode);
  }
  return Array.from(map.values());
}
