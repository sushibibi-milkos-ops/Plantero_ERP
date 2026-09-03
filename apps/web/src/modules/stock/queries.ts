import 'server-only';
import { and, asc, desc, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm';
import { db, schema } from '@plantero/db';
import { D, toDb, round4, ZERO, getChain, traceForward, traceBackward } from '@plantero/core';

const {
  products, uoms, partners, warehouses, locations,
  stockQuants, stockLots, stockMoves, reorderRules,
  receipts, receiptLines, qcChecks,
  deliveries, deliveryLines, salesOrders,
  transfers, transferLines,
  stockCounts, stockCountLines,
  purchaseOrders, purchaseOrderLines,
  workOrders,
} = schema;

/* ==================================================================== */
/* Ortak arama listeleri (form combobox'ları)                           */
/* ==================================================================== */

export async function listWarehouses() {
  return db.select().from(warehouses).where(eq(warehouses.isActive, true)).orderBy(asc(warehouses.code));
}

export async function listLocations(warehouseId?: string) {
  const conds = [eq(locations.isActive, true)];
  if (warehouseId) conds.push(eq(locations.warehouseId, warehouseId));
  return db.select().from(locations).where(and(...conds)).orderBy(asc(locations.code));
}

export async function listPickableLocations(warehouseId?: string) {
  const conds = [eq(locations.isActive, true), eq(locations.isPickable, true), eq(locations.usage, 'internal')];
  if (warehouseId) conds.push(eq(locations.warehouseId, warehouseId));
  return db.select().from(locations).where(and(...conds)).orderBy(asc(locations.code));
}

export type ProductPickerRow = { id: string; sku: string; name: string; type: string; uomId: string; uomCode: string; isLotTracked: boolean; requiresIncomingQc: boolean; barcode: string | null; averageCost: string; shelfLifeDays: number | null };

export async function listProductsForPicker(): Promise<ProductPickerRow[]> {
  const rows = await db.select({ p: products, uomCode: uoms.code }).from(products).innerJoin(uoms, eq(uoms.id, products.uomId)).where(eq(products.status, 'active')).orderBy(asc(products.name));
  return rows.map((r) => ({ id: r.p.id, sku: r.p.sku, name: r.p.name, type: r.p.type, uomId: r.p.uomId, uomCode: r.uomCode, isLotTracked: r.p.isLotTracked, requiresIncomingQc: r.p.requiresIncomingQc, barcode: r.p.barcode, averageCost: r.p.averageCost, shelfLifeDays: r.p.shelfLifeDays }));
}

export type LocationStockRow = { productId: string; sku: string; productName: string; uomId: string; uomCode: string; lotId: string | null; lotNo: string | null; available: string };

/** Bir lokasyondaki (transfer/sayım formlarında lot combobox'ı) kullanılabilir stok */
export async function listLocationStock(locationId: string): Promise<LocationStockRow[]> {
  const rows = await db
    .select({ productId: stockQuants.productId, sku: products.sku, productName: products.name, uomId: products.uomId, uomCode: uoms.code, lotId: stockQuants.lotId, lotNo: stockLots.lotNo, qty: stockQuants.qty, reserved: stockQuants.reservedQty })
    .from(stockQuants)
    .innerJoin(products, eq(products.id, stockQuants.productId))
    .innerJoin(uoms, eq(uoms.id, products.uomId))
    .leftJoin(stockLots, eq(stockLots.id, stockQuants.lotId))
    .where(and(eq(stockQuants.locationId, locationId), gt(stockQuants.qty, '0')));
  return rows.map((r) => ({ productId: r.productId, sku: r.sku, productName: r.productName, uomId: r.uomId, uomCode: r.uomCode, lotId: r.lotId, lotNo: r.lotNo, available: toDb(D(r.qty).minus(D(r.reserved))) })).filter((r) => D(r.available).gt(0));
}

export async function listSuppliers() {
  return db.select().from(partners).where(and(inArray(partners.kind, ['supplier', 'both']), eq(partners.isActive, true))).orderBy(asc(partners.name));
}

export async function listCustomers() {
  return db.select().from(partners).where(and(inArray(partners.kind, ['customer', 'both']), eq(partners.isActive, true))).orderBy(asc(partners.name));
}

/** Belirli tedarikçinin (verilmezse tümü) henüz tamamen alınmamış satın alma siparişleri — mal kabul
 * formunda `?po=` seçimi (P0 düzeltme: `receipt-form.tsx`'in üstündeki "Sipariş seç" combobox'ı). */
export async function listOpenPurchaseOrders(supplierId?: string) {
  const conds = [inArray(purchaseOrders.status, ['sent', 'confirmed', 'partially_received'])];
  if (supplierId) conds.push(eq(purchaseOrders.partnerId, supplierId));
  const rows = await db
    .select({ o: purchaseOrders, partnerName: partners.name })
    .from(purchaseOrders)
    .innerJoin(partners, eq(partners.id, purchaseOrders.partnerId))
    .where(and(...conds))
    .orderBy(desc(purchaseOrders.orderDate));
  return rows.map((r) => ({ id: r.o.id, docNo: r.o.docNo, partnerId: r.o.partnerId, partnerName: r.partnerName, grandTotal: r.o.grandTotal }));
}

export async function getPurchaseOrderWithLines(id: string) {
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
  if (!po) return null;
  const lines = await db.select({ line: purchaseOrderLines, productName: products.name, sku: products.sku }).from(purchaseOrderLines).innerJoin(products, eq(products.id, purchaseOrderLines.productId)).where(eq(purchaseOrderLines.orderId, id));
  return { po, lines };
}

/** Sevk edilecek miktarı kalan satış siparişleri — sevkiyat oluşturma formunda seçim listesi */
export async function listShippableSalesOrders() {
  const rows = await db
    .select({ order: salesOrders, partnerName: partners.name })
    .from(salesOrders)
    .innerJoin(partners, eq(partners.id, salesOrders.partnerId))
    .where(inArray(salesOrders.status, ['confirmed', 'partially_delivered']))
    .orderBy(desc(salesOrders.orderDate));
  return rows;
}

/* ==================================================================== */
/* /depo/stok — envanter özeti                                          */
/* ==================================================================== */

export type StockBreakdownRow = {
  quantId: string; locationId: string; locationCode: string; usage: string;
  lotId: string | null; lotNo: string | null; lotStatus: string | null; expiryDate: string | null;
  qty: string; reserved: string; unitCost: string; value: string;
};

export type StockRow = {
  productId: string; sku: string; name: string; type: string; uomCode: string;
  warehouseId: string; warehouseCode: string; warehouseName: string;
  qty: string; reserved: string; available: string; value: string;
  nearestExpiryDate: string | null; minQty: string | null; isCritical: boolean;
  breakdown: StockBreakdownRow[];
};

export type StockKpis = { totalValue: string; rawValue: string; finishedValue: string; quarantineValue: string; expiringValue30: string; reservedValue: string };

async function fetchQuantRows() {
  return db
    .select({
      productId: stockQuants.productId, sku: products.sku, name: products.name, type: products.type, uomCode: uoms.code,
      warehouseId: locations.warehouseId, warehouseCode: warehouses.code, warehouseName: warehouses.name,
      locationId: locations.id, locationCode: locations.code, usage: locations.usage,
      lotId: stockQuants.lotId, lotNo: stockLots.lotNo, lotStatus: stockLots.status, expiryDate: stockLots.expiryDate,
      qty: stockQuants.qty, reserved: stockQuants.reservedQty, quantId: stockQuants.id,
      lotCost: stockLots.unitCost, avgCost: products.averageCost,
    })
    .from(stockQuants)
    .innerJoin(products, eq(products.id, stockQuants.productId))
    .innerJoin(uoms, eq(uoms.id, products.uomId))
    .innerJoin(locations, eq(locations.id, stockQuants.locationId))
    .innerJoin(warehouses, eq(warehouses.id, locations.warehouseId))
    .leftJoin(stockLots, eq(stockLots.id, stockQuants.lotId))
    .where(and(gt(stockQuants.qty, '0'), inArray(locations.usage, ['internal', 'quarantine'])));
}

export async function listStockRows(): Promise<StockRow[]> {
  const rows = await fetchQuantRows();
  const rules = await db.select().from(reorderRules).where(eq(reorderRules.isActive, true));
  const minByKey = new Map(rules.map((r) => [`${r.productId}:${r.warehouseId}`, r.minQty]));
  const productMin = new Map<string, string | null>();
  for (const p of await db.select({ id: products.id, minQty: products.minQty }).from(products)) productMin.set(p.id, p.minQty);

  const groups = new Map<string, StockRow>();
  for (const r of rows) {
    if (r.usage !== 'internal') continue; // ana tablo yalnızca kullanılabilir (internal) stok; karantina KPI'da
    const key = `${r.productId}:${r.warehouseId}`;
    let g = groups.get(key);
    if (!g) {
      const minQty = minByKey.get(key) ?? productMin.get(r.productId) ?? null;
      g = { productId: r.productId, sku: r.sku, name: r.name, type: r.type, uomCode: r.uomCode, warehouseId: r.warehouseId!, warehouseCode: r.warehouseCode!, warehouseName: r.warehouseName!, qty: '0.0000', reserved: '0.0000', available: '0.0000', value: '0.0000', nearestExpiryDate: null, minQty, isCritical: false, breakdown: [] };
      groups.set(key, g);
    }
    const unitCost = D(r.lotId ? r.lotCost : r.avgCost);
    const value = round4(D(r.qty).mul(unitCost));
    g.qty = toDb(D(g.qty).plus(r.qty));
    g.reserved = toDb(D(g.reserved).plus(r.reserved));
    g.value = toDb(D(g.value).plus(value));
    if (r.expiryDate && (!g.nearestExpiryDate || r.expiryDate < g.nearestExpiryDate)) g.nearestExpiryDate = r.expiryDate;
    g.breakdown.push({ quantId: r.quantId, locationId: r.locationId, locationCode: r.locationCode, usage: r.usage, lotId: r.lotId, lotNo: r.lotNo, lotStatus: r.lotStatus, expiryDate: r.expiryDate, qty: r.qty, reserved: r.reserved, unitCost: toDb(unitCost), value: toDb(value) });
  }
  for (const g of groups.values()) {
    g.available = toDb(D(g.qty).minus(D(g.reserved)));
    g.isCritical = g.minQty !== null && D(g.qty).lte(D(g.minQty));
  }
  return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

export async function getStockKpis(): Promise<StockKpis> {
  const rows = await fetchQuantRows();
  const horizon = new Date();
  horizon.setUTCDate(horizon.getUTCDate() + 30);
  const horizonStr = horizon.toISOString().slice(0, 10);

  let totalValue = ZERO, rawValue = ZERO, finishedValue = ZERO, quarantineValue = ZERO, expiringValue30 = ZERO, reservedValue = ZERO;
  for (const r of rows) {
    const unitCost = D(r.lotId ? r.lotCost : r.avgCost);
    const value = round4(D(r.qty).mul(unitCost));
    if (r.usage === 'internal') {
      totalValue = totalValue.plus(value);
      if (r.type === 'raw_material' || r.type === 'packaging') rawValue = rawValue.plus(value);
      if (r.type === 'finished' || r.type === 'semi_finished' || r.type === 'merchandise') finishedValue = finishedValue.plus(value);
      reservedValue = reservedValue.plus(round4(D(r.reserved).mul(unitCost)));
    } else if (r.usage === 'quarantine') {
      quarantineValue = quarantineValue.plus(value);
    }
    if (r.expiryDate && r.expiryDate <= horizonStr) expiringValue30 = expiringValue30.plus(value);
  }
  return { totalValue: toDb(totalValue), rawValue: toDb(rawValue), finishedValue: toDb(finishedValue), quarantineValue: toDb(quarantineValue), expiringValue30: toDb(expiringValue30), reservedValue: toDb(reservedValue) };
}

/* ==================================================================== */
/* /depo/lotlar                                                         */
/* ==================================================================== */

export type LotRow = {
  id: string; lotNo: string; productId: string; sku: string; productName: string; uomCode: string;
  status: string; origin: string; initialQty: string; onHandQty: string; unitCost: string; expiryDate: string | null;
  supplierName: string | null; originWorkOrderId: string | null; locationCount: number; firstLocationCode: string | null;
};

export async function listLots(): Promise<LotRow[]> {
  // `locationCodes`: sütun başlığı "Lokasyon" iken değer aslında lokasyon SAYISI'ydı (1/2) — kullanıcı
  // bunu raf kodu sanıyordu. Tek lokasyonlu lotlarda gerçek kodu göstermek için (ör. "TIRE/HAM/R01/A")
  // en küçük kodu da topluyoruz; UI birden çok lokasyonda "<kod> +N" biçimine düşer.
  const onHand = await db
    .select({
      lotId: stockQuants.lotId,
      qty: sql<string>`coalesce(sum(${stockQuants.qty}), 0)`,
      locCount: sql<string>`count(distinct ${stockQuants.locationId})`,
      firstLocationCode: sql<string>`min(${locations.code})`,
    })
    .from(stockQuants)
    .innerJoin(locations, eq(locations.id, stockQuants.locationId))
    .where(isNotNull(stockQuants.lotId))
    .groupBy(stockQuants.lotId);
  const onHandByLot = new Map(onHand.map((r) => [r.lotId as string, r]));

  const rows = await db
    .select({ lot: stockLots, sku: products.sku, productName: products.name, uomCode: uoms.code, supplierName: partners.name })
    .from(stockLots)
    .innerJoin(products, eq(products.id, stockLots.productId))
    .innerJoin(uoms, eq(uoms.id, stockLots.uomId))
    .leftJoin(partners, eq(partners.id, stockLots.supplierId))
    .orderBy(desc(stockLots.createdAt));

  return rows.map((r) => {
    const oh = onHandByLot.get(r.lot.id);
    return {
      id: r.lot.id, lotNo: r.lot.lotNo, productId: r.lot.productId, sku: r.sku, productName: r.productName, uomCode: r.uomCode,
      status: r.lot.status, origin: r.lot.origin, initialQty: r.lot.initialQty, onHandQty: oh?.qty ?? '0.0000', unitCost: r.lot.unitCost,
      expiryDate: r.lot.expiryDate, supplierName: r.supplierName, originWorkOrderId: r.lot.originWorkOrderId, locationCount: Number(oh?.locCount ?? 0),
      firstLocationCode: oh?.firstLocationCode ?? null,
    };
  });
}

export async function getLotDetail(id: string) {
  const [lot] = await db.select().from(stockLots).where(eq(stockLots.id, id)).limit(1);
  if (!lot) return null;
  const [product] = await db.select({ p: products, uomCode: uoms.code }).from(products).innerJoin(uoms, eq(uoms.id, products.uomId)).where(eq(products.id, lot.productId)).limit(1);
  const quants = await db
    .select({ id: stockQuants.id, locationId: stockQuants.locationId, locationCode: locations.code, usage: locations.usage, qty: stockQuants.qty, reserved: stockQuants.reservedQty })
    .from(stockQuants)
    .innerJoin(locations, eq(locations.id, stockQuants.locationId))
    .where(eq(stockQuants.lotId, id));
  const moves = await db.select().from(stockMoves).where(eq(stockMoves.lotId, id)).orderBy(desc(stockMoves.movedAt)).limit(100);
  const qc = await db.select().from(qcChecks).where(eq(qcChecks.lotId, id)).orderBy(desc(qcChecks.createdAt));
  const [forward, backward] = await Promise.all([traceForward(db, id), traceBackward(db, id)]);
  // Lot detay sayfası önceden köken (tedarikçi/iş emri) ve giriş belgesi hiç göstermiyordu — izlenebilirlik
  // sekmesine bakmadan "bu lot nereden geldi" sorusuna cevap yoktu (Tur 3 P1 bulgusu). Tek sorguda üç
  // olası kaynak da (tedarikçi, mal kabul, iş emri) getirilir; hiçbiri yoksa alanlar null kalır.
  const [supplier, originReceipt, originWorkOrder] = await Promise.all([
    lot.supplierId ? db.select({ id: partners.id, name: partners.name }).from(partners).where(eq(partners.id, lot.supplierId)).limit(1).then((r) => r[0] ?? null) : Promise.resolve(null),
    lot.originReceiptId ? db.select({ id: receipts.id, docNo: receipts.docNo }).from(receipts).where(eq(receipts.id, lot.originReceiptId)).limit(1).then((r) => r[0] ?? null) : Promise.resolve(null),
    lot.originWorkOrderId ? db.select({ id: workOrders.id, docNo: workOrders.docNo }).from(workOrders).where(eq(workOrders.id, lot.originWorkOrderId)).limit(1).then((r) => r[0] ?? null) : Promise.resolve(null),
  ]);
  return { lot, product: product ?? null, quants, moves, qc, forward, backward, supplier, originReceipt, originWorkOrder };
}

/* ==================================================================== */
/* /depo/mal-kabul                                                      */
/* ==================================================================== */

export type ReceiptRow = { id: string; docNo: string; status: string; partnerName: string | null; warehouseCode: string; lineCount: number; totalValue: string; supplierDeliveryNo: string | null; createdAt: Date; receivedAt: Date | null; purchaseOrderId: string | null };

export async function listReceipts(): Promise<ReceiptRow[]> {
  const rows = await db
    .select({ r: receipts, partnerName: partners.name, warehouseCode: warehouses.code })
    .from(receipts)
    .leftJoin(partners, eq(partners.id, receipts.partnerId))
    .innerJoin(warehouses, eq(warehouses.id, receipts.warehouseId))
    .orderBy(desc(receipts.createdAt));
  // Miktar sütunu KG/ADET gibi farklı birimleri topluyor ve yanıltıcı olurdu (docs/modules/depo.md §3
  // "toplam" der — miktar değil); bunun yerine para değerinde toplam gösteriyoruz.
  const lineAgg = await db
    .select({ receiptId: receiptLines.receiptId, cnt: sql<string>`count(*)`, value: sql<string>`coalesce(sum(${receiptLines.qty} * ${receiptLines.unitCost}), 0)` })
    .from(receiptLines)
    .groupBy(receiptLines.receiptId);
  const byReceipt = new Map(lineAgg.map((r) => [r.receiptId, r]));
  return rows.map((r) => ({ id: r.r.id, docNo: r.r.docNo, status: r.r.status, partnerName: r.partnerName, warehouseCode: r.warehouseCode, lineCount: Number(byReceipt.get(r.r.id)?.cnt ?? 0), totalValue: byReceipt.get(r.r.id)?.value ?? '0', supplierDeliveryNo: r.r.supplierDeliveryNo, createdAt: r.r.createdAt, receivedAt: r.r.receivedAt, purchaseOrderId: r.r.purchaseOrderId }));
}

export async function getReceiptDetail(id: string) {
  const [receipt] = await db.select().from(receipts).where(eq(receipts.id, id)).limit(1);
  if (!receipt) return null;
  const [partner] = receipt.partnerId ? await db.select().from(partners).where(eq(partners.id, receipt.partnerId)).limit(1) : [null];
  const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, receipt.warehouseId)).limit(1);
  const lines = await db
    .select({ line: receiptLines, sku: products.sku, productName: products.name, uomCode: uoms.code, lotNo: stockLots.lotNo, lotStatus: stockLots.status, locationCode: locations.code })
    .from(receiptLines)
    .innerJoin(products, eq(products.id, receiptLines.productId))
    .innerJoin(uoms, eq(uoms.id, receiptLines.uomId))
    .leftJoin(stockLots, eq(stockLots.id, receiptLines.lotId))
    .leftJoin(locations, eq(locations.id, receiptLines.toLocationId))
    .where(eq(receiptLines.receiptId, id))
    .orderBy(asc(receiptLines.sequence));
  const chain = await getChain(db, 'receipt', id);
  return { receipt, partner: partner ?? null, warehouse: warehouse ?? null, lines, chain };
}

/* ==================================================================== */
/* /depo/sevkiyat                                                       */
/* ==================================================================== */

export type DeliveryRow = { id: string; docNo: string; status: string; partnerName: string; warehouseCode: string; scheduledDate: string | null; shippedAt: Date | null; lineCount: number; carrier: string | null; salesOrderId: string | null; salesOrderDocNo: string | null; value: string };

export async function listDeliveries(): Promise<DeliveryRow[]> {
  const so = db.select({ id: salesOrders.id, docNo: salesOrders.docNo }).from(salesOrders).as('so');
  const rows = await db
    .select({ d: deliveries, partnerName: partners.name, warehouseCode: warehouses.code, soDocNo: so.docNo })
    .from(deliveries)
    .innerJoin(partners, eq(partners.id, deliveries.partnerId))
    .innerJoin(warehouses, eq(warehouses.id, deliveries.warehouseId))
    .leftJoin(so, eq(so.id, deliveries.salesOrderId))
    .orderBy(desc(deliveries.createdAt));
  // Değer: toplanan miktar × birim maliyet (lot maliyeti — SMM'in temeli). İrsaliye bir depo belgesi,
  // satış fiyatı taşımaz; kardeş ekran /depo/mal-kabul de aynı mantıkla (qty×unitCost) "Toplam tutar"
  // gösteriyordu — bu ekranda tamamen eksikti.
  const lineAgg = await db
    .select({ deliveryId: deliveryLines.deliveryId, cnt: sql<string>`count(*)`, value: sql<string>`coalesce(sum(${deliveryLines.pickedQty} * coalesce(${deliveryLines.unitCost}, 0)), 0)` })
    .from(deliveryLines)
    .groupBy(deliveryLines.deliveryId);
  const byDelivery = new Map(lineAgg.map((r) => [r.deliveryId, r]));
  return rows.map((r) => {
    const agg = byDelivery.get(r.d.id);
    return { id: r.d.id, docNo: r.d.docNo, status: r.d.status, partnerName: r.partnerName, warehouseCode: r.warehouseCode, scheduledDate: r.d.scheduledDate, shippedAt: r.d.shippedAt, lineCount: Number(agg?.cnt ?? 0), carrier: r.d.carrier, salesOrderId: r.d.salesOrderId, salesOrderDocNo: r.soDocNo ?? null, value: agg?.value ?? '0' };
  });
}

export async function getDeliveryDetail(id: string) {
  const [delivery] = await db.select().from(deliveries).where(eq(deliveries.id, id)).limit(1);
  if (!delivery) return null;
  const [partner] = await db.select().from(partners).where(eq(partners.id, delivery.partnerId)).limit(1);
  const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, delivery.warehouseId)).limit(1);
  const lines = await db
    .select({ line: deliveryLines, sku: products.sku, productName: products.name, uomCode: uoms.code, lotNo: stockLots.lotNo, lotStatus: stockLots.status, expiryDate: stockLots.expiryDate, locationCode: locations.code })
    .from(deliveryLines)
    .innerJoin(products, eq(products.id, deliveryLines.productId))
    .innerJoin(uoms, eq(uoms.id, deliveryLines.uomId))
    .leftJoin(stockLots, eq(stockLots.id, deliveryLines.lotId))
    .leftJoin(locations, eq(locations.id, deliveryLines.fromLocationId))
    .where(eq(deliveryLines.deliveryId, id))
    .orderBy(asc(deliveryLines.sequence));
  const chain = await getChain(db, 'delivery', id);
  return { delivery, partner: partner ?? null, warehouse: warehouse ?? null, lines, chain };
}

/* ==================================================================== */
/* /depo/transfer                                                       */
/* ==================================================================== */

export type TransferRow = {
  id: string; docNo: string; status: string; fromWarehouseCode: string; toWarehouseCode: string;
  /** İlk satırın lokasyon kodları — depo içi transferlerde güzergah bunlarla gösterilir (bkz.
   *  transfers-table.tsx routeLabel): "TIRE → TIRE" ambar bazında hiçbir bilgi taşımıyordu (Tur 4
   *  P1 bulgusu). Çok satırlı transferlerde satırlar farklı lokasyon çiftleri taşıyabilir; ilk satır
   *  temsili gösterilir (aynı kalıp transfer-lines-table.tsx'te satır bazında zaten tam görünür). */
  fromLocationCode: string; toLocationCode: string;
  lineCount: number; scheduledDate: string | null; createdAt: Date; value: string;
};

export async function listTransfers(): Promise<TransferRow[]> {
  const fromWh = db.select({ id: warehouses.id, code: warehouses.code }).from(warehouses).as('from_wh');
  const toWh = db.select({ id: warehouses.id, code: warehouses.code }).from(warehouses).as('to_wh');
  const rows = await db
    .select({ t: transfers, fromCode: fromWh.code, toCode: toWh.code })
    .from(transfers)
    .innerJoin(fromWh, eq(fromWh.id, transfers.fromWarehouseId))
    .innerJoin(toWh, eq(toWh.id, transfers.toWarehouseId))
    .orderBy(desc(transfers.createdAt));
  const lineAgg = await db.select({ transferId: transferLines.transferId, cnt: sql<string>`count(*)` }).from(transferLines).groupBy(transferLines.transferId);
  const byTransfer = new Map(lineAgg.map((r) => [r.transferId, Number(r.cnt)]));
  const fromLoc = db.select({ id: locations.id, code: locations.code }).from(locations).as('from_loc');
  const toLoc = db.select({ id: locations.id, code: locations.code }).from(locations).as('to_loc');
  const lineLocRows = await db
    .select({ transferId: transferLines.transferId, sequence: transferLines.sequence, fromCode: fromLoc.code, toCode: toLoc.code })
    .from(transferLines)
    .innerJoin(fromLoc, eq(fromLoc.id, transferLines.fromLocationId))
    .innerJoin(toLoc, eq(toLoc.id, transferLines.toLocationId))
    .orderBy(asc(transferLines.sequence));
  const routeByTransfer = new Map<string, { fromLocationCode: string; toLocationCode: string }>();
  for (const r of lineLocRows) {
    if (!routeByTransfer.has(r.transferId)) routeByTransfer.set(r.transferId, { fromLocationCode: r.fromCode, toLocationCode: r.toCode });
  }
  // Transfer defterde değersizdir (hesap değişmez) ama KPI amaçlı taşınan mal değerini göstermek için
  // lot maliyeti (lotluysa) / ürün ortalama maliyeti (lotsuzsa) × miktar ile bilgilendirici bir toplam
  // hesaplanır — muhasebe kaydı değil, yalnızca "ne kadarlık mal yolda" özetidir.
  const valueAgg = await db
    .select({ transferId: transferLines.transferId, value: sql<string>`coalesce(sum(${transferLines.qty} * coalesce(${stockLots.unitCost}, ${products.averageCost}, 0)), 0)` })
    .from(transferLines)
    .leftJoin(stockLots, eq(stockLots.id, transferLines.lotId))
    .leftJoin(products, eq(products.id, transferLines.productId))
    .groupBy(transferLines.transferId);
  const valueByTransfer = new Map(valueAgg.map((r) => [r.transferId, r.value]));
  return rows.map((r) => {
    const route = routeByTransfer.get(r.t.id);
    return {
      id: r.t.id, docNo: r.t.docNo, status: r.t.status, fromWarehouseCode: r.fromCode, toWarehouseCode: r.toCode,
      fromLocationCode: route?.fromLocationCode ?? r.fromCode, toLocationCode: route?.toLocationCode ?? r.toCode,
      lineCount: byTransfer.get(r.t.id) ?? 0, scheduledDate: r.t.scheduledDate, createdAt: r.t.createdAt, value: valueByTransfer.get(r.t.id) ?? '0',
    };
  });
}

export async function getTransferDetail(id: string) {
  const [transfer] = await db.select().from(transfers).where(eq(transfers.id, id)).limit(1);
  if (!transfer) return null;
  const lines = await db
    .select({ line: transferLines, sku: products.sku, productName: products.name, uomCode: uoms.code, lotNo: stockLots.lotNo, fromCode: locations.code })
    .from(transferLines)
    .innerJoin(products, eq(products.id, transferLines.productId))
    .innerJoin(uoms, eq(uoms.id, transferLines.uomId))
    .leftJoin(stockLots, eq(stockLots.id, transferLines.lotId))
    .innerJoin(locations, eq(locations.id, transferLines.fromLocationId))
    .where(eq(transferLines.transferId, id))
    .orderBy(asc(transferLines.sequence));
  const [fromWh] = await db.select().from(warehouses).where(eq(warehouses.id, transfer.fromWarehouseId)).limit(1);
  const [toWh] = await db.select().from(warehouses).where(eq(warehouses.id, transfer.toWarehouseId)).limit(1);
  return { transfer, lines, fromWarehouse: fromWh ?? null, toWarehouse: toWh ?? null };
}

/* ==================================================================== */
/* /depo/sayim                                                          */
/* ==================================================================== */

// `systemValue` (Tur 5 P2): sayım farkı rengini bir tolerans eşiğine (|fark| / sistem değeri) göre
// karar verebilmek için — varianceValue tek başına büyüklüğü (küçük bir depo için normal mi, yoksa
// gerçek bir tutarsızlık mı olduğunu) anlatmaz. `count_lines.system_qty × unit_cost` toplamı sayım
// anındaki referans stok değeridir (bkz. counts-table.tsx).
export type CountRow = { id: string; docNo: string; status: string; warehouseCode: string; countDate: string; lineCount: number; varianceValue: string; systemValue: string };

export async function listCounts(): Promise<CountRow[]> {
  const rows = await db.select({ c: stockCounts, warehouseCode: warehouses.code }).from(stockCounts).innerJoin(warehouses, eq(warehouses.id, stockCounts.warehouseId)).orderBy(desc(stockCounts.createdAt));
  const lineAgg = await db
    .select({ countId: stockCountLines.countId, cnt: sql<string>`count(*)`, systemValue: sql<string>`coalesce(sum(${stockCountLines.systemQty} * ${stockCountLines.unitCost}), 0)` })
    .from(stockCountLines)
    .groupBy(stockCountLines.countId);
  const byCount = new Map(lineAgg.map((r) => [r.countId, { cnt: Number(r.cnt), systemValue: r.systemValue }]));
  return rows.map((r) => ({
    id: r.c.id,
    docNo: r.c.docNo,
    status: r.c.status,
    warehouseCode: r.warehouseCode,
    countDate: r.c.countDate,
    lineCount: byCount.get(r.c.id)?.cnt ?? 0,
    varianceValue: r.c.varianceValue,
    systemValue: byCount.get(r.c.id)?.systemValue ?? '0',
  }));
}

export async function getCountDetail(id: string) {
  const [count] = await db.select().from(stockCounts).where(eq(stockCounts.id, id)).limit(1);
  if (!count) return null;
  const lines = await db
    .select({ line: stockCountLines, sku: products.sku, productName: products.name, uomCode: uoms.code, lotNo: stockLots.lotNo, locationCode: locations.code })
    .from(stockCountLines)
    .innerJoin(products, eq(products.id, stockCountLines.productId))
    .innerJoin(uoms, eq(uoms.id, products.uomId))
    .leftJoin(stockLots, eq(stockLots.id, stockCountLines.lotId))
    .innerJoin(locations, eq(locations.id, stockCountLines.locationId))
    .where(eq(stockCountLines.countId, id))
    .orderBy(asc(locations.code));
  const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, count.warehouseId)).limit(1);
  return { count, lines, warehouse: warehouse ?? null };
}
