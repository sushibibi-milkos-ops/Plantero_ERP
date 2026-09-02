import { pgTable, text, uuid, boolean, integer, date, timestamp, index, uniqueIndex, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { id, auditColumns, money, qty, note, meta } from './_common.js';
import { products, productionLines, warehouses } from './masterdata.js';
import { users } from './core.js';

export const machineStatusEnum = pgEnum('machine_status', ['running', 'idle', 'down', 'maintenance', 'retired']);

/** Makine kartları — kapasite raporu ekipmanları */
export const machines = pgTable('machines', {
  id: id(),
  code: text('code').notNull(), // MK-001
  name: text('name').notNull(),
  category: text('category').notNull(), // mixer, homogenizer, filler, sealer, pasteurizer, grinder, roaster, packaging, utility
  lineId: uuid('line_id').references(() => productionLines.id),
  warehouseId: uuid('warehouse_id').references(() => warehouses.id),
  /** Ana veri ekipman kaydı (T=8) ile bağ */
  productId: uuid('product_id').references(() => products.id),
  brand: text('brand'),
  model: text('model'),
  serialNo: text('serial_no'),
  capacityPerHour: qty('capacity_per_hour'),
  capacityUnit: text('capacity_unit'),
  powerKw: qty('power_kw'),
  installedAt: date('installed_at'),
  warrantyUntil: date('warranty_until'),
  purchaseCost: money('purchase_cost'),
  status: machineStatusEnum('status').notNull().default('idle'),
  location: text('location'),
  responsibleId: uuid('responsible_id').references(() => users.id),
  /** Çalışma saati sayacı */
  runtimeHours: qty('runtime_hours').notNull().default('0'),
  imageUrl: text('image_url'),
  specs: jsonb('specs').$type<Record<string, unknown>>().default({}),
  isActive: boolean('is_active').notNull().default(true),
  note: note(),
  ...auditColumns,
}, (t) => [uniqueIndex('machines_code_uq').on(t.code), index('machines_line_idx').on(t.lineId)]);

export const maintenancePlans = pgTable('maintenance_plans', {
  id: id(),
  machineId: uuid('machine_id').notNull().references(() => machines.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // Haftalık yağlama, Aylık conta kontrolü
  intervalValue: integer('interval_value').notNull().default(1),
  intervalUnit: text('interval_unit').notNull().default('month'), // day, week, month, runtime_hours
  checklist: jsonb('checklist').$type<string[]>().default([]),
  estimatedMinutes: integer('estimated_minutes').notNull().default(60),
  lastDoneAt: date('last_done_at'),
  nextDueAt: date('next_due_at'),
  assigneeId: uuid('assignee_id').references(() => users.id),
  isActive: boolean('is_active').notNull().default(true),
  ...auditColumns,
}, (t) => [index('maintenance_plans_machine_idx').on(t.machineId), index('maintenance_plans_next_due_idx').on(t.nextDueAt)]);

export const maintenanceKindEnum = pgEnum('maintenance_kind', ['preventive', 'corrective', 'inspection']);
export const maintenanceStatusEnum = pgEnum('maintenance_status', ['reported', 'planned', 'in_progress', 'waiting_parts', 'done', 'cancelled']);
export const maintenancePriorityEnum = pgEnum('maintenance_priority', ['low', 'normal', 'high', 'critical']);

/** Bakım iş emri (periyodik plandan otomatik veya fotoğraflı arıza bildirimi) */
export const maintenanceOrders = pgTable('maintenance_orders', {
  id: id(),
  docNo: text('doc_no').notNull(), // MO-2026-000001
  kind: maintenanceKindEnum('kind').notNull(),
  status: maintenanceStatusEnum('status').notNull().default('reported'),
  priority: maintenancePriorityEnum('priority').notNull().default('normal'),
  machineId: uuid('machine_id').notNull().references(() => machines.id),
  planId: uuid('plan_id').references(() => maintenancePlans.id),
  title: text('title').notNull(),
  description: text('description'),
  reportedBy: uuid('reported_by').references(() => users.id),
  reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow(),
  assigneeId: uuid('assignee_id').references(() => users.id),
  scheduledFor: date('scheduled_for'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  /** Duruş: makinenin üretim yapamadığı süre (dk) */
  downtimeMinutes: integer('downtime_minutes').notNull().default(0),
  laborMinutes: integer('labor_minutes').notNull().default(0),
  partsCost: money('parts_cost').notNull().default('0'),
  laborCost: money('labor_cost').notNull().default('0'),
  rootCause: text('root_cause'),
  resolution: text('resolution'),
  checklistResults: jsonb('checklist_results').$type<Array<{ item: string; done: boolean; note?: string }>>().default([]),
  /** Fotoğraflar attachments tablosunda (table_name='maintenance_orders') */
  photoCount: integer('photo_count').notNull().default(0),
  workOrderId: uuid('work_order_id'),
  note: note(),
  meta: meta(),
  ...auditColumns,
}, (t) => [uniqueIndex('maintenance_orders_docno_uq').on(t.docNo), index('maintenance_orders_machine_idx').on(t.machineId), index('maintenance_orders_status_idx').on(t.status)]);

export const downtimeReasonEnum = pgEnum('downtime_reason', ['breakdown', 'changeover', 'cleaning', 'material_shortage', 'no_operator', 'planned_maintenance', 'quality_hold', 'power', 'break', 'other']);

/** Duruş kayıtları → OEE kullanılabilirlik */
export const downtimes = pgTable('downtimes', {
  id: id(),
  machineId: uuid('machine_id').references(() => machines.id),
  lineId: uuid('line_id').references(() => productionLines.id),
  workOrderId: uuid('work_order_id'),
  maintenanceOrderId: uuid('maintenance_order_id').references(() => maintenanceOrders.id),
  reason: downtimeReasonEnum('reason').notNull(),
  isPlanned: boolean('is_planned').notNull().default(false),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  minutes: integer('minutes').notNull().default(0),
  reportedBy: uuid('reported_by').references(() => users.id),
  note: note(),
}, (t) => [index('downtimes_machine_idx').on(t.machineId, t.startedAt), index('downtimes_line_idx').on(t.lineId, t.startedAt)]);

/** Günlük OEE: kullanılabilirlik × performans × kalite */
export const oeeRecords = pgTable('oee_records', {
  id: id(),
  lineId: uuid('line_id').notNull().references(() => productionLines.id),
  machineId: uuid('machine_id').references(() => machines.id),
  day: date('day').notNull(),
  plannedMinutes: integer('planned_minutes').notNull(),
  downtimeMinutes: integer('downtime_minutes').notNull().default(0),
  runMinutes: integer('run_minutes').notNull().default(0),
  idealOutput: qty('ideal_output').notNull().default('0'),
  actualOutput: qty('actual_output').notNull().default('0'),
  goodOutput: qty('good_output').notNull().default('0'),
  availabilityPct: qty('availability_pct').notNull().default('0'),
  performancePct: qty('performance_pct').notNull().default('0'),
  qualityPct: qty('quality_pct').notNull().default('0'),
  oeePct: qty('oee_pct').notNull().default('0'),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('oee_records_uq').on(t.lineId, t.machineId, t.day)]);
