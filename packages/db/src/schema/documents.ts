import { pgTable, text, uuid, index, uniqueIndex, pgEnum, timestamp } from 'drizzle-orm/pg-core';
import { id, qty } from './_common.js';

/**
 * Belge tipleri — belge zinciri: quotation → sales_order → delivery → invoice → payment
 * Satın alma: purchase_order → receipt → invoice(purchase) → payment
 * Üretim: work_order → (consumption moves, output lot)
 */
export const documentTypeEnum = pgEnum('document_type', [
  'quotation', 'sales_order', 'delivery', 'invoice', 'payment', 'credit_note',
  'purchase_order', 'receipt', 'transfer', 'stock_count', 'scrap',
  'work_order', 'quality_check', 'recall',
  'export_shipment', 'proforma', 'packing_list',
  'maintenance_order', 'journal_entry', 'bank_transaction', 'opportunity',
]);

export const documentOriginEnum = pgEnum('document_origin', ['chain', 'manual', 'import', 'sync', 'ai', 'system']);

/**
 * Belge bağlantıları (SAP B1 base/target document mantığı).
 * Satır düzeyi bağ: sourceLineId/targetLineId ile miktar zinciri (teslim ≤ sipariş, fatura ≤ teslim) doğrulanır.
 */
export const documentLinks = pgTable('document_links', {
  id: id(),
  sourceType: documentTypeEnum('source_type').notNull(),
  sourceId: uuid('source_id').notNull(),
  sourceLineId: uuid('source_line_id'),
  targetType: documentTypeEnum('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  targetLineId: uuid('target_line_id'),
  /** Bağ ile aktarılan miktar/tutar (satır bağlarında) */
  qty: qty('qty'),
  amount: qty('amount'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
}, (t) => [
  index('document_links_source_idx').on(t.sourceType, t.sourceId),
  index('document_links_target_idx').on(t.targetType, t.targetId),
  index('document_links_source_line_idx').on(t.sourceLineId),
  index('document_links_target_line_idx').on(t.targetLineId),
]);

/** Belge zinciri özet görünümü için: her belge kendi tablosunda `docNo` taşır; bu tablo hızlı arama içindir */
export const documentIndex = pgTable('document_index', {
  id: id(),
  type: documentTypeEnum('type').notNull(),
  recordId: uuid('record_id').notNull(),
  docNo: text('doc_no').notNull(),
  partnerId: uuid('partner_id'),
  status: text('status'),
  origin: documentOriginEnum('origin').notNull().default('chain'),
  title: text('title'),
  amount: qty('amount'),
  docDate: timestamp('doc_date', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('document_index_type_record_uq').on(t.type, t.recordId), index('document_index_docno_idx').on(t.docNo), index('document_index_partner_idx').on(t.partnerId)]);
