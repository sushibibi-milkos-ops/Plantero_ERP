import 'server-only';
import { and, asc, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { db, schema } from '@plantero/db';
import { D, getChain, traceBackward, traceForward } from '@plantero/core';
import { buildDraftMessage } from '@plantero/core/quality/recall';
import type { RecallImpact } from '@plantero/core/lots/trace';

const {
  qcChecks, qcCheckResults, qcTemplates, qcTemplateItems, stockLots, stockQuants, products, partners,
  receipts, locations, warehouses, supplierScores, recalls, recallItems, users,
} = schema;

/* ==================================================================== */
/* /kalite/kontroller                                                    */
/* ==================================================================== */

export type QcCheckRow = {
  id: string; docNo: string; kind: string; result: string; productName: string; sku: string;
  lotNo: string | null; lotId: string | null; supplierName: string | null; receiptDocNo: string | null;
  sampledQty: string | null; checkedAt: Date | null; createdAt: Date;
};

export async function listChecks(): Promise<QcCheckRow[]> {
  const rows = await db
    .select({
      c: qcChecks, productName: products.name, sku: products.sku, lotNo: stockLots.lotNo,
      supplierName: partners.name, receiptDocNo: receipts.docNo,
    })
    .from(qcChecks)
    .innerJoin(products, eq(products.id, qcChecks.productId))
    .leftJoin(stockLots, eq(stockLots.id, qcChecks.lotId))
    .leftJoin(partners, eq(partners.id, qcChecks.supplierId))
    .leftJoin(receipts, eq(receipts.id, qcChecks.receiptId))
    .orderBy(desc(qcChecks.createdAt));
  return rows.map((r) => ({
    id: r.c.id, docNo: r.c.docNo, kind: r.c.kind, result: r.c.result, productName: r.productName, sku: r.sku,
    lotNo: r.lotNo, lotId: r.c.lotId, supplierName: r.supplierName, receiptDocNo: r.receiptDocNo,
    sampledQty: r.c.sampledQty, checkedAt: r.c.checkedAt, createdAt: r.c.createdAt,
  }));
}

export type QcCheckDetail = {
  check: typeof qcChecks.$inferSelect;
  product: typeof products.$inferSelect;
  lot: (typeof stockLots.$inferSelect & { onHandQty: string; locationCode: string | null; warehouseId: string | null }) | null;
  supplier: { id: string; name: string } | null;
  receipt: { id: string; docNo: string } | null;
  template: (typeof qcTemplates.$inferSelect & { items: Array<typeof qcTemplateItems.$inferSelect> }) | null;
  results: Array<typeof qcCheckResults.$inferSelect>;
  inspector: { id: string; fullName: string } | null;
  chain: Awaited<ReturnType<typeof getChain>> | null;
};

export async function getCheckDetail(id: string): Promise<QcCheckDetail | null> {
  const [row] = await db.select().from(qcChecks).where(eq(qcChecks.id, id)).limit(1);
  if (!row) return null;
  const [product] = await db.select().from(products).where(eq(products.id, row.productId)).limit(1);
  if (!product) return null;

  let lot: QcCheckDetail['lot'] = null;
  if (row.lotId) {
    const [l] = await db.select().from(stockLots).where(eq(stockLots.id, row.lotId)).limit(1);
    if (l) {
      const [q] = await db
        .select({ qty: sql<string>`coalesce(sum(${stockQuants.qty}), 0)`, locationId: sql<string>`min(${stockQuants.locationId}::text)` })
        .from(stockQuants)
        .where(eq(stockQuants.lotId, l.id));
      let locationCode: string | null = null;
      let warehouseId: string | null = null;
      if (q?.locationId) {
        const [loc] = await db.select({ code: locations.code, warehouseId: locations.warehouseId }).from(locations).where(eq(locations.id, q.locationId)).limit(1);
        locationCode = loc?.code ?? null;
        warehouseId = loc?.warehouseId ?? null;
      }
      lot = { ...l, onHandQty: q?.qty ?? '0', locationCode, warehouseId };
    }
  }

  const supplier = row.supplierId ? await db.select({ id: partners.id, name: partners.name }).from(partners).where(eq(partners.id, row.supplierId)).limit(1).then((r) => r[0] ?? null) : null;
  const receipt = row.receiptId ? await db.select({ id: receipts.id, docNo: receipts.docNo }).from(receipts).where(eq(receipts.id, row.receiptId)).limit(1).then((r) => r[0] ?? null) : null;

  let template: QcCheckDetail['template'] = null;
  if (row.templateId) {
    const [t] = await db.select().from(qcTemplates).where(eq(qcTemplates.id, row.templateId)).limit(1);
    if (t) {
      const items = await db.select().from(qcTemplateItems).where(eq(qcTemplateItems.templateId, t.id)).orderBy(asc(qcTemplateItems.sequence));
      template = { ...t, items };
    }
  }

  const results = await db.select().from(qcCheckResults).where(eq(qcCheckResults.checkId, id)).orderBy(asc(qcCheckResults.sequence));
  const inspector = row.inspectorId ? await db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.id, row.inspectorId)).limit(1).then((r) => r[0] ?? null) : null;

  let chain: QcCheckDetail['chain'] = null;
  try {
    chain = await getChain(db, 'quality_check', id);
  } catch {
    chain = null;
  }

  return { check: row, product, lot, supplier, receipt, template, results, inspector, chain };
}

/** Karar formunda hedef lokasyon seçenekleri: lotun deposu (yoksa TIRE) içindeki fiziksel yerleşimler + RED. */
export async function listDecisionLocations(warehouseId: string | null) {
  const whCond = warehouseId ? eq(locations.warehouseId, warehouseId) : undefined;
  const rows = await db
    .select({ id: locations.id, code: locations.code, name: locations.name, usage: locations.usage })
    .from(locations)
    .where(and(inArray(locations.usage, ['internal', 'rejected']), eq(locations.isActive, true), eq(locations.isPickable, true), whCond ?? sql`true`))
    .orderBy(asc(locations.code));
  return {
    release: rows.filter((r) => r.usage === 'internal'),
    reject: rows.filter((r) => r.usage === 'rejected'),
  };
}

/* ==================================================================== */
/* /kalite/sablonlar                                                     */
/* ==================================================================== */

export type QcTemplateRow = typeof qcTemplates.$inferSelect & { itemCount: number; productName: string | null };

export async function listTemplates(): Promise<QcTemplateRow[]> {
  const rows = await db.select({ t: qcTemplates, productName: products.name }).from(qcTemplates).leftJoin(products, eq(products.id, qcTemplates.productId)).orderBy(asc(qcTemplates.name));
  const counts = await db.select({ templateId: qcTemplateItems.templateId, n: sql<string>`count(*)` }).from(qcTemplateItems).groupBy(qcTemplateItems.templateId);
  const countByTemplate = new Map(counts.map((c) => [c.templateId, Number(c.n)]));
  return rows.map((r) => ({ ...r.t, itemCount: countByTemplate.get(r.t.id) ?? 0, productName: r.productName }));
}

export async function getTemplateDetail(id: string) {
  const [t] = await db.select().from(qcTemplates).where(eq(qcTemplates.id, id)).limit(1);
  if (!t) return null;
  const items = await db.select().from(qcTemplateItems).where(eq(qcTemplateItems.templateId, id)).orderBy(asc(qcTemplateItems.sequence));
  return { template: t, items };
}

export async function listProductsForTemplate() {
  return db.select({ id: products.id, sku: products.sku, name: products.name, type: products.type }).from(products).where(eq(products.status, 'active')).orderBy(asc(products.name));
}

/* ==================================================================== */
/* /kalite/tedarikci-skoru                                               */
/* ==================================================================== */

export type SupplierScoreRow = typeof supplierScores.$inferSelect & { partnerName: string; partnerCode: string };

export async function listSupplierScores(): Promise<SupplierScoreRow[]> {
  const rows = await db
    .select({ s: supplierScores, partnerName: partners.name, partnerCode: partners.code })
    .from(supplierScores)
    .innerJoin(partners, eq(partners.id, supplierScores.partnerId))
    .orderBy(desc(supplierScores.period), asc(partners.name));
  return rows.map((r) => ({ ...r.s, partnerName: r.partnerName, partnerCode: r.partnerCode }));
}

export type SupplierTrendPoint = { period: string; score: number };

export async function getSupplierScoreTrend(partnerId: string): Promise<SupplierTrendPoint[]> {
  const rows = await db.select({ period: supplierScores.period, score: supplierScores.score }).from(supplierScores).where(eq(supplierScores.partnerId, partnerId)).orderBy(asc(supplierScores.period));
  return rows.map((r) => ({ period: r.period, score: D(r.score).toNumber() }));
}

export type SupplierBoardRow = {
  partnerId: string; partnerName: string; partnerCode: string; period: string; score: number;
  receipts: number; onTimeReceipts: number; qcChecks: number; qcPassed: number; rejectedQty: string; receivedQty: string;
  trend: number[];
};

/** `listSupplierScores()` (tüm dönem × tedarikçi satırları) → tedarikçi başına en güncel dönem + trend dizisi. */
export function boardFromScores(rows: SupplierScoreRow[]): SupplierBoardRow[] {
  const byPartner = new Map<string, SupplierScoreRow[]>();
  for (const r of rows) (byPartner.get(r.partnerId) ?? byPartner.set(r.partnerId, []).get(r.partnerId)!).push(r);
  const out: SupplierBoardRow[] = [];
  for (const [partnerId, list] of byPartner) {
    const sorted = [...list].sort((a, b) => a.period.localeCompare(b.period));
    const last = sorted[sorted.length - 1]!;
    out.push({
      partnerId, partnerName: last.partnerName, partnerCode: last.partnerCode, period: last.period, score: Number(last.score),
      receipts: last.receipts, onTimeReceipts: last.onTimeReceipts, qcChecks: last.qcChecks, qcPassed: last.qcPassed,
      rejectedQty: last.rejectedQty, receivedQty: last.receivedQty, trend: sorted.map((s) => Number(s.score)),
    });
  }
  return out.sort((a, b) => a.score - b.score);
}

/* ==================================================================== */
/* /kalite/izlenebilirlik                                                */
/* ==================================================================== */

export type TraceSearchResult = { kind: 'lot' | 'product' | 'partner'; id: string; label: string; sub: string };

export async function searchTraceEntities(q: string): Promise<TraceSearchResult[]> {
  const needle = `%${q.trim()}%`;
  if (!q.trim()) return [];
  const lotRows = await db
    .select({ id: stockLots.id, lotNo: stockLots.lotNo, productName: products.name, status: stockLots.status })
    .from(stockLots)
    .innerJoin(products, eq(products.id, stockLots.productId))
    .where(or(sql`${stockLots.lotNo} ILIKE ${needle}`, sql`${products.name} ILIKE ${needle}`, sql`${products.sku} ILIKE ${needle}`))
    .orderBy(desc(stockLots.createdAt))
    .limit(15);
  const partnerRows = await db
    .select({ id: partners.id, name: partners.name, code: partners.code, kind: partners.kind })
    .from(partners)
    .where(and(or(sql`${partners.name} ILIKE ${needle}`, sql`${partners.code} ILIKE ${needle}`), eq(partners.isActive, true)))
    .limit(10);

  return [
    ...lotRows.map((r): TraceSearchResult => ({ kind: 'lot', id: r.id, label: r.lotNo, sub: `${r.productName} · ${r.status}` })),
    ...partnerRows.map((r): TraceSearchResult => ({ kind: 'partner', id: r.id, label: r.name, sub: r.kind === 'supplier' ? 'Tedarikçi' : r.kind === 'customer' ? 'Müşteri' : r.kind })),
  ];
}

/** Bir cari (müşteri/tedarikçi) seçildiğinde ilişkili lotlar (müşteri: sevk edilenler; tedarikçi: gelenler) */
export async function listLotsForPartner(partnerId: string, kind: 'customer' | 'supplier'): Promise<TraceSearchResult[]> {
  if (kind === 'supplier') {
    const rows = await db
      .select({ id: stockLots.id, lotNo: stockLots.lotNo, productName: products.name })
      .from(stockLots)
      .innerJoin(products, eq(products.id, stockLots.productId))
      .where(eq(stockLots.supplierId, partnerId))
      .orderBy(desc(stockLots.createdAt))
      .limit(30);
    return rows.map((r) => ({ kind: 'lot' as const, id: r.id, label: r.lotNo, sub: r.productName }));
  }
  const { deliveryLines, deliveries } = schema;
  const rows = await db
    .select({ id: stockLots.id, lotNo: stockLots.lotNo, productName: products.name })
    .from(deliveryLines)
    .innerJoin(deliveries, eq(deliveries.id, deliveryLines.deliveryId))
    .innerJoin(stockLots, eq(stockLots.id, deliveryLines.lotId))
    .innerJoin(products, eq(products.id, stockLots.productId))
    .where(and(eq(deliveries.partnerId, partnerId), isNotNull(deliveryLines.lotId)))
    .orderBy(desc(deliveries.createdAt))
    .limit(30);
  const uniq = new Map(rows.map((r) => [r.id, r]));
  return Array.from(uniq.values()).map((r) => ({ kind: 'lot' as const, id: r.id, label: r.lotNo, sub: r.productName }));
}

export type TraceView = {
  lot: typeof stockLots.$inferSelect & { productName: string; sku: string };
  forward: Awaited<ReturnType<typeof traceForward>>;
  backward: Awaited<ReturnType<typeof traceBackward>>;
  balance: { inQty: string; consumedQty: string; deliveredQty: string; scrapQty: string; onHandQty: string };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `idOrLotNo`: lot UUID'si YA DA lot numarası (`stock_lots.lot_no`) kabul eder — Tur 1 P1
 * kalite-izlenebilirlik-02: `/kalite/izlenebilirlik?lot=` derin bağlantısı kullanıcının elindeki tek
 * görünür kimlik olan lot NUMARASIyla paylaşılır/yapıştırılır, UUID ile değil; önceden yalnızca
 * `stock_lots.id` ile arandığından her böyle bağlantı sessizce "bulunamadı" gibi davranıyordu.
 */
export async function getTraceForLot(idOrLotNo: string): Promise<TraceView | null> {
  const cond = UUID_RE.test(idOrLotNo) ? eq(stockLots.id, idOrLotNo) : eq(stockLots.lotNo, idOrLotNo);
  const [row] = await db.select({ lot: stockLots, productName: products.name, sku: products.sku }).from(stockLots).innerJoin(products, eq(products.id, stockLots.productId)).where(cond).limit(1);
  if (!row) return null;
  const lotId = row.lot.id;
  const [forward, backward] = await Promise.all([traceForward(db, lotId), traceBackward(db, lotId)]);

  const { stockMoves } = schema;
  const moveRows = await db.select({ kind: stockMoves.kind, qty: stockMoves.qty }).from(stockMoves).where(eq(stockMoves.lotId, lotId));
  const sumBy = (kinds: string[]) => moveRows.filter((m) => kinds.includes(m.kind)).reduce((acc, m) => acc.plus(D(m.qty)), D(0));
  const inQty = sumBy(['receipt', 'production', 'byproduct', 'opening', 'quarantine_release', 'return_in', 'recall_return']);
  const consumedQty = sumBy(['consumption']);
  const deliveredQty = sumBy(['delivery']);
  const scrapQty = sumBy(['scrap']);
  const [onHand] = await db.select({ qty: sql<string>`coalesce(sum(${stockQuants.qty}), 0)` }).from(stockQuants).where(eq(stockQuants.lotId, lotId));

  return {
    lot: { ...row.lot, productName: row.productName, sku: row.sku }, forward, backward,
    balance: { inQty: inQty.toFixed(4), consumedQty: consumedQty.toFixed(4), deliveredQty: deliveredQty.toFixed(4), scrapQty: scrapQty.toFixed(4), onHandQty: onHand?.qty ?? '0' },
  };
}

/* ==================================================================== */
/* /kalite/geri-cagirma                                                  */
/* ==================================================================== */

export type RecallRow = typeof recalls.$inferSelect & { lotNo: string; productName: string };

export async function listRecalls(): Promise<RecallRow[]> {
  const rows = await db
    .select({ r: recalls, lotNo: stockLots.lotNo, productName: products.name })
    .from(recalls)
    .innerJoin(stockLots, eq(stockLots.id, recalls.rootLotId))
    .innerJoin(products, eq(products.id, stockLots.productId))
    .orderBy(desc(recalls.createdAt));
  return rows.map((r) => ({ ...r.r, lotNo: r.lotNo, productName: r.productName }));
}

export type RecallCustomer = { id: string; name: string; email: string | null; phone: string | null; whatsapp: string | null };

export async function getRecallDetail(id: string) {
  const [row] = await db.select({ r: recalls, lotNo: stockLots.lotNo, productName: products.name }).from(recalls).innerJoin(stockLots, eq(stockLots.id, recalls.rootLotId)).innerJoin(products, eq(products.id, stockLots.productId)).where(eq(recalls.id, id)).limit(1);
  if (!row) return null;
  const items = await db
    .select({ item: recallItems, lotNo: stockLots.lotNo, productName: products.name })
    .from(recallItems)
    .innerJoin(stockLots, eq(stockLots.id, recallItems.lotId))
    .innerJoin(products, eq(products.id, stockLots.productId))
    .where(eq(recallItems.recallId, id))
    .orderBy(asc(recallItems.depth));
  let chain: Awaited<ReturnType<typeof getChain>> | null = null;
  try {
    chain = await getChain(db, 'recall', id);
  } catch {
    chain = null;
  }

  const impact = row.r.impact as { customers?: Array<{ id: string; name: string }> } | null;
  const customerRefs = impact?.customers ?? [];
  let customers: RecallCustomer[] = [];
  if (customerRefs.length) {
    const ids = customerRefs.map((c) => c.id);
    const { partnerContacts } = schema;
    const partnerRows = await db.select({ id: partners.id, name: partners.name, email: partners.email, phone: partners.phone, whatsapp: partners.whatsapp }).from(partners).where(inArray(partners.id, ids));
    const contactRows = await db.select({ partnerId: partnerContacts.partnerId, email: partnerContacts.email, phone: partnerContacts.phone, whatsapp: partnerContacts.whatsapp, isPrimary: partnerContacts.isPrimary }).from(partnerContacts).where(inArray(partnerContacts.partnerId, ids));
    customers = partnerRows.map((p) => {
      const primary = contactRows.filter((c) => c.partnerId === p.id).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0];
      return { id: p.id, name: p.name, email: primary?.email ?? p.email, phone: primary?.phone ?? p.phone, whatsapp: primary?.whatsapp ?? p.whatsapp };
    });
  }

  const draftMessage = impact ? buildDraftMessage(row.r.reason, impact as unknown as RecallImpact) : null;

  return { recall: { ...row.r, lotNo: row.lotNo, productName: row.productName }, items, chain, customers, draftMessage };
}

/** Ürün / kategori bazlı QC gerektiren ürünler — lot seçici için (izlenebilirlik "ürün ara" akışı) */
export async function listWarehousesForFilter() {
  return db.select({ id: warehouses.id, code: warehouses.code, name: warehouses.name }).from(warehouses).orderBy(asc(warehouses.code));
}
