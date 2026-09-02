import { pgTable, text, uuid, boolean, integer, timestamp, index, uniqueIndex, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { id, auditColumns, qty, note, meta } from './_common.js';
import { products, partners } from './masterdata.js';
import { stockLots, receipts, receiptLines } from './stock.js';
import { users } from './core.js';

export const qcResultEnum = pgEnum('qc_result', ['pending', 'passed', 'failed', 'waived']);

/** Kontrol şablonu: ürün/kategori bazlı test kalemleri */
export const qcTemplates = pgTable('qc_templates', {
  id: id(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  productId: uuid('product_id').references(() => products.id),
  productType: text('product_type'), // raw_material, finished ...
  isActive: boolean('is_active').notNull().default(true),
  ...auditColumns,
}, (t) => [uniqueIndex('qc_templates_code_uq').on(t.code)]);

export const qcTemplateItems = pgTable('qc_template_items', {
  id: id(),
  templateId: uuid('template_id').notNull().references(() => qcTemplates.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // Nem %, pH, Koku, Ambalaj bütünlüğü, Sertifika
  kind: text('kind').notNull().default('numeric'), // numeric, boolean, text, document
  minValue: qty('min_value'),
  maxValue: qty('max_value'),
  unit: text('unit'),
  isCritical: boolean('is_critical').notNull().default(false),
  sequence: integer('sequence').notNull().default(10),
});

/** Girdi kalite kontrolü — mal kabul satırı / lot başına */
export const qcChecks = pgTable('qc_checks', {
  id: id(),
  docNo: text('doc_no').notNull(), // QC-2026-000001
  kind: text('kind').notNull().default('incoming'), // incoming, in_process, final
  templateId: uuid('template_id').references(() => qcTemplates.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  lotId: uuid('lot_id').references(() => stockLots.id),
  receiptId: uuid('receipt_id').references(() => receipts.id),
  receiptLineId: uuid('receipt_line_id').references(() => receiptLines.id),
  workOrderId: uuid('work_order_id'),
  supplierId: uuid('supplier_id').references(() => partners.id),
  result: qcResultEnum('result').notNull().default('pending'),
  sampledQty: qty('sampled_qty'),
  inspectorId: uuid('inspector_id').references(() => users.id),
  checkedAt: timestamp('checked_at', { withTimezone: true }),
  decisionNote: text('decision_note'),
  /** Karar sonucu lot durumu: released / rejected */
  disposition: text('disposition'),
  note: note(),
  meta: meta(),
  ...auditColumns,
}, (t) => [uniqueIndex('qc_checks_docno_uq').on(t.docNo), index('qc_checks_lot_idx').on(t.lotId), index('qc_checks_supplier_idx').on(t.supplierId), index('qc_checks_result_idx').on(t.result)]);

export const qcCheckResults = pgTable('qc_check_results', {
  id: id(),
  checkId: uuid('check_id').notNull().references(() => qcChecks.id, { onDelete: 'cascade' }),
  templateItemId: uuid('template_item_id').references(() => qcTemplateItems.id),
  name: text('name').notNull(),
  valueNumeric: qty('value_numeric'),
  valueBool: boolean('value_bool'),
  valueText: text('value_text'),
  isPassed: boolean('is_passed'),
  sequence: integer('sequence').notNull().default(10),
}, (t) => [index('qc_check_results_check_idx').on(t.checkId)]);

/** Tedarikçi kalite skoru — aylık özet (kabul oranı, zamanında teslimat, ret) */
export const supplierScores = pgTable('supplier_scores', {
  id: id(),
  partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'cascade' }),
  period: text('period').notNull(), // 2026-09
  receipts: integer('receipts').notNull().default(0),
  onTimeReceipts: integer('on_time_receipts').notNull().default(0),
  qcChecks: integer('qc_checks').notNull().default(0),
  qcPassed: integer('qc_passed').notNull().default(0),
  rejectedQty: qty('rejected_qty').notNull().default('0'),
  receivedQty: qty('received_qty').notNull().default('0'),
  /** 0-100 (ağırlık: kalite %50, zamanında %30, miktar doğruluğu %20) */
  score: qty('score').notNull().default('0'),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('supplier_scores_uq').on(t.partnerId, t.period)]);

/* ------------------------------------------------------------------ */
/* Geri çağırma simülasyonu / gerçek geri çağırma                      */
/* ------------------------------------------------------------------ */

export const recallStatusEnum = pgEnum('recall_status', ['simulation', 'open', 'in_progress', 'closed']);

export const recalls = pgTable('recalls', {
  id: id(),
  docNo: text('doc_no').notNull(), // RC-2026-000001
  status: recallStatusEnum('status').notNull().default('simulation'),
  /** Başlangıç noktası: hammadde lotu veya mamul lotu */
  rootLotId: uuid('root_lot_id').notNull().references(() => stockLots.id),
  direction: text('direction').notNull().default('both'), // forward, backward, both
  reason: text('reason').notNull(),
  /** Hesaplanan etki: lot sayısı, iş emri sayısı, müşteri sayısı, sevk miktarı, stok miktarı */
  impact: jsonb('impact').$type<Record<string, unknown>>().default({}),
  initiatedBy: uuid('initiated_by').references(() => users.id),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  note: note(),
  ...auditColumns,
}, (t) => [uniqueIndex('recalls_docno_uq').on(t.docNo), index('recalls_root_lot_idx').on(t.rootLotId)]);

/** Geri çağırmanın etkilediği lotlar / müşteriler (izlenebilirlik sorgusunun snapshot'ı) */
export const recallItems = pgTable('recall_items', {
  id: id(),
  recallId: uuid('recall_id').notNull().references(() => recalls.id, { onDelete: 'cascade' }),
  lotId: uuid('lot_id').notNull().references(() => stockLots.id),
  /** Zincirdeki konum: raw_material, work_order, finished, delivered */
  hop: text('hop').notNull(),
  depth: integer('depth').notNull().default(0),
  workOrderId: uuid('work_order_id'),
  deliveryId: uuid('delivery_id'),
  partnerId: uuid('partner_id').references(() => partners.id),
  qtyInStock: qty('qty_in_stock').notNull().default('0'),
  qtyDelivered: qty('qty_delivered').notNull().default('0'),
  action: text('action'), // block, notify_customer, return, destroy
  actionStatus: text('action_status').notNull().default('pending'),
  actionAt: timestamp('action_at', { withTimezone: true }),
}, (t) => [index('recall_items_recall_idx').on(t.recallId), index('recall_items_lot_idx').on(t.lotId)]);
