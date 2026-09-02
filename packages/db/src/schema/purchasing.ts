import { pgTable, text, uuid, boolean, integer, date, timestamp, index, uniqueIndex, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { id, auditColumns, money, qty, rate, note, meta } from './_common.js';
import { products, partners, warehouses, uoms } from './masterdata.js';
import { users } from './core.js';
import { documentOriginEnum } from './documents.js';

export const purchaseOrderStatusEnum = pgEnum('purchase_order_status', ['ai_draft', 'draft', 'pending_approval', 'approved', 'sent', 'confirmed', 'partially_received', 'received', 'invoiced', 'closed', 'cancelled', 'rejected']);

export const purchaseOrders = pgTable('purchase_orders', {
  id: id(),
  docNo: text('doc_no').notNull(), // PO-2026-000001
  status: purchaseOrderStatusEnum('status').notNull().default('draft'),
  partnerId: uuid('partner_id').notNull().references(() => partners.id),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  orderDate: date('order_date').notNull(),
  expectedDate: date('expected_date'),
  currency: text('currency').notNull().default('TRY'),
  exchangeRate: rate('exchange_rate').notNull().default('1'),
  paymentTermDays: integer('payment_term_days').notNull().default(0),
  subtotal: money('subtotal').notNull().default('0'),
  vatTotal: money('vat_total').notNull().default('0'),
  grandTotal: money('grand_total').notNull().default('0'),
  /** AI taslak bilgisi */
  isAiGenerated: boolean('is_ai_generated').notNull().default(false),
  aiRationale: text('ai_rationale'),
  aiConfidence: qty('ai_confidence'),
  isAutoApproved: boolean('is_auto_approved').notNull().default(false),
  approvalId: uuid('approval_id'),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  /** Tedarikçiye gönderim */
  sentAt: timestamp('sent_at', { withTimezone: true }),
  sentVia: text('sent_via'), // email, whatsapp, both
  sentTo: text('sent_to'),
  pdfPath: text('pdf_path'),
  supplierConfirmedAt: timestamp('supplier_confirmed_at', { withTimezone: true }),
  supplierRef: text('supplier_ref'),
  buyerId: uuid('buyer_id').references(() => users.id),
  origin: documentOriginEnum('origin').notNull().default('manual'),
  note: note(),
  meta: meta(),
  ...auditColumns,
}, (t) => [uniqueIndex('purchase_orders_docno_uq').on(t.docNo), index('purchase_orders_partner_idx').on(t.partnerId), index('purchase_orders_status_idx').on(t.status)]);

export const purchaseOrderLines = pgTable('purchase_order_lines', {
  id: id(),
  orderId: uuid('order_id').notNull().references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  description: text('description'),
  qty: qty('qty').notNull(),
  uomId: uuid('uom_id').notNull().references(() => uoms.id),
  unitPrice: money('unit_price').notNull(),
  vatRate: qty('vat_rate').notNull().default('20'),
  lineSubtotal: money('line_subtotal').notNull().default('0'),
  lineVat: money('line_vat').notNull().default('0'),
  lineTotal: money('line_total').notNull().default('0'),
  expectedDate: date('expected_date'),
  receivedQty: qty('received_qty').notNull().default('0'),
  invoicedQty: qty('invoiced_qty').notNull().default('0'),
  /** Kritik stok motoru gerekçesi */
  reorderRuleId: uuid('reorder_rule_id'),
  sequence: integer('sequence').notNull().default(10),
  note: note(),
}, (t) => [index('purchase_order_lines_order_idx').on(t.orderId), index('purchase_order_lines_product_idx').on(t.productId)]);

/** Kritik stok motoru çalıştırma günlüğü (hangi kalem neden önerildi) */
export const replenishmentRuns = pgTable('replenishment_runs', {
  id: id(),
  ranAt: timestamp('ran_at', { withTimezone: true }).notNull().defaultNow(),
  trigger: text('trigger').notNull().default('scheduled'), // scheduled, manual
  evaluated: integer('evaluated').notNull().default(0),
  suggested: integer('suggested').notNull().default(0),
  autoOrdered: integer('auto_ordered').notNull().default(0),
  items: jsonb('items').$type<Array<Record<string, unknown>>>().default([]),
  purchaseOrderIds: jsonb('purchase_order_ids').$type<string[]>().default([]),
});
