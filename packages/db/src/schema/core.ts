import { pgTable, text, uuid, boolean, timestamp, jsonb, integer, index, uniqueIndex, pgEnum, primaryKey } from 'drizzle-orm/pg-core';
import { id, auditColumns } from './_common.js';

/* ------------------------------------------------------------------ */
/* Kimlik, roller, izinler                                             */
/* ------------------------------------------------------------------ */

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull(),
  fullName: text('full_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  locale: text('locale').notNull().default('tr'),
  avatarUrl: text('avatar_url'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  /** Operatör tablet ekranı için kısa PIN (opsiyonel) */
  pinHash: text('pin_hash'),
  ...auditColumns,
}, (t) => [uniqueIndex('users_email_uq').on(t.email)]);

export const roles = pgTable('roles', {
  id: id(),
  code: text('code').notNull(), // admin, genel_mudur, muhasebe, depo, uretim_operatoru, satis, satin_alma, kalite, bakim, arge, finans
  name: text('name').notNull(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(false),
  ...auditColumns,
}, (t) => [uniqueIndex('roles_code_uq').on(t.code)]);

/** İzin kodları "modul.eylem" biçimindedir: stock.receive, sales.order.approve, accounting.post ... */
export const permissions = pgTable('permissions', {
  id: id(),
  code: text('code').notNull(),
  module: text('module').notNull(),
  description: text('description'),
}, (t) => [uniqueIndex('permissions_code_uq').on(t.code)]);

export const rolePermissions = pgTable('role_permissions', {
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: uuid('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })]);

export const userRoles = pgTable('user_roles', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.userId, t.roleId] })]);

export const sessions = pgTable('sessions', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  userAgent: text('user_agent'),
  ip: text('ip'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('sessions_user_idx').on(t.userId), uniqueIndex('sessions_token_uq').on(t.tokenHash)]);

/* ------------------------------------------------------------------ */
/* Audit log — her tabloda standart                                    */
/* ------------------------------------------------------------------ */

export const auditActionEnum = pgEnum('audit_action', ['create', 'update', 'delete', 'post', 'cancel', 'approve', 'reject', 'login', 'import', 'sync', 'other']);

export const auditLog = pgTable('audit_log', {
  id: id(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  userId: uuid('user_id').references(() => users.id),
  userEmail: text('user_email'),
  action: auditActionEnum('action').notNull(),
  tableName: text('table_name').notNull(),
  recordId: text('record_id'),
  /** Kısa, insan okunur açıklama: "Sipariş SO-2026-00012 onaylandı" */
  summary: text('summary'),
  before: jsonb('before'),
  after: jsonb('after'),
  ip: text('ip'),
  requestId: text('request_id'),
}, (t) => [index('audit_table_record_idx').on(t.tableName, t.recordId), index('audit_at_idx').on(t.at), index('audit_user_idx').on(t.userId)]);

/* ------------------------------------------------------------------ */
/* Belge numaralandırma, ayarlar, ekler, bildirimler, onay kuyruğu      */
/* ------------------------------------------------------------------ */

/** Belge numarası dizileri: prefix + yıl + sıra → "SO-2026-000123" */
export const sequences = pgTable('sequences', {
  id: id(),
  code: text('code').notNull(), // SO, PO, WO, GR (mal kabul), DN (irsaliye), INV, PAY, JE, LOT, TR, CNT, MO (bakım), RC (recall)
  prefix: text('prefix').notNull(),
  year: integer('year').notNull(),
  next: integer('next').notNull().default(1),
  padding: integer('padding').notNull().default(6),
}, (t) => [uniqueIndex('sequences_code_year_uq').on(t.code, t.year)]);

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
});

export const attachments = pgTable('attachments', {
  id: id(),
  tableName: text('table_name').notNull(),
  recordId: uuid('record_id').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull().default(0),
  /** Yerel depolama yolu veya data URL (fotoğraflı arıza bildirimi vb.) */
  storagePath: text('storage_path').notNull(),
  ...auditColumns,
}, (t) => [index('attachments_record_idx').on(t.tableName, t.recordId)]);

export const notificationChannelEnum = pgEnum('notification_channel', ['in_app', 'email', 'whatsapp', 'sms']);
export const notificationStatusEnum = pgEnum('notification_status', ['pending', 'sent', 'failed', 'read']);

export const notifications = pgTable('notifications', {
  id: id(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  partnerId: uuid('partner_id'),
  channel: notificationChannelEnum('channel').notNull().default('in_app'),
  status: notificationStatusEnum('status').notNull().default('pending'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  href: text('href'),
  /** İlgili kayıt (tablo + id) */
  refTable: text('ref_table'),
  refId: uuid('ref_id'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
  error: text('error'),
  ...auditColumns,
}, (t) => [index('notifications_user_idx').on(t.userId, t.status)]);

export const approvalStatusEnum = pgEnum('approval_status', ['pending', 'approved', 'rejected', 'expired']);

/** Genel onay kuyruğu: AI sipariş taslağı, mutabakat önerisi, sayım farkı, tahsilat hatırlatma taslağı, reçete devri ... */
export const approvals = pgTable('approvals', {
  id: id(),
  kind: text('kind').notNull(), // purchase_draft, reconciliation, count_variance, dunning_message, recipe_release, price_change
  refTable: text('ref_table').notNull(),
  refId: uuid('ref_id').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  payload: jsonb('payload').$type<Record<string, unknown>>().default({}),
  /** AI güven puanı 0-1 */
  confidence: text('confidence'),
  status: approvalStatusEnum('status').notNull().default('pending'),
  requestedBy: uuid('requested_by'),
  decidedBy: uuid('decided_by').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNote: text('decision_note'),
  ...auditColumns,
}, (t) => [index('approvals_status_idx').on(t.status, t.kind), index('approvals_ref_idx').on(t.refTable, t.refId)]);

/** Arka plan işleri (BullMQ) için görünürlük kaydı */
export const jobRuns = pgTable('job_runs', {
  id: id(),
  queue: text('queue').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull().default('running'), // running, done, failed
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  result: jsonb('result'),
  error: text('error'),
}, (t) => [index('job_runs_queue_idx').on(t.queue, t.startedAt)]);
