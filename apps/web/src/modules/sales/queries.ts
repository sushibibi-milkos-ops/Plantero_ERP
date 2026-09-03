import 'server-only';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db, schema } from '@plantero/db';
import { D, toDb, round4, ZERO, getChain } from '@plantero/core';
import { getChannelRevenue } from '@plantero/core/sales/channels';
import { getFunnel } from '@plantero/core/sales/crm';

const {
  salesOrders, salesOrderLines, salesChannels, priceLists, priceListItems, customerPrices,
  opportunities, opportunityStages, opportunityActivities, channelOrders, channelSettlements,
  partners, products, uoms, warehouses, deliveries, invoices, users,
} = schema;

/* ==================================================================== */
/* Ortak arama listeleri (form combobox'ları)                           */
/* ==================================================================== */

export async function listChannels() {
  return db.select().from(salesChannels).where(eq(salesChannels.isActive, true)).orderBy(asc(salesChannels.sortOrder), asc(salesChannels.name));
}

export async function listCustomers() {
  const rows = await db.select().from(partners).where(and(inArray(partners.kind, ['customer', 'both']), eq(partners.isActive, true))).orderBy(asc(partners.name));
  return rows;
}

export async function listWarehouses() {
  return db.select().from(warehouses).where(eq(warehouses.isActive, true)).orderBy(asc(warehouses.code));
}

export async function listPriceListsBasic() {
  return db.select().from(priceLists).where(eq(priceLists.isActive, true)).orderBy(asc(priceLists.code));
}

export type SellableProductRow = { id: string; sku: string; name: string; uomId: string; uomCode: string; vatRate: string; listPrice: string; barcode: string | null; isLotTracked: boolean };

export async function listSellableProducts(): Promise<SellableProductRow[]> {
  const rows = await db
    .select({ p: products, uomCode: uoms.code })
    .from(products)
    .innerJoin(uoms, eq(uoms.id, products.uomId))
    .where(and(eq(products.isSellable, true), eq(products.status, 'active')))
    .orderBy(asc(products.name));
  return rows.map((r) => ({ id: r.p.id, sku: r.p.sku, name: r.p.name, uomId: r.p.uomId, uomCode: r.uomCode, vatRate: r.p.vatRate, listPrice: r.p.listPrice, barcode: r.p.barcode, isLotTracked: r.p.isLotTracked }));
}

/* ==================================================================== */
/* /satis/firsatlar — CRM kanban                                        */
/* ==================================================================== */

export async function listOpportunityStages() {
  return db.select().from(opportunityStages).orderBy(asc(opportunityStages.sortOrder));
}

export type OpportunityCardRow = {
  id: string; docNo: string; title: string; stageId: string; partnerName: string | null; channelName: string | null; channelColor: string | null;
  expectedAmount: string; currency: string; probability: number; nextActivity: string | null; nextActivityDate: string | null;
  ownerName: string | null; isOverdue: boolean;
};

export async function listOpportunityCards(): Promise<OpportunityCardRow[]> {
  const rows = await db
    .select({
      o: opportunities, partnerName: partners.name, channelName: salesChannels.name, channelColor: salesChannels.color, ownerName: users.fullName,
    })
    .from(opportunities)
    .leftJoin(partners, eq(partners.id, opportunities.partnerId))
    .leftJoin(salesChannels, eq(salesChannels.id, opportunities.channelId))
    .leftJoin(users, eq(users.id, opportunities.ownerId))
    .orderBy(desc(opportunities.createdAt));
  const todayStr = new Date().toISOString().slice(0, 10);
  return rows.map((r) => ({
    id: r.o.id, docNo: r.o.docNo, title: r.o.title, stageId: r.o.stageId, partnerName: r.partnerName, channelName: r.channelName, channelColor: r.channelColor,
    expectedAmount: r.o.expectedAmount, currency: r.o.currency, probability: r.o.probability, nextActivity: r.o.nextActivity, nextActivityDate: r.o.nextActivityDate,
    ownerName: r.ownerName, isOverdue: Boolean(r.o.nextActivityDate && r.o.nextActivityDate < todayStr && !r.o.closedAt),
  }));
}

export async function getOpportunityDetail(id: string) {
  const [row] = await db
    .select({ o: opportunities, partnerName: partners.name, channelName: salesChannels.name, ownerName: users.fullName })
    .from(opportunities)
    .leftJoin(partners, eq(partners.id, opportunities.partnerId))
    .leftJoin(salesChannels, eq(salesChannels.id, opportunities.channelId))
    .leftJoin(users, eq(users.id, opportunities.ownerId))
    .where(eq(opportunities.id, id))
    .limit(1);
  if (!row) return null;
  const activities = await db
    .select({ a: opportunityActivities, userName: users.fullName })
    .from(opportunityActivities)
    .leftJoin(users, eq(users.id, opportunityActivities.userId))
    .where(eq(opportunityActivities.opportunityId, id))
    .orderBy(desc(opportunityActivities.at));
  let quotationDocNo: string | null = null;
  if (row.o.quotationId) {
    const [q] = await db.select({ docNo: salesOrders.docNo }).from(salesOrders).where(eq(salesOrders.id, row.o.quotationId)).limit(1);
    quotationDocNo = q?.docNo ?? null;
  }
  return { opportunity: row.o, partnerName: row.partnerName, channelName: row.channelName, ownerName: row.ownerName, activities, quotationDocNo };
}

export async function getSalesFunnel() {
  return getFunnel(db);
}

/* ==================================================================== */
/* Teklifler / Siparişler — ortak satır tipi (docType ile ayrışır)      */
/* ==================================================================== */

export type SalesDocRow = {
  id: string; docType: 'quotation' | 'order'; docNo: string; status: string; partnerName: string; channelName: string; channelColor: string | null;
  orderDate: string; validUntil: string | null; currency: string; grandTotal: string; netRevenue: string; externalOrderNo: string | null;
  deliveredPct: number; invoicedPct: number;
};

async function listSalesDocs(docType: 'quotation' | 'order'): Promise<SalesDocRow[]> {
  const rows = await db
    .select({ o: salesOrders, partnerName: partners.name, channelName: salesChannels.name, channelColor: salesChannels.color })
    .from(salesOrders)
    .innerJoin(partners, eq(partners.id, salesOrders.partnerId))
    .innerJoin(salesChannels, eq(salesChannels.id, salesOrders.channelId))
    .where(eq(salesOrders.docType, docType))
    .orderBy(desc(salesOrders.orderDate), desc(salesOrders.createdAt));
  if (!rows.length) return [];
  const progress = await db
    .select({ orderId: salesOrderLines.orderId, qty: sql<string>`coalesce(sum(${salesOrderLines.qty}), 0)`, delivered: sql<string>`coalesce(sum(${salesOrderLines.deliveredQty}), 0)`, invoiced: sql<string>`coalesce(sum(${salesOrderLines.invoicedQty}), 0)` })
    .from(salesOrderLines)
    .where(inArray(salesOrderLines.orderId, rows.map((r) => r.o.id)))
    .groupBy(salesOrderLines.orderId);
  const byOrder = new Map(progress.map((p) => [p.orderId, p]));
  return rows.map((r) => {
    const p = byOrder.get(r.o.id);
    const qty = D(p?.qty ?? 0);
    const deliveredPct = qty.gt(0) ? D(p?.delivered ?? 0).div(qty).mul(100).toNumber() : 0;
    const invoicedPct = qty.gt(0) ? D(p?.invoiced ?? 0).div(qty).mul(100).toNumber() : 0;
    return {
      id: r.o.id, docType, docNo: r.o.docNo, status: r.o.status, partnerName: r.partnerName, channelName: r.channelName, channelColor: r.channelColor,
      orderDate: r.o.orderDate, validUntil: r.o.validUntil, currency: r.o.currency, grandTotal: r.o.grandTotal, netRevenue: r.o.netRevenue,
      externalOrderNo: r.o.externalOrderNo, deliveredPct: Math.min(100, Math.round(deliveredPct)), invoicedPct: Math.min(100, Math.round(invoicedPct)),
    };
  });
}

export const listQuotations = () => listSalesDocs('quotation');
export const listSalesOrders = () => listSalesDocs('order');

export async function getSalesDocDetail(id: string) {
  const [row] = await db
    .select({ o: salesOrders, partnerName: partners.name, partnerCode: partners.code, channelName: salesChannels.name, warehouseName: warehouses.name, priceListName: priceLists.name })
    .from(salesOrders)
    .innerJoin(partners, eq(partners.id, salesOrders.partnerId))
    .innerJoin(salesChannels, eq(salesChannels.id, salesOrders.channelId))
    .innerJoin(warehouses, eq(warehouses.id, salesOrders.warehouseId))
    .leftJoin(priceLists, eq(priceLists.id, salesOrders.priceListId))
    .where(eq(salesOrders.id, id))
    .limit(1);
  if (!row) return null;
  const lines = await db
    .select({ line: salesOrderLines, sku: products.sku, productName: products.name, uomCode: uoms.code })
    .from(salesOrderLines)
    .innerJoin(products, eq(products.id, salesOrderLines.productId))
    .innerJoin(uoms, eq(uoms.id, salesOrderLines.uomId))
    .where(eq(salesOrderLines.orderId, id))
    .orderBy(asc(salesOrderLines.sequence));
  const relatedDeliveries = await db.select().from(deliveries).where(eq(deliveries.salesOrderId, id)).orderBy(desc(deliveries.createdAt));
  const relatedInvoices = await db.select().from(invoices).where(eq(invoices.salesOrderId, id)).orderBy(desc(invoices.invoiceDate));
  const chain = await getChain(db, row.o.docType === 'quotation' ? 'quotation' : 'sales_order', id);
  return { order: row.o, partnerName: row.partnerName, partnerCode: row.partnerCode, channelName: row.channelName, warehouseName: row.warehouseName, priceListName: row.priceListName, lines, deliveries: relatedDeliveries, invoices: relatedInvoices, chain };
}

/* ==================================================================== */
/* /satis/kanallar                                                      */
/* ==================================================================== */

export type ChannelCardRow = {
  channel: typeof salesChannels.$inferSelect;
  todayRevenue: string; monthRevenue: string; orderCount: number;
  lastSyncedAt: Date | null; lastSyncError: string | null; pendingErrors: number;
};

export async function listChannelCards(): Promise<ChannelCardRow[]> {
  const channels = await db.select().from(salesChannels).orderBy(asc(salesChannels.sortOrder));
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;

  const monthAgg = await db
    .select({ channelId: salesOrders.channelId, count: sql<string>`count(*)`, net: sql<string>`coalesce(sum(${salesOrders.netRevenue}::numeric * ${salesOrders.exchangeRate}::numeric), 0)` })
    .from(salesOrders)
    .where(and(eq(salesOrders.docType, 'order'), gte(salesOrders.orderDate, monthStart), inArray(salesOrders.status, ['confirmed', 'partially_delivered', 'delivered', 'invoiced', 'closed'])))
    .groupBy(salesOrders.channelId);
  const todayAgg = await db
    .select({ channelId: salesOrders.channelId, net: sql<string>`coalesce(sum(${salesOrders.netRevenue}::numeric * ${salesOrders.exchangeRate}::numeric), 0)` })
    .from(salesOrders)
    .where(and(eq(salesOrders.docType, 'order'), eq(salesOrders.orderDate, today), inArray(salesOrders.status, ['confirmed', 'partially_delivered', 'delivered', 'invoiced', 'closed'])))
    .groupBy(salesOrders.channelId);
  const monthByChannel = new Map(monthAgg.map((r) => [r.channelId, r]));
  const todayByChannel = new Map(todayAgg.map((r) => [r.channelId, r]));

  const syncRows = await db
    .select({ channelId: channelOrders.channelId, lastSyncedAt: sql<Date>`max(${channelOrders.syncedAt})`, errors: sql<string>`count(*) filter (where ${channelOrders.syncStatus} = 'error')` })
    .from(channelOrders)
    .groupBy(channelOrders.channelId);
  const syncByChannel = new Map(syncRows.map((r) => [r.channelId, r]));
  const lastErrorRows = await db.select({ channelId: channelOrders.channelId, syncError: channelOrders.syncError }).from(channelOrders).where(eq(channelOrders.syncStatus, 'error')).orderBy(desc(channelOrders.syncedAt));
  const firstErrorByChannel = new Map<string, string>();
  for (const r of lastErrorRows) if (r.syncError && !firstErrorByChannel.has(r.channelId)) firstErrorByChannel.set(r.channelId, r.syncError);

  return channels.map((c) => ({
    channel: c,
    todayRevenue: toDb(D(todayByChannel.get(c.id)?.net ?? 0)),
    monthRevenue: toDb(D(monthByChannel.get(c.id)?.net ?? 0)),
    orderCount: Number(monthByChannel.get(c.id)?.count ?? 0),
    lastSyncedAt: syncByChannel.get(c.id)?.lastSyncedAt ?? null,
    lastSyncError: firstErrorByChannel.get(c.id) ?? null,
    pendingErrors: Number(syncByChannel.get(c.id)?.errors ?? 0),
  }));
}

export async function getChannelSettlements(channelId: string) {
  return db.select().from(channelSettlements).where(eq(channelSettlements.channelId, channelId)).orderBy(desc(channelSettlements.periodStart));
}

/* ==================================================================== */
/* /satis/fiyat-listeleri                                               */
/* ==================================================================== */

export async function listPriceListsWithCounts() {
  const lists = await db.select({ l: priceLists, channelName: salesChannels.name }).from(priceLists).leftJoin(salesChannels, eq(salesChannels.id, priceLists.channelId)).orderBy(asc(priceLists.code));
  const counts = await db.select({ priceListId: priceListItems.priceListId, cnt: sql<string>`count(*)` }).from(priceListItems).groupBy(priceListItems.priceListId);
  const byList = new Map(counts.map((c) => [c.priceListId, Number(c.cnt)]));
  return lists.map((r) => ({ ...r.l, channelName: r.channelName, itemCount: byList.get(r.l.id) ?? 0 }));
}

export async function getPriceListItems(priceListId: string) {
  return db
    .select({ item: priceListItems, sku: products.sku, productName: products.name, uomCode: uoms.code })
    .from(priceListItems)
    .innerJoin(products, eq(products.id, priceListItems.productId))
    .innerJoin(uoms, eq(uoms.id, products.uomId))
    .where(eq(priceListItems.priceListId, priceListId))
    .orderBy(asc(products.name));
}

export async function listCustomerPrices() {
  return db
    .select({ row: customerPrices, partnerName: partners.name, sku: products.sku, productName: products.name, approvedByName: users.fullName })
    .from(customerPrices)
    .innerJoin(partners, eq(partners.id, customerPrices.partnerId))
    .innerJoin(products, eq(products.id, customerPrices.productId))
    .leftJoin(users, eq(users.id, customerPrices.approvedBy))
    .orderBy(desc(customerPrices.createdAt));
}

/* ==================================================================== */
/* /satis/net-ciro                                                      */
/* ==================================================================== */

export type NetRevenuePeriodTotals = {
  grossRevenue: string; commission: string; shipping: string; other: string; vatTotal: string; netRevenue: string; orderCount: number; avgBasket: string;
};

async function periodTotals(from: string, to: string): Promise<NetRevenuePeriodTotals> {
  const rows = await getChannelRevenue(db, { from, to });
  let gross = ZERO, commission = ZERO, shipping = ZERO, other = ZERO, vat = ZERO, net = ZERO, orderCount = 0;
  for (const r of rows) {
    gross = gross.plus(r.subtotal);
    commission = commission.plus(r.commissionAmount);
    shipping = shipping.plus(r.shippingDeduction);
    other = other.plus(r.otherDeduction);
    vat = vat.plus(r.vatTotal);
    net = net.plus(r.netRevenue);
    orderCount += r.orderCount;
  }
  const avgBasket = orderCount > 0 ? round4(gross.div(orderCount)) : ZERO;
  return { grossRevenue: toDb(gross), commission: toDb(commission), shipping: toDb(shipping), other: toDb(other), vatTotal: toDb(vat), netRevenue: toDb(net), orderCount, avgBasket: toDb(avgBasket) };
}

export type ChannelBreakdownRow = { channelId: string; channelCode: string; channelName: string; gross: string; commission: string; shipping: string; other: string; net: string; netMarginPct: number };

export async function getNetRevenueReport(from: string, to: string) {
  const [current, rows] = await Promise.all([periodTotals(from, to), getChannelRevenue(db, { from, to })]);
  const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1);
  const prevTo = new Date(new Date(from).getTime() - 86_400_000).toISOString().slice(0, 10);
  const prevFrom = new Date(new Date(prevTo).getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const previous = await periodTotals(prevFrom, prevTo);

  const delta = (curr: string, prev: string): number | null => {
    const p = D(prev);
    if (p.isZero()) return null;
    return D(curr).minus(p).div(p).mul(100).toNumber();
  };

  const breakdown: ChannelBreakdownRow[] = rows
    .map((r) => ({
      channelId: r.channelId, channelCode: r.channelCode, channelName: r.channelName, gross: toDb(r.subtotal), commission: toDb(r.commissionAmount),
      shipping: toDb(r.shippingDeduction), other: toDb(r.otherDeduction), net: toDb(r.netRevenue),
      netMarginPct: r.subtotal.gt(0) ? r.netRevenue.div(r.subtotal).mul(100).toNumber() : 0,
    }))
    .sort((a, b) => D(b.net).comparedTo(D(a.net)));

  // Günlük kanal bazlı net ciro serisi (recharts)
  const daily = await db
    .select({ date: salesOrders.orderDate, channelCode: salesChannels.code, channelName: salesChannels.name, net: sql<string>`coalesce(sum(${salesOrders.netRevenue}::numeric * ${salesOrders.exchangeRate}::numeric), 0)` })
    .from(salesOrders)
    .innerJoin(salesChannels, eq(salesChannels.id, salesOrders.channelId))
    .where(and(eq(salesOrders.docType, 'order'), gte(salesOrders.orderDate, from), lte(salesOrders.orderDate, to), inArray(salesOrders.status, ['confirmed', 'partially_delivered', 'delivered', 'invoiced', 'closed'])))
    .groupBy(salesOrders.orderDate, salesChannels.code, salesChannels.name)
    .orderBy(asc(salesOrders.orderDate));

  const dateSet = new Set<string>();
  for (let d = new Date(from); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) dateSet.add(d.toISOString().slice(0, 10));
  const channelCodes = Array.from(new Set(daily.map((r) => r.channelCode)));
  const series = Array.from(dateSet)
    .sort()
    .map((date) => {
      const point: Record<string, string | number> = { date };
      let total = 0;
      for (const code of channelCodes) {
        const match = daily.find((r) => r.date === date && r.channelCode === code);
        const v = match ? Number(match.net) : 0;
        point[code] = v;
        total += v;
      }
      point.total = Math.round(total * 100) / 100;
      return point;
    });

  return {
    current, previous, deltas: {
      gross: delta(current.grossRevenue, previous.grossRevenue), commission: delta(current.commission, previous.commission),
      shipping: delta(current.shipping, previous.shipping), net: delta(current.netRevenue, previous.netRevenue),
      orderCount: previous.orderCount > 0 ? ((current.orderCount - previous.orderCount) / previous.orderCount) * 100 : null,
      avgBasket: delta(current.avgBasket, previous.avgBasket),
    },
    breakdown, series, channelCodes: channelCodes.map((code) => ({ code, name: daily.find((r) => r.channelCode === code)?.channelName ?? code })),
  };
}
