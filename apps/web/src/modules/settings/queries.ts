import 'server-only';
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { db, schema } from '@plantero/db';
import { listRolesOverview, type RoleOverview } from '@plantero/core/settings/roles';
import { documentHref, DOCUMENT_TYPE_LABELS } from '@/lib/status';

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

/* ==================================================================== */
/* Roller ve izin matrisi (/ayarlar/roller)                             */
/* ==================================================================== */

export type { RoleOverview };

/** Tüm roller + kullanıcı sayısı + izin kodları + aktiflik — `packages/core/src/settings/roles.ts` */
export async function listRoles(): Promise<RoleOverview[]> {
  return listRolesOverview(db);
}

/* ==================================================================== */
/* Denetim kaydı (/ayarlar/audit)                                       */
/* ==================================================================== */

export const AUDIT_PAGE_SIZE = 50;

/** `audit_log.table_name` → belge tipi (document_index/documentHref ile bağlantı kurmak için).
 *  Yalnızca gerçek belge akışı üreten tablolar eşlenir; eşlenmeyen tablolar (roller, kullanıcılar,
 *  ürünler, ayarlar vb.) belge bağlantısı olmadan gösterilir. */
const TABLE_TO_DOC_TYPE: Record<string, string> = {
  sales_orders: 'sales_order',
  deliveries: 'delivery',
  invoices: 'invoice',
  payments: 'payment',
  purchase_orders: 'purchase_order',
  receipts: 'receipt',
  transfers: 'transfer',
  stock_counts: 'stock_count',
  work_orders: 'work_order',
  qc_checks: 'quality_check',
  recalls: 'recall',
  export_shipments: 'export_shipment',
  maintenance_orders: 'maintenance_order',
  journal_entries: 'journal_entry',
  bank_transactions: 'bank_transaction',
  opportunities: 'opportunity',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AuditFilters = {
  table?: string;
  userId?: string;
  action?: string;
  /** `yyyy-mm-dd`, Europe/Istanbul takvim günü (dahil) */
  from?: string;
  to?: string;
  q?: string;
  page?: number;
};

export type AuditRow = {
  id: string;
  at: string;
  userId: string | null;
  userEmail: string | null;
  userFullName: string | null;
  action: string;
  tableName: string;
  recordId: string | null;
  summary: string | null;
  before: unknown;
  after: unknown;
  /** İlgili belgeye bağlantı — document_index'te eşleşme varsa (bkz. TABLE_TO_DOC_TYPE) */
  document: { href: string; docNo: string; typeLabel: string } | null;
};

export type AuditListResult = {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
};

/** Türkiye saati (UTC+3, DST yok) takvim günü sınırını UTC timestamp'e çevirir */
function istanbulDayBoundary(dateStr: string, endOfDay: boolean): Date {
  return new Date(`${dateStr}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+03:00`);
}

/** Filtre çubuğu için: kullanılmış tüm tablo adları (audit_log'da en az bir satırı olanlar) */
export async function listAuditTableOptions(): Promise<string[]> {
  const rows = await db.selectDistinct({ tableName: schema.auditLog.tableName }).from(schema.auditLog).orderBy(asc(schema.auditLog.tableName));
  return rows.map((r) => r.tableName);
}

/** Sunucu tarafı sayfalanmış + filtrelenmiş denetim kaydı listesi (50/sayfa) */
export async function listAuditLog(filters: AuditFilters): Promise<AuditListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = AUDIT_PAGE_SIZE;

  const conds = [];
  if (filters.table) conds.push(eq(schema.auditLog.tableName, filters.table));
  if (filters.userId) conds.push(eq(schema.auditLog.userId, filters.userId));
  if (filters.action) conds.push(eq(schema.auditLog.action, filters.action as (typeof schema.auditActionEnum.enumValues)[number]));
  if (filters.from) conds.push(gte(schema.auditLog.at, istanbulDayBoundary(filters.from, false)));
  if (filters.to) conds.push(lte(schema.auditLog.at, istanbulDayBoundary(filters.to, true)));
  if (filters.q?.trim()) {
    const pattern = `%${filters.q.trim()}%`;
    conds.push(
      or(
        ilike(schema.auditLog.summary, pattern),
        ilike(schema.auditLog.tableName, pattern),
        ilike(schema.auditLog.recordId, pattern),
        ilike(schema.auditLog.userEmail, pattern),
      ),
    );
  }
  const where = conds.length ? and(...conds) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: schema.auditLog.id,
        at: schema.auditLog.at,
        userId: schema.auditLog.userId,
        userEmail: schema.auditLog.userEmail,
        userFullName: schema.users.fullName,
        action: schema.auditLog.action,
        tableName: schema.auditLog.tableName,
        recordId: schema.auditLog.recordId,
        summary: schema.auditLog.summary,
        before: schema.auditLog.before,
        after: schema.auditLog.after,
      })
      .from(schema.auditLog)
      .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.userId))
      .where(where)
      .orderBy(desc(schema.auditLog.at))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: sql<string>`count(*)` }).from(schema.auditLog).where(where),
  ]);

  // Sayfadaki satırlar için belge bağlantısı: tür bazında toplu sorgu (N+1 yerine tür sayısı kadar sorgu)
  const byType = new Map<string, string[]>();
  for (const r of rows) {
    const type = TABLE_TO_DOC_TYPE[r.tableName];
    if (type && r.recordId && UUID_RE.test(r.recordId)) {
      const arr = byType.get(type) ?? [];
      arr.push(r.recordId);
      byType.set(type, arr);
    }
  }
  const docByKey = new Map<string, string>();
  for (const [type, ids] of byType) {
    const docs = await db
      .select({ recordId: schema.documentIndex.recordId, docNo: schema.documentIndex.docNo })
      .from(schema.documentIndex)
      .where(and(eq(schema.documentIndex.type, type as (typeof schema.documentTypeEnum.enumValues)[number]), inArray(schema.documentIndex.recordId, ids)));
    for (const d of docs) docByKey.set(`${type}:${d.recordId}`, d.docNo);
  }

  const out: AuditRow[] = rows.map((r) => {
    const type = TABLE_TO_DOC_TYPE[r.tableName];
    const docNo = type && r.recordId ? docByKey.get(`${type}:${r.recordId}`) : undefined;
    return {
      id: r.id,
      at: r.at.toISOString(),
      userId: r.userId,
      userEmail: r.userEmail,
      userFullName: r.userFullName,
      action: r.action,
      tableName: r.tableName,
      recordId: r.recordId,
      summary: r.summary,
      before: r.before,
      after: r.after,
      document: docNo && type ? { href: documentHref(type, r.recordId!), docNo, typeLabel: DOCUMENT_TYPE_LABELS[type] ?? type } : null,
    };
  });

  return { rows: out, total: Number(totalRows[0]?.n ?? 0), page, pageSize };
}
