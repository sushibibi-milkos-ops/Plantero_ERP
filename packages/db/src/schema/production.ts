import { pgTable, text, uuid, boolean, integer, timestamp, index, uniqueIndex, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { id, auditColumns, money, qty, note, meta } from './_common.js';
import { products, boms, productionLines, locations, uoms, warehouses } from './masterdata.js';
import { stockLots } from './stock.js';
import { users } from './core.js';
import { documentOriginEnum } from './documents.js';

export const workOrderStatusEnum = pgEnum('work_order_status', ['draft', 'planned', 'released', 'in_progress', 'paused', 'finished', 'closed', 'cancelled']);

/** İş emri */
export const workOrders = pgTable('work_orders', {
  id: id(),
  docNo: text('doc_no').notNull(), // WO-2026-000001
  status: workOrderStatusEnum('status').notNull().default('draft'),
  productId: uuid('product_id').notNull().references(() => products.id),
  bomId: uuid('bom_id').notNull().references(() => boms.id),
  lineId: uuid('line_id').notNull().references(() => productionLines.id),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  /** Hammadde çekilecek kaynak lokasyon (FEFO alt ağaç) ve mamulün gideceği lokasyon */
  sourceLocationId: uuid('source_location_id').notNull().references(() => locations.id),
  destLocationId: uuid('dest_location_id').notNull().references(() => locations.id),
  plannedQty: qty('planned_qty').notNull(),
  producedQty: qty('produced_qty').notNull().default('0'),
  scrapQty: qty('scrap_qty').notNull().default('0'),
  uomId: uuid('uom_id').notNull().references(() => uoms.id),
  /** Verim % = produced / (planned tüketime göre beklenen) */
  yieldPct: qty('yield_pct'),
  plannedStart: timestamp('planned_start', { withTimezone: true }),
  plannedEnd: timestamp('planned_end', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  /** Toplam çalışma süresi (dk) — olaylardan hesaplanır */
  runMinutes: integer('run_minutes').notNull().default(0),
  pauseMinutes: integer('pause_minutes').notNull().default(0),
  /** Üretilen mamul lotu (otomatik numara) */
  outputLotId: uuid('output_lot_id').references(() => stockLots.id),
  /** Maliyet: tüketilen lotlar + genel gider → mamul birim maliyeti */
  materialCost: money('material_cost').notNull().default('0'),
  overheadCost: money('overhead_cost').notNull().default('0'),
  totalCost: money('total_cost').notNull().default('0'),
  unitCost: money('unit_cost').notNull().default('0'),
  operatorId: uuid('operator_id').references(() => users.id),
  salesOrderId: uuid('sales_order_id'),
  priority: integer('priority').notNull().default(0),
  origin: documentOriginEnum('origin').notNull().default('manual'),
  note: note(),
  meta: meta(),
  ...auditColumns,
}, (t) => [uniqueIndex('work_orders_docno_uq').on(t.docNo), index('work_orders_status_idx').on(t.status), index('work_orders_line_idx').on(t.lineId, t.plannedStart), index('work_orders_product_idx').on(t.productId), index('work_orders_output_lot_idx').on(t.outputLotId)]);

/** Planlanan malzeme (reçete × miktar) */
export const workOrderMaterials = pgTable('work_order_materials', {
  id: id(),
  workOrderId: uuid('work_order_id').notNull().references(() => workOrders.id, { onDelete: 'cascade' }),
  bomLineId: uuid('bom_line_id'),
  productId: uuid('product_id').notNull().references(() => products.id),
  plannedQty: qty('planned_qty').notNull(),
  consumedQty: qty('consumed_qty').notNull().default('0'),
  uomId: uuid('uom_id').notNull().references(() => uoms.id),
  isByproduct: boolean('is_byproduct').notNull().default(false),
  sequence: integer('sequence').notNull().default(10),
}, (t) => [index('work_order_materials_wo_idx').on(t.workOrderId)]);

/** Gerçek tüketim — lot bazlı (FEFO çekiş). Her satır bir stock_move üretir. */
export const workOrderConsumptions = pgTable('work_order_consumptions', {
  id: id(),
  workOrderId: uuid('work_order_id').notNull().references(() => workOrders.id, { onDelete: 'cascade' }),
  materialId: uuid('material_id').references(() => workOrderMaterials.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  lotId: uuid('lot_id').notNull().references(() => stockLots.id),
  fromLocationId: uuid('from_location_id').notNull().references(() => locations.id),
  qty: qty('qty').notNull(),
  uomId: uuid('uom_id').notNull().references(() => uoms.id),
  unitCost: money('unit_cost').notNull(),
  value: money('value').notNull(),
  stockMoveId: uuid('stock_move_id'),
  /** Operatör barkod okutması */
  scannedBarcode: text('scanned_barcode'),
  scannedBy: uuid('scanned_by').references(() => users.id),
  consumedAt: timestamp('consumed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('work_order_consumptions_wo_idx').on(t.workOrderId), index('work_order_consumptions_lot_idx').on(t.lotId)]);

/** Üretim çıktıları (mamul + yan ürün) — her satır bir stock_move + lot */
export const workOrderOutputs = pgTable('work_order_outputs', {
  id: id(),
  workOrderId: uuid('work_order_id').notNull().references(() => workOrders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  lotId: uuid('lot_id').notNull().references(() => stockLots.id),
  toLocationId: uuid('to_location_id').notNull().references(() => locations.id),
  qty: qty('qty').notNull(),
  uomId: uuid('uom_id').notNull().references(() => uoms.id),
  isByproduct: boolean('is_byproduct').notNull().default(false),
  /** Yan ürün maliyet payı % */
  costSharePct: qty('cost_share_pct').notNull().default('100'),
  unitCost: money('unit_cost').notNull(),
  value: money('value').notNull(),
  stockMoveId: uuid('stock_move_id'),
  producedAt: timestamp('produced_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('work_order_outputs_wo_idx').on(t.workOrderId), index('work_order_outputs_lot_idx').on(t.lotId)]);

/** Fire kaydı (operatör "fire gir") — stok düşümü scrap move ile */
export const workOrderScraps = pgTable('work_order_scraps', {
  id: id(),
  workOrderId: uuid('work_order_id').notNull().references(() => workOrders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  lotId: uuid('lot_id').references(() => stockLots.id),
  qty: qty('qty').notNull(),
  uomId: uuid('uom_id').notNull().references(() => uoms.id),
  reason: text('reason').notNull(), // spill, burnt, contamination, packaging, startup, other
  stage: text('stage'), // hammadde / proses / ambalaj
  unitCost: money('unit_cost').notNull().default('0'),
  value: money('value').notNull().default('0'),
  stockMoveId: uuid('stock_move_id'),
  recordedBy: uuid('recorded_by').references(() => users.id),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  note: note(),
}, (t) => [index('work_order_scraps_wo_idx').on(t.workOrderId)]);

export const workOrderEventKindEnum = pgEnum('work_order_event_kind', ['start', 'pause', 'resume', 'finish', 'scan', 'scrap', 'output', 'note', 'downtime']);

/** Operatör olay günlüğü: başlat / duraklat / okut / bitir; duruş sebepleri OEE'ye gider */
export const workOrderEvents = pgTable('work_order_events', {
  id: id(),
  workOrderId: uuid('work_order_id').notNull().references(() => workOrders.id, { onDelete: 'cascade' }),
  kind: workOrderEventKindEnum('kind').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  userId: uuid('user_id').references(() => users.id),
  /** Duruş nedeni (downtime): machine_failure, material_wait, changeover, cleaning, break, other */
  reason: text('reason'),
  durationMinutes: integer('duration_minutes'),
  payload: jsonb('payload').$type<Record<string, unknown>>().default({}),
}, (t) => [index('work_order_events_wo_idx').on(t.workOrderId, t.at)]);
