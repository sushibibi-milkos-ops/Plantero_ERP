import 'server-only';
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, lte, sql } from 'drizzle-orm';
import { db, schema } from '@plantero/db';
import { D, toDb } from '@plantero/core';
import { businessDate } from '@plantero/core/dates';
import { listLineCards, type LineCardRow } from '@/modules/production/queries';

const {
  salesOrders, deliveries, deliveryLines, receipts, receiptLines, invoices, workOrders,
  products, uoms, partners, warehouses, productionLines, locations,
  stockLots, stockQuants,
  purchaseOrders, reconciliationMatches, bankTransactions, stockCounts,
  payments,
} = schema;

/**
 * Kokpit ekranının veri kaynağı. Her fonksiyon gerçek tablolardan okur — modül henüz
 * inşa edilmemişse (ör. satın alma onay kuyruğu, tahsilat takibi) sonuç gerçekten boş
 * döner; sahte örnek satır üretilmez (bkz. Tur 1 P0 bulgusu).
 */

export type CockpitKpis = {
  revenueToday: string;
  revenueDeltaPct: number | null;
  openOrders: number;
  readyToShip: number;
  criticalStockCount: number;
  overdueReceivable: string;
};

/**
 * "Bugünkü ciro" — bugün kesilmiş satış faturalarının toplamı (`grandTotalTry`), `getCockpitToday`
 * içindeki "Bugün" listesinin fatura satırlarıyla **aynı** filtreyi kullanır (kind='sales',
 * postedAt bugün) — böylece KPI kartı ile altındaki belge listesi hiçbir zaman çelişmez (Tur 2
 * bulgusu: sipariş bazlı "net ciro" raporu ile fatura listesi farklı belge kümelerini sayıyordu,
 * biri ₺0 diğeri ₺8.302,20 gösteriyordu). Trend: gerçek geçmiş günlük anlık görüntü tablosu
 * olmadığından (sipariş/stok sayaçları için tarihsel seri yok) yalnızca ciro için anlamlı ve gerçek
 * bir gün-öncesi karşılaştırması hesaplanır; diğer üç KPI için delta hiç geçilmez.
 */
export async function getCockpitKpis(): Promise<CockpitKpis> {
  const today = businessDate(new Date());
  const startOfToday = new Date(`${today}T00:00:00.000Z`);
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);

  const [[todayRevRow], [yesterdayRevRow], [openOrdersRow], [readyToShipRow], [overdueRow], criticalRows] = await Promise.all([
    db
      .select({ n: sql<string>`coalesce(sum(${invoices.grandTotalTry}), 0)` })
      .from(invoices)
      .where(and(eq(invoices.kind, 'sales'), isNotNull(invoices.postedAt), gte(invoices.postedAt, startOfToday))),
    db
      .select({ n: sql<string>`coalesce(sum(${invoices.grandTotalTry}), 0)` })
      .from(invoices)
      .where(and(eq(invoices.kind, 'sales'), isNotNull(invoices.postedAt), gte(invoices.postedAt, startOfYesterday), lt(invoices.postedAt, startOfToday))),
    db
      .select({ n: sql<string>`count(*)` })
      .from(salesOrders)
      .where(and(eq(salesOrders.docType, 'order'), inArray(salesOrders.status, ['confirmed', 'partially_delivered']))),
    db
      .select({ n: sql<string>`count(*)` })
      .from(deliveries)
      .where(inArray(deliveries.status, ['draft', 'reserved'])),
    db
      .select({ n: sql<string>`coalesce(sum(${invoices.residual}), 0)` })
      .from(invoices)
      .where(and(eq(invoices.kind, 'sales'), inArray(invoices.status, ['posted', 'partially_paid']), lte(invoices.dueDate, today))),
    // Kritik stok: ürün min_qty tanımlı ve kullanılabilir (internal lokasyon) eldeki miktar bunun altında
    // (packages/db/src/schema/masterdata.ts §products.minQty; karantina/red/transit stok "kullanılabilir" sayılmaz)
    db
      .select({ productId: products.id, minQty: products.minQty, onHand: sql<string>`coalesce(sum(${stockQuants.qty}), 0)` })
      .from(products)
      .leftJoin(stockQuants, eq(stockQuants.productId, products.id))
      .leftJoin(locations, eq(locations.id, stockQuants.locationId))
      .where(and(eq(products.status, 'active'), isNotNull(products.minQty), sql`(${locations.usage} = 'internal' or ${locations.usage} is null)`))
      .groupBy(products.id, products.minQty),
  ]);

  const criticalStockCount = criticalRows.filter((r) => D(r.onHand).lt(D(r.minQty))).length;

  const revenueToday = D(todayRevRow?.n ?? '0');
  const revenueYesterday = D(yesterdayRevRow?.n ?? '0');
  const revenueDeltaPct = revenueYesterday.isZero() ? null : revenueToday.minus(revenueYesterday).div(revenueYesterday).mul(100).toNumber();

  return {
    revenueToday: toDb(revenueToday),
    revenueDeltaPct,
    openOrders: Number(openOrdersRow?.n ?? 0),
    readyToShip: Number(readyToShipRow?.n ?? 0),
    criticalStockCount,
    overdueReceivable: toDb(D(overdueRow?.n ?? '0')),
  };
}

export type CockpitTodayItem = {
  kind: 'Sevkiyat' | 'İş emri' | 'Mal kabul' | 'Fatura';
  no: string;
  href: string;
  partner: string;
  status: string;
  k: 'delivery' | 'work_order' | 'receipt' | 'invoice';
  amount?: string;
  qty?: string;
  uom?: string;
  at: Date;
};

/** Bugünün belgeleri: gerçekten bugün oluşturulmuş/güncellenmiş belgeler + şu an aktif iş emirleri. */
export async function getCockpitToday(): Promise<CockpitTodayItem[]> {
  const today = businessDate(new Date());
  const startOfDay = new Date(`${today}T00:00:00.000Z`);

  const [deliveryRows, workOrderRows, receiptRows, invoiceRows] = await Promise.all([
    db
      .select({ id: deliveries.id, docNo: deliveries.docNo, status: deliveries.status, partnerName: partners.name, createdAt: deliveries.createdAt, value: sql<string>`coalesce((select sum(${deliveryLines.qty} * coalesce(${deliveryLines.unitCost}, 0)) from ${deliveryLines} where ${deliveryLines.deliveryId} = ${deliveries.id}), 0)` })
      .from(deliveries)
      .innerJoin(partners, eq(partners.id, deliveries.partnerId))
      .where(gte(deliveries.updatedAt, startOfDay))
      .orderBy(desc(deliveries.updatedAt))
      .limit(4),
    db
      .select({ id: workOrders.id, docNo: workOrders.docNo, status: workOrders.status, lineName: productionLines.name, productName: products.name, plannedQty: workOrders.plannedQty, producedQty: workOrders.producedQty, uomCode: uoms.code, startedAt: workOrders.startedAt })
      .from(workOrders)
      .innerJoin(products, eq(products.id, workOrders.productId))
      .innerJoin(uoms, eq(uoms.id, workOrders.uomId))
      .innerJoin(productionLines, eq(productionLines.id, workOrders.lineId))
      .where(inArray(workOrders.status, ['in_progress', 'paused']))
      .orderBy(desc(workOrders.startedAt))
      .limit(4),
    db
      .select({ id: receipts.id, docNo: receipts.docNo, status: receipts.status, partnerName: partners.name, createdAt: receipts.createdAt, value: sql<string>`coalesce((select sum(${receiptLines.qty} * ${receiptLines.unitCost}) from ${receiptLines} where ${receiptLines.receiptId} = ${receipts.id}), 0)` })
      .from(receipts)
      .leftJoin(partners, eq(partners.id, receipts.partnerId))
      .where(gte(receipts.updatedAt, startOfDay))
      .orderBy(desc(receipts.updatedAt))
      .limit(4),
    db
      .select({ id: invoices.id, docNo: invoices.docNo, status: invoices.status, partnerName: partners.name, grandTotal: invoices.grandTotalTry, postedAt: invoices.postedAt })
      .from(invoices)
      .innerJoin(partners, eq(partners.id, invoices.partnerId))
      .where(and(eq(invoices.kind, 'sales'), isNotNull(invoices.postedAt), gte(invoices.postedAt, startOfDay)))
      .orderBy(desc(invoices.postedAt))
      .limit(4),
  ]);

  const items: CockpitTodayItem[] = [
    ...deliveryRows.map((r): CockpitTodayItem => ({ kind: 'Sevkiyat', no: r.docNo, href: `/depo/sevkiyat/${r.id}`, partner: r.partnerName, status: r.status, k: 'delivery', amount: toDb(D(r.value)), at: r.createdAt })),
    ...workOrderRows.map((r): CockpitTodayItem => ({ kind: 'İş emri', no: r.docNo, href: `/uretim/is-emirleri/${r.id}`, partner: `${r.lineName} · ${r.productName}`, status: r.status, k: 'work_order', qty: r.producedQty, uom: r.uomCode, at: r.startedAt ?? new Date(0) })),
    ...receiptRows.map((r): CockpitTodayItem => ({ kind: 'Mal kabul', no: r.docNo, href: `/depo/mal-kabul/${r.id}`, partner: r.partnerName ?? '—', status: r.status, k: 'receipt', amount: toDb(D(r.value)), at: r.createdAt })),
    ...invoiceRows.map((r): CockpitTodayItem => ({ kind: 'Fatura', no: r.docNo, href: `/muhasebe/faturalar/${r.id}`, partner: r.partnerName, status: r.status, k: 'invoice', amount: r.grandTotal, at: r.postedAt ?? new Date() })),
  ];

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 6);
}

export type CockpitExpiringLot = { id: string; lotNo: string; product: string; qty: string; uom: string; expiryDate: string };

/** SKT'ye en yakın, elde miktarı olan, serbest (released) lotlar. */
export async function getCockpitExpiringLots(): Promise<CockpitExpiringLot[]> {
  const rows = await db
    .select({ id: stockLots.id, lotNo: stockLots.lotNo, expiryDate: stockLots.expiryDate, productName: products.name, uomCode: uoms.code, onHand: sql<string>`coalesce((select sum(${stockQuants.qty}) from ${stockQuants} where ${stockQuants.lotId} = ${stockLots.id}), 0)` })
    .from(stockLots)
    .innerJoin(products, eq(products.id, stockLots.productId))
    .innerJoin(uoms, eq(uoms.id, stockLots.uomId))
    .where(and(eq(stockLots.status, 'released'), isNotNull(stockLots.expiryDate)))
    .orderBy(asc(stockLots.expiryDate))
    .limit(30);

  return rows
    .filter((r) => D(r.onHand).gt(0))
    .slice(0, 5)
    .map((r) => ({ id: r.id, lotNo: r.lotNo, product: r.productName, qty: r.onHand, uom: r.uomCode, expiryDate: r.expiryDate! }));
}

export type CockpitApproval = { id: string; title: string; kind: 'purchase_draft' | 'reconciliation' | 'count_variance'; confidence: number | null; href: string };

/** Onay kuyruğu: AI satın alma taslakları + mutabakat önerileri + sayım farkları. İlgili modüller
 *  (satın alma, muhasebe/mutabakat) henüz seed edilmemişse liste gerçekten boş döner. */
export async function getCockpitApprovals(): Promise<CockpitApproval[]> {
  const [draftPOs, reconRows, countRows] = await Promise.all([
    db
      .select({ id: purchaseOrders.id, docNo: purchaseOrders.docNo, grandTotal: purchaseOrders.grandTotal, partnerName: partners.name, confidence: purchaseOrders.aiConfidence, createdAt: purchaseOrders.createdAt })
      .from(purchaseOrders)
      .innerJoin(partners, eq(partners.id, purchaseOrders.partnerId))
      .where(eq(purchaseOrders.status, 'ai_draft'))
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(3),
    db
      .select({ id: reconciliationMatches.id, amount: bankTransactions.amount, description: bankTransactions.description, confidence: reconciliationMatches.confidence, partnerName: partners.name, createdAt: reconciliationMatches.createdAt })
      .from(reconciliationMatches)
      .innerJoin(bankTransactions, eq(bankTransactions.id, reconciliationMatches.bankTransactionId))
      .leftJoin(partners, eq(partners.id, reconciliationMatches.partnerId))
      .where(eq(reconciliationMatches.status, 'suggested'))
      .orderBy(desc(reconciliationMatches.createdAt))
      .limit(3),
    db
      .select({ id: stockCounts.id, docNo: stockCounts.docNo, varianceValue: stockCounts.varianceValue, warehouseCode: warehouses.code })
      .from(stockCounts)
      .innerJoin(warehouses, eq(warehouses.id, stockCounts.warehouseId))
      .where(eq(stockCounts.status, 'review'))
      .orderBy(desc(stockCounts.updatedAt))
      .limit(3),
  ]);

  const items: CockpitApproval[] = [
    ...draftPOs.map((r): CockpitApproval => ({ id: r.id, title: `AI satın alma taslağı · ${r.partnerName} · ${toDb(D(r.grandTotal))} ₺`, kind: 'purchase_draft', confidence: r.confidence !== null ? D(r.confidence).toNumber() : null, href: `/satin-alma/siparisler/${r.id}` })),
    ...reconRows.map((r): CockpitApproval => ({ id: r.id, title: `Mutabakat önerisi · ${toDb(D(r.amount))} ₺ → ${r.partnerName ?? r.description}`, kind: 'reconciliation', confidence: D(r.confidence).toNumber(), href: `/muhasebe/mutabakat` })),
    ...countRows.map((r): CockpitApproval => ({ id: r.id, title: `Sayım farkı · ${r.warehouseCode} (${toDb(D(r.varianceValue))} ₺)`, kind: 'count_variance', confidence: null, href: `/depo/sayim/${r.id}` })),
  ];

  return items.slice(0, 5);
}

/** Bugünkü tahsilatlar (banka/kasa) — gerçek veri, satın alma/mutabakat modülleri gelmeden de dolabilir. */
export type CockpitReceipt = { id: string; docNo: string; partnerName: string; amount: string; method: string };

export async function getCockpitReceivablesToday(): Promise<CockpitReceipt[]> {
  const today = businessDate(new Date());
  const rows = await db
    .select({ id: payments.id, docNo: payments.docNo, partnerName: partners.name, amount: payments.amountTry, method: payments.method })
    .from(payments)
    .innerJoin(partners, eq(partners.id, payments.partnerId))
    .where(and(eq(payments.direction, 'inbound'), eq(payments.status, 'posted'), eq(payments.paymentDate, today)))
    .orderBy(desc(payments.createdAt))
    .limit(5);
  return rows;
}

export async function getCockpitLineCards(): Promise<LineCardRow[]> {
  return listLineCards();
}
