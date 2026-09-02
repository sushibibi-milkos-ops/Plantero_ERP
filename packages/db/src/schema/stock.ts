import { pgTable, text, uuid, boolean, integer, date, timestamp, index, uniqueIndex, unique, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { id, auditColumns, money, qty, note, meta } from './_common.js';
import { products, partners, locations, warehouses, uoms } from './masterdata.js';
import { users } from './core.js';
import { documentOriginEnum } from './documents.js';

/* ------------------------------------------------------------------ */
/* Lotlar — izlenebilirliğin omurgası                                  */
/* ------------------------------------------------------------------ */

export const lotStatusEnum = pgEnum('lot_status', ['quarantine', 'released', 'rejected', 'consumed', 'recalled', 'expired']);
export const lotOriginEnum = pgEnum('lot_origin', ['receipt', 'production', 'count', 'opening', 'return']);

export const stockLots = pgTable('stock_lots', {
  id: id(),
  /** Lot no: hammadde → tedarikçi lotu veya GR-... ; mamul → otomatik "PL-YYMMDD-HAT-SIRA" */
  lotNo: text('lot_no').notNull(),
  productId: uuid('product_id').notNull().references(() => products.id),
  status: lotStatusEnum('status').notNull().default('quarantine'),
  origin: lotOriginEnum('origin').notNull(),
  /** Tedarikçi lot numarası (hammadde) */
  supplierLotNo: text('supplier_lot_no'),
  supplierId: uuid('supplier_id').references(() => partners.id),
  /** Kaynak belgeler — zincir asla kopmaz */
  originReceiptId: uuid('origin_receipt_id'),
  originReceiptLineId: uuid('origin_receipt_line_id'),
  originWorkOrderId: uuid('origin_work_order_id'),
  /** Üretim / SKT */
  productionDate: date('production_date'),
  expiryDate: date('expiry_date'),
  /** Ürün kartındaki gün ofsetlerinden türetilen FEFO alanları */
  alertDate: date('alert_date'),
  removalDate: date('removal_date'),
  /** Lot birim maliyeti — envanter değeri = Σ quant.qty × lot.unitCost */
  unitCost: money('unit_cost').notNull().default('0'),
  /** İlk giriş miktarı (tüketim ≤ giriş kontrolü) */
  initialQty: qty('initial_qty').notNull().default('0'),
  uomId: uuid('uom_id').notNull().references(() => uoms.id),
  /** Kalite */
  qcStatus: text('qc_status'), // pending, passed, failed, waived
  qcCheckId: uuid('qc_check_id'),
  releasedAt: timestamp('released_at', { withTimezone: true }),
  releasedBy: uuid('released_by').references(() => users.id),
  rejectReason: text('reject_reason'),
  /** Geri çağırma */
  recallId: uuid('recall_id'),
  note: note(),
  meta: meta(),
  ...auditColumns,
}, (t) => [uniqueIndex('stock_lots_product_lotno_uq').on(t.productId, t.lotNo), index('stock_lots_lotno_idx').on(t.lotNo), index('stock_lots_expiry_idx').on(t.expiryDate), index('stock_lots_status_idx').on(t.status), index('stock_lots_origin_wo_idx').on(t.originWorkOrderId), index('stock_lots_origin_receipt_idx').on(t.originReceiptId)]);

/* ------------------------------------------------------------------ */
/* Quant: eldeki stok (ürün × lokasyon × lot) + rezervasyon             */
/* ------------------------------------------------------------------ */

export const stockQuants = pgTable('stock_quants', {
  id: id(),
  productId: uuid('product_id').notNull().references(() => products.id),
  locationId: uuid('location_id').notNull().references(() => locations.id),
  lotId: uuid('lot_id').references(() => stockLots.id),
  qty: qty('qty').notNull().default('0'),
  reservedQty: qty('reserved_qty').notNull().default('0'),
  /** FIFO/FEFO sıralama anahtarları (denormalize) */
  inDate: timestamp('in_date', { withTimezone: true }).notNull().defaultNow(),
  expiryDate: date('expiry_date'),
  /** Sayım için */
  lastCountDate: date('last_count_date'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('stock_quants_uq').on(t.productId, t.locationId, t.lotId).nullsNotDistinct(), index('stock_quants_location_idx').on(t.locationId), index('stock_quants_product_idx').on(t.productId), index('stock_quants_expiry_idx').on(t.expiryDate)]);

/* ------------------------------------------------------------------ */
/* Stok hareket defteri — her satır maliyetli, muhasebe fişine bağlı    */
/* ------------------------------------------------------------------ */

export const stockMoveKindEnum = pgEnum('stock_move_kind', [
  'receipt',        // mal kabul (tedarikçi → depo/karantina)
  'delivery',       // sevkiyat (depo → müşteri)
  'transfer',       // lokasyonlar arası
  'consumption',    // üretim tüketimi (depo → üretim)
  'production',     // üretim çıktısı (üretim → depo)
  'byproduct',
  'scrap',          // fire / hurda
  'count_gain',     // sayım fazlası
  'count_loss',     // sayım eksiği
  'quarantine_release', // karantina → serbest
  'quarantine_reject',  // karantina → red
  'return_in',
  'return_out',
  'opening',
  'recall_return',
]);

export const stockMoves = pgTable('stock_moves', {
  id: id(),
  moveNo: text('move_no').notNull(), // SM-2026-000001
  kind: stockMoveKindEnum('kind').notNull(),
  productId: uuid('product_id').notNull().references(() => products.id),
  lotId: uuid('lot_id').references(() => stockLots.id),
  fromLocationId: uuid('from_location_id').notNull().references(() => locations.id),
  toLocationId: uuid('to_location_id').notNull().references(() => locations.id),
  qty: qty('qty').notNull(),
  uomId: uuid('uom_id').notNull().references(() => uoms.id),
  /** Maliyet: qty × unitCost = value (veri kritik doğrular) */
  unitCost: money('unit_cost').notNull(),
  value: money('value').notNull(),
  /** Üretim hareketinde genel gider payı (731); value = malzeme + overheadValue */
  overheadValue: money('overhead_value'),
  /** Kaynak belge (polimorfik) */
  refType: text('ref_type').notNull(), // receipt, delivery, work_order, transfer, stock_count, scrap, quality_check, recall
  refId: uuid('ref_id').notNull(),
  refLineId: uuid('ref_line_id'),
  refNo: text('ref_no'),
  partnerId: uuid('partner_id').references(() => partners.id),
  /** Muhasebe fişi — her stok hareketi için zorunlu (değerli hareketlerde) */
  journalEntryId: uuid('journal_entry_id'),
  isValued: boolean('is_valued').notNull().default(true),
  origin: documentOriginEnum('origin').notNull().default('chain'),
  movedAt: timestamp('moved_at', { withTimezone: true }).notNull().defaultNow(),
  note: note(),
  ...auditColumns,
}, (t) => [uniqueIndex('stock_moves_no_uq').on(t.moveNo), index('stock_moves_product_idx').on(t.productId, t.movedAt), index('stock_moves_lot_idx').on(t.lotId), index('stock_moves_ref_idx').on(t.refType, t.refId), index('stock_moves_from_idx').on(t.fromLocationId), index('stock_moves_to_idx').on(t.toLocationId), index('stock_moves_journal_idx').on(t.journalEntryId)]);

/* ------------------------------------------------------------------ */
/* Mal kabul                                                           */
/* ------------------------------------------------------------------ */

export const receiptStatusEnum = pgEnum('receipt_status', ['draft', 'received', 'qc_pending', 'done', 'cancelled']);

export const receipts = pgTable('receipts', {
  id: id(),
  docNo: text('doc_no').notNull(), // GR-2026-000001
  status: receiptStatusEnum('status').notNull().default('draft'),
  partnerId: uuid('partner_id').references(() => partners.id),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  purchaseOrderId: uuid('purchase_order_id'),
  /** Tedarikçi irsaliye no / tarih */
  supplierDeliveryNo: text('supplier_delivery_no'),
  supplierDeliveryDate: date('supplier_delivery_date'),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  receivedBy: uuid('received_by').references(() => users.id),
  origin: documentOriginEnum('origin').notNull().default('chain'),
  /** Tedarikçi teslimat performansı (kalite skoru) */
  wasOnTime: boolean('was_on_time'),
  note: note(),
  meta: meta(),
  ...auditColumns,
}, (t) => [uniqueIndex('receipts_docno_uq').on(t.docNo), index('receipts_partner_idx').on(t.partnerId), index('receipts_po_idx').on(t.purchaseOrderId), index('receipts_status_idx').on(t.status)]);

export const receiptLines = pgTable('receipt_lines', {
  id: id(),
  receiptId: uuid('receipt_id').notNull().references(() => receipts.id, { onDelete: 'cascade' }),
  purchaseOrderLineId: uuid('purchase_order_line_id'),
  productId: uuid('product_id').notNull().references(() => products.id),
  qty: qty('qty').notNull(),
  uomId: uuid('uom_id').notNull().references(() => uoms.id),
  unitCost: money('unit_cost').notNull().default('0'),
  /** Lot bilgileri (kabulde oluşturulur) */
  lotId: uuid('lot_id').references(() => stockLots.id),
  supplierLotNo: text('supplier_lot_no'),
  expiryDate: date('expiry_date'),
  productionDate: date('production_date'),
  /** Kabul kararı: karantina / serbest / red */
  disposition: text('disposition').notNull().default('quarantine'), // quarantine, released, rejected
  toLocationId: uuid('to_location_id').references(() => locations.id),
  rejectedQty: qty('rejected_qty').notNull().default('0'),
  rejectReason: text('reject_reason'),
  /** Sıcaklık, ambalaj durumu vb. */
  inspection: jsonb('inspection').$type<Record<string, unknown>>().default({}),
  sequence: integer('sequence').notNull().default(10),
  note: note(),
}, (t) => [index('receipt_lines_receipt_idx').on(t.receiptId), index('receipt_lines_lot_idx').on(t.lotId), index('receipt_lines_po_line_idx').on(t.purchaseOrderLineId)]);

/* ------------------------------------------------------------------ */
/* Sevkiyat / irsaliye — FEFO picking                                  */
/* ------------------------------------------------------------------ */

export const deliveryStatusEnum = pgEnum('delivery_status', ['draft', 'reserved', 'picking', 'picked', 'shipped', 'delivered', 'cancelled']);

export const deliveries = pgTable('deliveries', {
  id: id(),
  docNo: text('doc_no').notNull(), // DN-2026-000001
  status: deliveryStatusEnum('status').notNull().default('draft'),
  partnerId: uuid('partner_id').notNull().references(() => partners.id),
  salesOrderId: uuid('sales_order_id'),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  shippingAddressId: uuid('shipping_address_id'),
  channelId: uuid('channel_id'),
  scheduledDate: date('scheduled_date'),
  shippedAt: timestamp('shipped_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  carrier: text('carrier'),
  trackingNo: text('tracking_no'),
  /** e-İrsaliye */
  eDespatchStatus: text('e_despatch_status'), // none, queued, sent, accepted, rejected
  eDespatchUuid: text('e_despatch_uuid'),
  pickedBy: uuid('picked_by').references(() => users.id),
  origin: documentOriginEnum('origin').notNull().default('chain'),
  note: note(),
  meta: meta(),
  ...auditColumns,
}, (t) => [uniqueIndex('deliveries_docno_uq').on(t.docNo), index('deliveries_partner_idx').on(t.partnerId), index('deliveries_so_idx').on(t.salesOrderId), index('deliveries_status_idx').on(t.status)]);

export const deliveryLines = pgTable('delivery_lines', {
  id: id(),
  deliveryId: uuid('delivery_id').notNull().references(() => deliveries.id, { onDelete: 'cascade' }),
  salesOrderLineId: uuid('sales_order_line_id'),
  productId: uuid('product_id').notNull().references(() => products.id),
  /** Talep miktarı */
  qty: qty('qty').notNull(),
  /** Toplanan/sevk edilen miktar */
  pickedQty: qty('picked_qty').notNull().default('0'),
  uomId: uuid('uom_id').notNull().references(() => uoms.id),
  /** Lot: FEFO ile atanır; müşteriye giden her lot burada — zincirin son halkası */
  lotId: uuid('lot_id').references(() => stockLots.id),
  fromLocationId: uuid('from_location_id').references(() => locations.id),
  unitCost: money('unit_cost'),
  sequence: integer('sequence').notNull().default(10),
  note: note(),
}, (t) => [index('delivery_lines_delivery_idx').on(t.deliveryId), index('delivery_lines_lot_idx').on(t.lotId), index('delivery_lines_so_line_idx').on(t.salesOrderLineId)]);

/* ------------------------------------------------------------------ */
/* Transfer (lokasyonlar arası / depolar arası)                        */
/* ------------------------------------------------------------------ */

export const transferStatusEnum = pgEnum('transfer_status', ['draft', 'in_transit', 'done', 'cancelled']);

export const transfers = pgTable('transfers', {
  id: id(),
  docNo: text('doc_no').notNull(), // TR-2026-000001
  status: transferStatusEnum('status').notNull().default('draft'),
  fromWarehouseId: uuid('from_warehouse_id').notNull().references(() => warehouses.id),
  toWarehouseId: uuid('to_warehouse_id').notNull().references(() => warehouses.id),
  fromLocationId: uuid('from_location_id').references(() => locations.id),
  toLocationId: uuid('to_location_id').references(() => locations.id),
  scheduledDate: date('scheduled_date'),
  doneAt: timestamp('done_at', { withTimezone: true }),
  reason: text('reason'),
  origin: documentOriginEnum('origin').notNull().default('manual'),
  note: note(),
  ...auditColumns,
}, (t) => [uniqueIndex('transfers_docno_uq').on(t.docNo), index('transfers_status_idx').on(t.status)]);

export const transferLines = pgTable('transfer_lines', {
  id: id(),
  transferId: uuid('transfer_id').notNull().references(() => transfers.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  lotId: uuid('lot_id').references(() => stockLots.id),
  qty: qty('qty').notNull(),
  uomId: uuid('uom_id').notNull().references(() => uoms.id),
  fromLocationId: uuid('from_location_id').notNull().references(() => locations.id),
  toLocationId: uuid('to_location_id').notNull().references(() => locations.id),
  sequence: integer('sequence').notNull().default(10),
}, (t) => [index('transfer_lines_transfer_idx').on(t.transferId)]);

/* ------------------------------------------------------------------ */
/* Sayım + fark onayı                                                  */
/* ------------------------------------------------------------------ */

export const countStatusEnum = pgEnum('count_status', ['draft', 'counting', 'review', 'approved', 'posted', 'cancelled']);

export const stockCounts = pgTable('stock_counts', {
  id: id(),
  docNo: text('doc_no').notNull(), // CNT-2026-000001
  status: countStatusEnum('status').notNull().default('draft'),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  /** Sayım kapsamı: lokasyon alt ağacı (null = tüm depo) */
  scopeLocationId: uuid('scope_location_id').references(() => locations.id),
  countDate: date('count_date').notNull(),
  countedBy: uuid('counted_by').references(() => users.id),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  approvalId: uuid('approval_id'),
  /** Toplam fark değeri (bilgi) */
  varianceValue: money('variance_value').notNull().default('0'),
  note: note(),
  ...auditColumns,
}, (t) => [uniqueIndex('stock_counts_docno_uq').on(t.docNo), index('stock_counts_status_idx').on(t.status)]);

export const stockCountLines = pgTable('stock_count_lines', {
  id: id(),
  countId: uuid('count_id').notNull().references(() => stockCounts.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  lotId: uuid('lot_id').references(() => stockLots.id),
  locationId: uuid('location_id').notNull().references(() => locations.id),
  /** Sistem miktarı (sayım anındaki snapshot) */
  systemQty: qty('system_qty').notNull().default('0'),
  countedQty: qty('counted_qty'),
  /** counted − system */
  varianceQty: qty('variance_qty').notNull().default('0'),
  unitCost: money('unit_cost').notNull().default('0'),
  isApproved: boolean('is_approved').notNull().default(false),
  reason: text('reason'),
  countedAt: timestamp('counted_at', { withTimezone: true }),
}, (t) => [index('stock_count_lines_count_idx').on(t.countId), index('stock_count_lines_product_idx').on(t.productId)]);

/* ------------------------------------------------------------------ */
/* Fire / hurda                                                        */
/* ------------------------------------------------------------------ */

export const scraps = pgTable('scraps', {
  id: id(),
  docNo: text('doc_no').notNull(), // SCR-2026-000001
  productId: uuid('product_id').notNull().references(() => products.id),
  lotId: uuid('lot_id').references(() => stockLots.id),
  fromLocationId: uuid('from_location_id').notNull().references(() => locations.id),
  qty: qty('qty').notNull(),
  uomId: uuid('uom_id').notNull().references(() => uoms.id),
  reason: text('reason').notNull(), // expired, damaged, production_loss, qc_reject, other
  workOrderId: uuid('work_order_id'),
  unitCost: money('unit_cost').notNull().default('0'),
  status: text('status').notNull().default('done'),
  doneAt: timestamp('done_at', { withTimezone: true }).notNull().defaultNow(),
  note: note(),
  ...auditColumns,
}, (t) => [uniqueIndex('scraps_docno_uq').on(t.docNo), index('scraps_wo_idx').on(t.workOrderId)]);

/* ------------------------------------------------------------------ */
/* Kritik stok kuralları (min/max + tüketim hızı + lead time)          */
/* ------------------------------------------------------------------ */

export const reorderRules = pgTable('reorder_rules', {
  id: id(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  minQty: qty('min_qty').notNull().default('0'),
  maxQty: qty('max_qty').notNull().default('0'),
  /** Tüketim hızı (birim/gün) — motor günceller (son 30/90 gün) */
  dailyConsumption: qty('daily_consumption').notNull().default('0'),
  leadTimeDays: integer('lead_time_days').notNull().default(7),
  safetyDays: integer('safety_days').notNull().default(3),
  preferredSupplierId: uuid('preferred_supplier_id').references(() => partners.id),
  /** Tam otomatik sipariş yalnızca beyaz listede */
  isAutoOrderWhitelisted: boolean('is_auto_order_whitelisted').notNull().default(false),
  autoOrderMaxAmount: money('auto_order_max_amount'),
  isActive: boolean('is_active').notNull().default(true),
  /** Motor çıktısı (son hesap) */
  lastOnHand: qty('last_on_hand'),
  lastDaysOfCover: qty('last_days_of_cover'),
  lastSuggestedQty: qty('last_suggested_qty'),
  lastEvaluatedAt: timestamp('last_evaluated_at', { withTimezone: true }),
  ...auditColumns,
}, (t) => [uniqueIndex('reorder_rules_uq').on(t.productId, t.warehouseId)]);
