import { pgTable, text, uuid, integer, date, timestamp, index, uniqueIndex, pgEnum } from 'drizzle-orm/pg-core';
import { id, auditColumns, money, qty, rate, note, meta } from './_common.js';
import { partners, products } from './masterdata.js';
import { users } from './core.js';

export const incotermEnum = pgEnum('incoterm', ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF']);
export const exportStatusEnum = pgEnum('export_status', ['draft', 'proforma_sent', 'confirmed', 'packing', 'customs', 'shipped', 'delivered', 'closed', 'cancelled']);
export const exportRegimeEnum = pgEnum('export_regime', ['standard', 'etgb']); // ETGB mikro ihracat

export const hsCodes = pgTable('hs_codes', {
  id: id(),
  code: text('code').notNull(), // GTİP 12 hane
  description: text('description').notNull(),
  unit: text('unit'),
}, (t) => [uniqueIndex('hs_codes_code_uq').on(t.code)]);

export const exportShipments = pgTable('export_shipments', {
  id: id(),
  docNo: text('doc_no').notNull(), // EXP-2026-000001
  status: exportStatusEnum('status').notNull().default('draft'),
  regime: exportRegimeEnum('regime').notNull().default('standard'),
  partnerId: uuid('partner_id').notNull().references(() => partners.id),
  salesOrderId: uuid('sales_order_id'),
  deliveryId: uuid('delivery_id'),
  invoiceId: uuid('invoice_id'),
  incoterm: incotermEnum('incoterm').notNull().default('EXW'),
  incotermPlace: text('incoterm_place'),
  currency: text('currency').notNull().default('EUR'),
  /** Proforma */
  proformaNo: text('proforma_no'),
  proformaDate: date('proforma_date'),
  proformaAmount: money('proforma_amount').notNull().default('0'),
  /** Kur: fatura tarihi TCMB */
  exchangeRate: rate('exchange_rate'),
  exchangeRateDate: date('exchange_rate_date'),
  amountTry: money('amount_try').notNull().default('0'),
  /** Lojistik */
  destinationCountry: text('destination_country').notNull(),
  portOfLoading: text('port_of_loading'),
  portOfDischarge: text('port_of_discharge'),
  transportMode: text('transport_mode'), // road, sea, air, courier
  carrier: text('carrier'),
  trackingNo: text('tracking_no'),
  etd: date('etd'),
  eta: date('eta'),
  /** Paketleme özeti */
  grossWeightKg: qty('gross_weight_kg'),
  netWeightKg: qty('net_weight_kg'),
  packageCount: integer('package_count'),
  palletCount: integer('pallet_count'),
  /** Gümrük */
  customsDeclarationNo: text('customs_declaration_no'),
  customsDate: date('customs_date'),
  etgbNo: text('etgb_no'),
  ownerId: uuid('owner_id').references(() => users.id),
  note: note(),
  meta: meta(),
  ...auditColumns,
}, (t) => [uniqueIndex('export_shipments_docno_uq').on(t.docNo), index('export_shipments_partner_idx').on(t.partnerId), index('export_shipments_status_idx').on(t.status)]);

/** Packing list satırları */
export const exportPackages = pgTable('export_packages', {
  id: id(),
  shipmentId: uuid('shipment_id').notNull().references(() => exportShipments.id, { onDelete: 'cascade' }),
  packageNo: integer('package_no').notNull(),
  kind: text('kind').notNull().default('carton'), // carton, pallet
  productId: uuid('product_id').notNull().references(() => products.id),
  lotId: uuid('lot_id'),
  qty: qty('qty').notNull(),
  hsCode: text('hs_code'),
  netWeightKg: qty('net_weight_kg'),
  grossWeightKg: qty('gross_weight_kg'),
  lengthCm: qty('length_cm'),
  widthCm: qty('width_cm'),
  heightCm: qty('height_cm'),
  marks: text('marks'),
}, (t) => [index('export_packages_shipment_idx').on(t.shipmentId)]);

export const exportDocStatusEnum = pgEnum('export_doc_status', ['required', 'in_progress', 'ready', 'sent', 'received', 'not_required']);

/** Belge takip listesi: proforma, ticari fatura, packing list, ATR/EUR.1, menşe, sağlık sertifikası, konşimento, ETGB... */
export const exportDocuments = pgTable('export_documents', {
  id: id(),
  shipmentId: uuid('shipment_id').notNull().references(() => exportShipments.id, { onDelete: 'cascade' }),
  code: text('code').notNull(), // PROFORMA, INVOICE, PACKING_LIST, ATR, EUR1, ORIGIN, HEALTH, BL, CMR, AWB, ETGB, INSURANCE
  name: text('name').notNull(),
  status: exportDocStatusEnum('status').notNull().default('required'),
  docNo: text('doc_no'),
  issuedAt: date('issued_at'),
  attachmentId: uuid('attachment_id'),
  responsibleId: uuid('responsible_id').references(() => users.id),
  dueDate: date('due_date'),
  sequence: integer('sequence').notNull().default(10),
  note: note(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('export_documents_shipment_idx').on(t.shipmentId)]);
