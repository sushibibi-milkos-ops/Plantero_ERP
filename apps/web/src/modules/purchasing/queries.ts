import 'server-only';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@plantero/db';
import { D, getChain } from '@plantero/core';

const {
  purchaseOrders, purchaseOrderLines, partners, products, uoms, warehouses, reorderRules,
  supplierProducts, receipts, invoices, approvals,
} = schema;

/* ==================================================================== */
/* Ortak arama listeleri (form combobox'ları)                           */
/* ==================================================================== */

export async function listWarehouses() {
  return db.select().from(warehouses).where(eq(warehouses.isActive, true)).orderBy(asc(warehouses.code));
}

export async function listSuppliers() {
  return db.select().from(partners).where(and(inArray(partners.kind, ['supplier', 'both']), eq(partners.isActive, true))).orderBy(asc(partners.name));
}

export type PurchaseProductPickerRow = { id: string; sku: string; name: string; uomId: string; uomCode: string; preferredSupplierId: string | null; lastPrice: string | null; leadTimeDays: number | null };

/** Ürün + o ürünün (varsa) tercihli tedarikçi fiyatı — satır eklerken birim fiyat otomatik dolar. */
export async function listPurchasableProducts(): Promise<PurchaseProductPickerRow[]> {
  const rows = await db
    .select({ p: products, uomCode: uoms.code })
    .from(products)
    .innerJoin(uoms, eq(uoms.id, products.uomId))
    .where(and(eq(products.status, 'active'), eq(products.isPurchasable, true)))
    .orderBy(asc(products.name));
  const prefRows = await db.select().from(supplierProducts).where(eq(supplierProducts.isPreferred, true));
  const prefByProduct = new Map(prefRows.map((r) => [r.productId, r]));
  return rows.map((r) => {
    const pref = prefByProduct.get(r.p.id);
    return { id: r.p.id, sku: r.p.sku, name: r.p.name, uomId: r.p.uomId, uomCode: r.uomCode, preferredSupplierId: pref?.partnerId ?? null, lastPrice: pref?.price ?? null, leadTimeDays: pref?.leadTimeDays ?? null };
  });
}

/** Belirli bir tedarikçinin fiyat/lead time'ı tanımlı ürünleri (PO formunda tedarikçi seçilince satır önerisi). */
export async function listSupplierProducts(supplierId: string) {
  const rows = await db
    .select({ sp: supplierProducts, sku: products.sku, name: products.name, uomId: products.uomId, uomCode: uoms.code })
    .from(supplierProducts)
    .innerJoin(products, eq(products.id, supplierProducts.productId))
    .innerJoin(uoms, eq(uoms.id, products.uomId))
    .where(eq(supplierProducts.partnerId, supplierId))
    .orderBy(asc(products.name));
  return rows;
}

/* ==================================================================== */
/* /satin-alma/siparisler                                               */
/* ==================================================================== */

export type PurchaseOrderRow = {
  id: string; docNo: string; status: string; partnerName: string; warehouseCode: string;
  orderDate: string; expectedDate: string | null; grandTotal: string; lineCount: number;
  receivedPct: number; isAiGenerated: boolean; sentVia: string | null;
};

export async function listPurchaseOrders(): Promise<PurchaseOrderRow[]> {
  const rows = await db
    .select({ o: purchaseOrders, partnerName: partners.name, warehouseCode: warehouses.code })
    .from(purchaseOrders)
    .innerJoin(partners, eq(partners.id, purchaseOrders.partnerId))
    .innerJoin(warehouses, eq(warehouses.id, purchaseOrders.warehouseId))
    .orderBy(desc(purchaseOrders.orderDate), desc(purchaseOrders.createdAt));
  const lineAgg = await db
    .select({ orderId: purchaseOrderLines.orderId, cnt: sql<string>`count(*)`, qty: sql<string>`coalesce(sum(${purchaseOrderLines.qty}), 0)`, received: sql<string>`coalesce(sum(${purchaseOrderLines.receivedQty}), 0)` })
    .from(purchaseOrderLines)
    .groupBy(purchaseOrderLines.orderId);
  const byOrder = new Map(lineAgg.map((r) => [r.orderId, r]));
  return rows.map((r) => {
    const agg = byOrder.get(r.o.id);
    const qty = D(agg?.qty ?? 0);
    const received = D(agg?.received ?? 0);
    const receivedPct = qty.gt(0) ? received.div(qty).mul(100).toNumber() : 0;
    return {
      id: r.o.id, docNo: r.o.docNo, status: r.o.status, partnerName: r.partnerName, warehouseCode: r.warehouseCode,
      orderDate: r.o.orderDate, expectedDate: r.o.expectedDate, grandTotal: r.o.grandTotal, lineCount: Number(agg?.cnt ?? 0),
      receivedPct, isAiGenerated: r.o.isAiGenerated, sentVia: r.o.sentVia,
    };
  });
}

export async function getPurchaseOrderDetail(id: string) {
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
  if (!po) return null;
  const [partner] = await db.select().from(partners).where(eq(partners.id, po.partnerId)).limit(1);
  const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, po.warehouseId)).limit(1);
  const lines = await db
    .select({ line: purchaseOrderLines, sku: products.sku, productName: products.name, uomCode: uoms.code })
    .from(purchaseOrderLines)
    .innerJoin(products, eq(products.id, purchaseOrderLines.productId))
    .innerJoin(uoms, eq(uoms.id, purchaseOrderLines.uomId))
    .where(eq(purchaseOrderLines.orderId, id))
    .orderBy(asc(purchaseOrderLines.sequence));
  const receiptRows = await db.select({ id: receipts.id, docNo: receipts.docNo, status: receipts.status, createdAt: receipts.createdAt }).from(receipts).where(eq(receipts.purchaseOrderId, id)).orderBy(desc(receipts.createdAt));
  const invoiceRows = await db.select({ id: invoices.id, docNo: invoices.docNo, status: invoices.status, grandTotal: invoices.grandTotal }).from(invoices).where(eq(invoices.purchaseOrderId, id)).orderBy(desc(invoices.createdAt));
  const chain = await getChain(db, 'purchase_order', id);
  return { po, partner: partner ?? null, warehouse: warehouse ?? null, lines, receipts: receiptRows, invoices: invoiceRows, chain };
}

/** `/depo/mal-kabul/yeni` üzerinde tedarikçi seçilince (veya seçilmeden) sunulacak açık sipariş listesi. */
export async function listOpenPurchaseOrders(supplierId?: string) {
  const conds = [inArray(purchaseOrders.status, ['sent', 'confirmed', 'partially_received'])];
  if (supplierId) conds.push(eq(purchaseOrders.partnerId, supplierId));
  const rows = await db
    .select({ o: purchaseOrders, partnerName: partners.name })
    .from(purchaseOrders)
    .innerJoin(partners, eq(partners.id, purchaseOrders.partnerId))
    .where(and(...conds))
    .orderBy(desc(purchaseOrders.orderDate));
  return rows.map((r) => ({ id: r.o.id, docNo: r.o.docNo, partnerId: r.o.partnerId, partnerName: r.partnerName, orderDate: r.o.orderDate, grandTotal: r.o.grandTotal }));
}

/* ==================================================================== */
/* /satin-alma/onay-kuyrugu                                             */
/* ==================================================================== */

export type ApprovalQueueRow = {
  approvalId: string; orderId: string; docNo: string; partnerName: string; grandTotal: string;
  aiRationale: string | null; aiConfidence: string | null; createdAt: Date; lineCount: number;
};

export async function listApprovalQueue(): Promise<ApprovalQueueRow[]> {
  const rows = await db
    .select({ a: approvals, o: purchaseOrders, partnerName: partners.name })
    .from(approvals)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, approvals.refId))
    .innerJoin(partners, eq(partners.id, purchaseOrders.partnerId))
    .where(and(eq(approvals.kind, 'purchase_draft'), eq(approvals.status, 'pending'), eq(approvals.refTable, 'purchase_orders')))
    .orderBy(desc(approvals.createdAt));
  const lineAgg = await db.select({ orderId: purchaseOrderLines.orderId, cnt: sql<string>`count(*)` }).from(purchaseOrderLines).groupBy(purchaseOrderLines.orderId);
  const byOrder = new Map(lineAgg.map((r) => [r.orderId, Number(r.cnt)]));
  return rows.map((r) => ({
    approvalId: r.a.id, orderId: r.o.id, docNo: r.o.docNo, partnerName: r.partnerName, grandTotal: r.o.grandTotal,
    aiRationale: r.o.aiRationale, aiConfidence: r.o.aiConfidence, createdAt: r.a.createdAt, lineCount: byOrder.get(r.o.id) ?? 0,
  }));
}

/* ==================================================================== */
/* /satin-alma/kritik-stok                                              */
/* ==================================================================== */

export type CriticalStockRow = {
  ruleId: string; productId: string; sku: string; productName: string; warehouseCode: string;
  onHand: string; reserved: string; available: string;
  minQty: string; maxQty: string; dailyConsumption: string; daysOfCover: string | null;
  leadTimeDays: number; safetyDays: number; suggestedQty: string;
  preferredSupplierId: string | null; preferredSupplierName: string | null;
  isAutoOrderWhitelisted: boolean; supplierWhitelisted: boolean;
  lastEvaluatedAt: Date | null; risk: 'none' | 'warning' | 'critical';
};

/**
 * Kritik stok panosunun okuma yolu — `reorder_rules.last*` (motor tarafından `evaluateRules` ile
 * doldurulan) alanları gösterir; sayfa GET'i motoru TETİKLEMEZ (yalnızca "Motoru çalıştır" server
 * action'ı `packages/core/src/purchasing/replenishment.ts`'teki `evaluateRules`'ı çağırır).
 */
export async function listCriticalStock(): Promise<CriticalStockRow[]> {
  const rows = await db
    .select({ rule: reorderRules, sku: products.sku, productName: products.name, warehouseCode: warehouses.code, supplierName: partners.name, supplierWhitelisted: partners.isPurchaseWhitelisted })
    .from(reorderRules)
    .innerJoin(products, eq(products.id, reorderRules.productId))
    .innerJoin(warehouses, eq(warehouses.id, reorderRules.warehouseId))
    .leftJoin(partners, eq(partners.id, reorderRules.preferredSupplierId))
    .where(eq(reorderRules.isActive, true))
    .orderBy(asc(products.name));

  return rows.map((r) => {
    const daysOfCover = r.rule.lastDaysOfCover;
    const leadTimeDays = r.rule.leadTimeDays;
    const safetyDays = r.rule.safetyDays;
    // Risk, motorun kendi kararıyla (evaluateRules) BİREBİR tutarlı olmalı — motor `available + açık PO
    // miktarı` üzerinden karar verirken burada (reorder_rules şeması `lastOpenPoQty` taşımıyor) yalnızca
    // `lastOnHand` (ham eldeki, rezerve/açık PO hariç) ile min karşılaştırmak farklı bir sonuca varabilir:
    // "Kritik" rozeti + "Önerilen sipariş: —" gibi kendi içinde çelişen bir satır doğurur (tur 6, canlı
    // /satin-alma/kritik-stok denemesinde yakalandı — Vanilya Aroması: eldeki 50 < min 65 görünüyordu
    // ama açık bir sipariş zaten 30 birim karşılıyordu, motor haklı olarak "önerilen: 0" demişti). Tek
    // doğruluk kaynağı: `lastSuggestedQty` (motorun ürettiği tek karar alanı) — kapsama günü hesaplanmışsa
    // onunla, hesaplanamıyorsa "motor sipariş önerdi mi" ile sınıflandırılır.
    let risk: CriticalStockRow['risk'] = 'none';
    if (daysOfCover !== null) {
      const d = D(daysOfCover);
      if (d.lt(leadTimeDays)) risk = 'critical';
      else if (d.lt(leadTimeDays + safetyDays)) risk = 'warning';
    } else if (r.rule.lastEvaluatedAt && D(r.rule.lastSuggestedQty ?? 0).gt(0)) {
      risk = 'critical';
    }
    return {
      ruleId: r.rule.id, productId: r.rule.productId, sku: r.sku, productName: r.productName, warehouseCode: r.warehouseCode,
      onHand: r.rule.lastOnHand ?? '0', reserved: '0', available: r.rule.lastOnHand ?? '0',
      minQty: r.rule.minQty, maxQty: r.rule.maxQty, dailyConsumption: r.rule.dailyConsumption, daysOfCover,
      leadTimeDays, safetyDays, suggestedQty: r.rule.lastSuggestedQty ?? '0',
      preferredSupplierId: r.rule.preferredSupplierId, preferredSupplierName: r.supplierName,
      isAutoOrderWhitelisted: r.rule.isAutoOrderWhitelisted, supplierWhitelisted: r.supplierWhitelisted ?? false,
      lastEvaluatedAt: r.rule.lastEvaluatedAt, risk,
    };
  });
}

export async function getReorderRuleDetail(id: string) {
  const [rule] = await db.select().from(reorderRules).where(eq(reorderRules.id, id)).limit(1);
  if (!rule) return null;
  return rule;
}

/* ==================================================================== */
/* /satin-alma/tedarikciler                                             */
/* ==================================================================== */

export type SupplierCardRow = {
  id: string; code: string; name: string; leadTimeDays: number | null; qualityScore: string | null;
  isPurchaseWhitelisted: boolean; openPoCount: number; openPoValue: string; productCount: number;
  /** Zamanında teslimat % — son tamamlanmış mal kabullerinden (`receipts.was_on_time`, kalite modülü/`stock/receipts.ts` besler); veri yoksa null. */
  onTimeDeliveryPct: number | null; deliveryCount: number;
};

export async function listSupplierCards(): Promise<SupplierCardRow[]> {
  const suppliers = await db.select().from(partners).where(and(inArray(partners.kind, ['supplier', 'both']), eq(partners.isActive, true))).orderBy(asc(partners.name));
  const poAgg = await db
    .select({ partnerId: purchaseOrders.partnerId, cnt: sql<string>`count(*)`, value: sql<string>`coalesce(sum(${purchaseOrders.grandTotal}), 0)` })
    .from(purchaseOrders)
    .where(inArray(purchaseOrders.status, ['draft', 'ai_draft', 'pending_approval', 'approved', 'sent', 'confirmed', 'partially_received']))
    .groupBy(purchaseOrders.partnerId);
  const byPartner = new Map(poAgg.map((r) => [r.partnerId, r]));
  const productAgg = await db.select({ partnerId: supplierProducts.partnerId, cnt: sql<string>`count(*)` }).from(supplierProducts).groupBy(supplierProducts.partnerId);
  const productByPartner = new Map(productAgg.map((r) => [r.partnerId, Number(r.cnt)]));
  // Zamanında teslimat %: `receipts.was_on_time` (yalnızca PO'lu, `expectedDate` bilinen kabullerde
  // `receiveGoods` tarafından doldurulur — bkz. `packages/core/src/stock/receipts.ts`). NULL olanlar
  // (PO'suz manuel kabul, beklenen tarihsiz PO) sayıma katılmaz.
  const deliveryAgg = await db
    .select({
      partnerId: receipts.partnerId,
      onTimeCnt: sql<string>`count(*) filter (where ${receipts.wasOnTime} = true)`,
      totalCnt: sql<string>`count(*) filter (where ${receipts.wasOnTime} is not null)`,
    })
    .from(receipts)
    .where(and(inArray(receipts.status, ['received', 'qc_pending', 'done'])))
    .groupBy(receipts.partnerId);
  const deliveryByPartner = new Map(deliveryAgg.map((r) => [r.partnerId, r]));
  return suppliers.map((s) => {
    const agg = byPartner.get(s.id);
    const delivery = deliveryByPartner.get(s.id);
    const totalCnt = Number(delivery?.totalCnt ?? 0);
    const onTimeCnt = Number(delivery?.onTimeCnt ?? 0);
    return {
      id: s.id, code: s.code, name: s.name, leadTimeDays: s.supplierLeadTimeDays, qualityScore: s.supplierQualityScore,
      isPurchaseWhitelisted: s.isPurchaseWhitelisted, openPoCount: Number(agg?.cnt ?? 0), openPoValue: agg?.value ?? '0',
      productCount: productByPartner.get(s.id) ?? 0,
      onTimeDeliveryPct: totalCnt > 0 ? Math.round((onTimeCnt / totalCnt) * 100) : null, deliveryCount: totalCnt,
    };
  });
}

