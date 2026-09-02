import { pgTable, text, uuid, boolean, integer, date, timestamp, index, uniqueIndex, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { id, auditColumns, money, qty, rate, note, meta } from './_common.js';
import { products, partners, salesChannels, priceLists, warehouses, uoms } from './masterdata.js';
import { users } from './core.js';
import { documentOriginEnum } from './documents.js';

/* ------------------------------------------------------------------ */
/* CRM — fırsat hunisi                                                 */
/* ------------------------------------------------------------------ */

export const opportunityStages = pgTable('opportunity_stages', {
  id: id(),
  code: text('code').notNull(), // lead, qualified, proposal, negotiation, won, lost
  name: text('name').notNull(),
  probability: integer('probability').notNull().default(10),
  sortOrder: integer('sort_order').notNull().default(0),
  isWon: boolean('is_won').notNull().default(false),
  isLost: boolean('is_lost').notNull().default(false),
}, (t) => [uniqueIndex('opportunity_stages_code_uq').on(t.code)]);

export const opportunities = pgTable('opportunities', {
  id: id(),
  docNo: text('doc_no').notNull(), // OPP-2026-000001
  title: text('title').notNull(),
  partnerId: uuid('partner_id').references(() => partners.id),
  /** Henüz cari değilse serbest metin */
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  stageId: uuid('stage_id').notNull().references(() => opportunityStages.id),
  channelId: uuid('channel_id').references(() => salesChannels.id),
  ownerId: uuid('owner_id').references(() => users.id),
  expectedAmount: money('expected_amount').notNull().default('0'),
  currency: text('currency').notNull().default('TRY'),
  probability: integer('probability').notNull().default(10),
  expectedCloseDate: date('expected_close_date'),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  lostReason: text('lost_reason'),
  source: text('source'), // web, referral, fair, inbound, outbound
  nextActivity: text('next_activity'),
  nextActivityDate: date('next_activity_date'),
  quotationId: uuid('quotation_id'),
  note: note(),
  meta: meta(),
  ...auditColumns,
}, (t) => [uniqueIndex('opportunities_docno_uq').on(t.docNo), index('opportunities_stage_idx').on(t.stageId), index('opportunities_partner_idx').on(t.partnerId)]);

export const opportunityActivities = pgTable('opportunity_activities', {
  id: id(),
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // call, email, meeting, note, whatsapp
  body: text('body').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  userId: uuid('user_id').references(() => users.id),
}, (t) => [index('opportunity_activities_opp_idx').on(t.opportunityId, t.at)]);

/* ------------------------------------------------------------------ */
/* Teklif → Sipariş (tek tablo, docType ile) — SAP B1'de ayrı belgeler; */
/* burada aynı satır yapısı; zincir document_links ile                   */
/* ------------------------------------------------------------------ */

export const salesDocTypeEnum = pgEnum('sales_doc_type', ['quotation', 'order']);
export const salesOrderStatusEnum = pgEnum('sales_order_status', ['draft', 'sent', 'accepted', 'confirmed', 'partially_delivered', 'delivered', 'invoiced', 'closed', 'cancelled', 'lost']);

export const salesOrders = pgTable('sales_orders', {
  id: id(),
  docType: salesDocTypeEnum('doc_type').notNull().default('order'),
  docNo: text('doc_no').notNull(), // QT-2026-000001 / SO-2026-000001
  status: salesOrderStatusEnum('status').notNull().default('draft'),
  partnerId: uuid('partner_id').notNull().references(() => partners.id),
  channelId: uuid('channel_id').notNull().references(() => salesChannels.id),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  priceListId: uuid('price_list_id').references(() => priceLists.id),
  billingAddressId: uuid('billing_address_id'),
  shippingAddressId: uuid('shipping_address_id'),
  opportunityId: uuid('opportunity_id').references(() => opportunities.id),
  quotationId: uuid('quotation_id'),
  /** Pazaryeri sipariş no / müşteri sipariş no */
  externalOrderNo: text('external_order_no'),
  customerRef: text('customer_ref'),
  orderDate: date('order_date').notNull(),
  validUntil: date('valid_until'),
  requestedDeliveryDate: date('requested_delivery_date'),
  currency: text('currency').notNull().default('TRY'),
  exchangeRate: rate('exchange_rate').notNull().default('1'),
  /** Vade */
  paymentTermDays: integer('payment_term_days').notNull().default(0),
  dueDate: date('due_date'),
  /** Tutarlar (belge para birimi) */
  subtotal: money('subtotal').notNull().default('0'),
  discountTotal: money('discount_total').notNull().default('0'),
  vatTotal: money('vat_total').notNull().default('0'),
  grandTotal: money('grand_total').notNull().default('0'),
  /** Kanal kesintileri → net ciro */
  commissionAmount: money('commission_amount').notNull().default('0'),
  shippingDeduction: money('shipping_deduction').notNull().default('0'),
  otherDeduction: money('other_deduction').notNull().default('0'),
  netRevenue: money('net_revenue').notNull().default('0'),
  /** İhracat */
  isExport: boolean('is_export').notNull().default(false),
  incoterm: text('incoterm'),
  exportShipmentId: uuid('export_shipment_id'),
  salespersonId: uuid('salesperson_id').references(() => users.id),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  confirmedBy: uuid('confirmed_by').references(() => users.id),
  origin: documentOriginEnum('origin').notNull().default('manual'),
  note: note(),
  meta: meta(),
  ...auditColumns,
}, (t) => [uniqueIndex('sales_orders_docno_uq').on(t.docNo), index('sales_orders_partner_idx').on(t.partnerId), index('sales_orders_channel_date_idx').on(t.channelId, t.orderDate), index('sales_orders_status_idx').on(t.status), index('sales_orders_external_idx').on(t.externalOrderNo)]);

export const salesOrderLines = pgTable('sales_order_lines', {
  id: id(),
  orderId: uuid('order_id').notNull().references(() => salesOrders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  description: text('description'),
  qty: qty('qty').notNull(),
  uomId: uuid('uom_id').notNull().references(() => uoms.id),
  unitPrice: money('unit_price').notNull(),
  discountPct: qty('discount_pct').notNull().default('0'),
  vatRate: qty('vat_rate').notNull().default('1'),
  lineSubtotal: money('line_subtotal').notNull().default('0'),
  lineVat: money('line_vat').notNull().default('0'),
  lineTotal: money('line_total').notNull().default('0'),
  /** Miktar zinciri: teslim ≤ sipariş, fatura ≤ teslim */
  deliveredQty: qty('delivered_qty').notNull().default('0'),
  invoicedQty: qty('invoiced_qty').notNull().default('0'),
  /** Fiyat kaynağı */
  priceSource: text('price_source'), // list, customer, manual, channel
  sequence: integer('sequence').notNull().default(10),
  note: note(),
}, (t) => [index('sales_order_lines_order_idx').on(t.orderId), index('sales_order_lines_product_idx').on(t.productId)]);

/* ------------------------------------------------------------------ */
/* Pazaryeri senkron — ham siparişler ve hakediş (settlement)           */
/* ------------------------------------------------------------------ */

export const channelOrders = pgTable('channel_orders', {
  id: id(),
  channelId: uuid('channel_id').notNull().references(() => salesChannels.id),
  externalId: text('external_id').notNull(),
  externalStatus: text('external_status'),
  orderedAt: timestamp('ordered_at', { withTimezone: true }).notNull(),
  customerName: text('customer_name'),
  customerEmail: text('customer_email'),
  customerPhone: text('customer_phone'),
  shippingAddress: jsonb('shipping_address').$type<Record<string, unknown>>().default({}),
  grossAmount: money('gross_amount').notNull().default('0'),
  commissionAmount: money('commission_amount').notNull().default('0'),
  shippingAmount: money('shipping_amount').notNull().default('0'),
  netAmount: money('net_amount').notNull().default('0'),
  currency: text('currency').notNull().default('TRY'),
  lines: jsonb('lines').$type<Array<Record<string, unknown>>>().default([]),
  raw: jsonb('raw'),
  /** Dönüştürülen satış siparişi */
  salesOrderId: uuid('sales_order_id').references(() => salesOrders.id),
  syncStatus: text('sync_status').notNull().default('new'), // new, converted, ignored, error
  syncError: text('sync_error'),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('channel_orders_uq').on(t.channelId, t.externalId), index('channel_orders_status_idx').on(t.syncStatus)]);

export const channelSettlements = pgTable('channel_settlements', {
  id: id(),
  channelId: uuid('channel_id').notNull().references(() => salesChannels.id),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  grossSales: money('gross_sales').notNull().default('0'),
  commissions: money('commissions').notNull().default('0'),
  shippingDeductions: money('shipping_deductions').notNull().default('0'),
  otherDeductions: money('other_deductions').notNull().default('0'),
  returns: money('returns').notNull().default('0'),
  netPayout: money('net_payout').notNull().default('0'),
  expectedPayoutDate: date('expected_payout_date'),
  paidAt: date('paid_at'),
  bankTransactionId: uuid('bank_transaction_id'),
  status: text('status').notNull().default('open'), // open, paid, disputed
  ...auditColumns,
}, (t) => [index('channel_settlements_channel_idx').on(t.channelId, t.periodStart)]);
