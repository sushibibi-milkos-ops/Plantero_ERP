import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, ne, sql } from 'drizzle-orm';
import {
  type DbOrTx,
  salesOrders, salesOrderLines, salesChannels, partners, products, uoms,
  bankAccounts, productionLines, workOrders, warehouses, locations,
  reorderRules, stockLots, stockQuants, stockCounts, receipts, deliveries,
  purchaseOrders, reconciliationMatches,
  vatPeriods, cashflowLines, dunningActions,
  qcChecks, supplierScores, recalls,
  machines, maintenanceOrders, downtimes,
  opportunities, opportunityStages,
  auditLog, users, workOrderScraps, bankTransactions,
} from '@plantero/db';
import { D, ZERO, toDb, sum, type Decimal } from '../money.js';
import { businessDate, addDays } from '../dates.js';
import { getExpiryBuckets, type ExpiryBuckets } from '../stock/expiry.js';
import { findDueInvoices, type DueInvoiceRow } from '../finance/dunning.js';
import { getBreakEven, periodAtOffset, type BreakEvenResult, type Scenario } from '../finance/cashflow.js';
import { computeLineOeeForDay } from '../production/yield.js';

/**
 * Kokpit KPI motoru — docs/modules/kokpit.md. Rol bazlı ekranların TEK veri kaynağı: her fonksiyon
 * saf bir okuma sorgusudur (yazmaz, kendi transaction'ını açmaz — `tx` çağırandan gelir), sonucu
 * `numeric` alanlar için DB string'i (`toDb`) olarak döner. `kpis.test.ts` her fonksiyonu aynı
 * verinin ham SQL'iyle birebir karşılaştırır. Zaten var olan, test edilmiş core motorları TEKRAR
 * YAZILMAZ — sarmalanır: `getExpiryBuckets` (stok/skt), `findDueInvoices` (finans/hatırlatma),
 * `getBreakEven`+ay-içi gerçekleşen (finans/nakit akışı), `computeLineOeeForDay` (üretim/verim).
 */

/* ------------------------------------------------------------------ */
/* GM / Admin — günlük kanal satışları                                 */
/* ------------------------------------------------------------------ */

export type ChannelSalesRow = { channelId: string; code: string; name: string; gross: string; net: string; orderCount: number };
export type ChannelSalesDay = { date: string; rows: ChannelSalesRow[]; grossTotal: string; netTotal: string };
export type ChannelSalesToday = ChannelSalesDay & {
  yesterday: { grossTotal: string; netTotal: string };
  grossDeltaPct: number | null;
  netDeltaPct: number | null;
  /** Son 7 gün toplam net ciro serisi (sparkline) — en eski önce */
  trend7d: { date: string; net: string }[];
};

function deltaPct(current: Decimal, previous: Decimal): number | null {
  if (previous.isZero()) return current.isZero() ? 0 : null;
  return current.minus(previous).div(previous).mul(100).toNumber();
}

/** Bir günün kanal kırılımlı brüt/net cirosu — `salesOrders` (docType='order'), `/satis/net-ciro` ile aynı kaynak/tanım. */
async function channelSalesForDay(tx: DbOrTx, date: string): Promise<ChannelSalesDay> {
  const rows = await tx
    .select({
      channelId: salesChannels.id, code: salesChannels.code, name: salesChannels.name,
      gross: sql<string>`coalesce(sum(${salesOrders.grandTotal}::numeric * ${salesOrders.exchangeRate}::numeric), 0)`,
      net: sql<string>`coalesce(sum(${salesOrders.netRevenue}::numeric * ${salesOrders.exchangeRate}::numeric), 0)`,
      orderCount: sql<string>`count(*)`,
    })
    .from(salesChannels)
    .innerJoin(salesOrders, and(eq(salesOrders.channelId, salesChannels.id), eq(salesOrders.docType, 'order'), eq(salesOrders.orderDate, date)))
    .groupBy(salesChannels.id, salesChannels.code, salesChannels.name)
    .orderBy(desc(sql`sum(${salesOrders.netRevenue}::numeric)`));

  const out: ChannelSalesRow[] = rows.map((r) => ({ channelId: r.channelId, code: r.code, name: r.name, gross: toDb(D(r.gross)), net: toDb(D(r.net)), orderCount: Number(r.orderCount) }));
  return { date, rows: out, grossTotal: toDb(sum(out.map((r) => D(r.gross)))), netTotal: toDb(sum(out.map((r) => D(r.net)))) };
}

/** GM/admin: "günlük kanal satışları" kartı — bugün, dün karşılaştırması, 7 günlük net ciro trendi. */
export async function getChannelSalesToday(tx: DbOrTx, opts: { date?: string } = {}): Promise<ChannelSalesToday> {
  const date = opts.date ?? businessDate(new Date());
  const yesterday = addDays(date, -1);
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(date, i - 6));

  const [today, yday, ...trendDays] = await Promise.all([channelSalesForDay(tx, date), channelSalesForDay(tx, yesterday), ...last7.map((d) => channelSalesForDay(tx, d))]);

  return {
    ...today,
    yesterday: { grossTotal: yday.grossTotal, netTotal: yday.netTotal },
    grossDeltaPct: deltaPct(D(today.grossTotal), D(yday.grossTotal)),
    netDeltaPct: deltaPct(D(today.netTotal), D(yday.netTotal)),
    trend7d: trendDays.map((d) => ({ date: d.date, net: d.netTotal })),
  };
}

/* ------------------------------------------------------------------ */
/* GM / Admin / Muhasebe / Finans — banka toplamı                      */
/* ------------------------------------------------------------------ */

export type BankAccountCard = { id: string; code: string; bankName: string; currency: string; accountCode: string; statementBalance: string; statementBalanceAt: string | null };
export type BankSummary = { accounts: BankAccountCard[]; totalTry: string };

/** Banka hesap kartları + toplam — `bank_accounts.statement_balance` (son bilinen ekstre bakiyesi). */
export async function getBankSummary(tx: DbOrTx): Promise<BankSummary> {
  const rows = await tx.select().from(bankAccounts).where(eq(bankAccounts.isActive, true)).orderBy(asc(bankAccounts.code));
  const accounts: BankAccountCard[] = rows.map((r) => ({
    id: r.id, code: r.code, bankName: r.bankName, currency: r.currency, accountCode: r.accountCode,
    statementBalance: toDb(D(r.statementBalance)), statementBalanceAt: r.statementBalanceAt ? r.statementBalanceAt.toISOString() : null,
  }));
  // Yalnızca TRY hesaplar toplanır — dövizli hesabı TL'ye çevirmek için o anki kur gerekir, kokpit
  // kartı bunu kur tablosuna gitmeden yapmaz (yanlış/güncel-olmayan bir TL toplamı vermektense
  // dövizli hesapları toplam dışında bırakıp kendi kartlarında göstermek daha dürüst).
  const totalTry = sum(accounts.filter((a) => a.currency === 'TRY').map((a) => D(a.statementBalance)));
  return { accounts, totalTry: toDb(totalTry) };
}

/* ------------------------------------------------------------------ */
/* GM / Admin / Üretim şefi — hat durumu / açık iş emirleri             */
/* ------------------------------------------------------------------ */

const OPEN_WO_STATUSES = ['released', 'in_progress', 'paused'] as const;

export type LineWorkOrder = { id: string; docNo: string; status: string; productName: string; plannedQty: string; producedQty: string; uomCode: string; isLate: boolean };
export type LineStatus = { lineId: string; code: string; name: string; openCount: number; lateCount: number; current: LineWorkOrder | null };

/** Her aktif hat için açık iş emri sayısı + "şu an üzerinde çalışılan" iş emri (in_progress > paused > released, en yeni önce). */
export async function getLineStatuses(tx: DbOrTx): Promise<LineStatus[]> {
  const lines = await tx.select().from(productionLines).where(eq(productionLines.isActive, true)).orderBy(asc(productionLines.sortOrder), asc(productionLines.code));
  const now = new Date();

  const out: LineStatus[] = [];
  for (const line of lines) {
    const openRows = await tx
      .select({ wo: workOrders, productName: products.name, uomCode: uoms.code })
      .from(workOrders)
      .innerJoin(products, eq(products.id, workOrders.productId))
      .innerJoin(uoms, eq(uoms.id, workOrders.uomId))
      .where(and(eq(workOrders.lineId, line.id), inArray(workOrders.status, OPEN_WO_STATUSES)));

    const lateRows = openRows.filter((r) => r.wo.plannedEnd !== null && r.wo.plannedEnd < now);
    const rank: Record<string, number> = { in_progress: 0, paused: 1, released: 2 };
    const currentRow = [...openRows].sort((a, b) => (rank[a.wo.status] ?? 9) - (rank[b.wo.status] ?? 9) || (b.wo.startedAt?.getTime() ?? 0) - (a.wo.startedAt?.getTime() ?? 0))[0];

    out.push({
      lineId: line.id, code: line.code, name: line.name, openCount: openRows.length, lateCount: lateRows.length,
      current: currentRow
        ? {
            id: currentRow.wo.id, docNo: currentRow.wo.docNo, status: currentRow.wo.status, productName: currentRow.productName,
            plannedQty: currentRow.wo.plannedQty, producedQty: currentRow.wo.producedQty, uomCode: currentRow.uomCode,
            isLate: currentRow.wo.plannedEnd !== null && currentRow.wo.plannedEnd < now,
          }
        : null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* GM / Admin / Satın alma (kritik stok — reorder_rules kapsama < lead time) */
/* ------------------------------------------------------------------ */

export type CriticalStockItem = { productId: string; sku: string; name: string; warehouseCode: string; daysOfCover: string; leadTimeDays: number; suggestedQty: string };
export type CriticalStockSummary = { count: number; items: CriticalStockItem[] };

/** Kapsama (gün) < tedarik süresi (lead time) olan aktif kurallar — `/satin-alma/kritik-stok` ile aynı eşik. */
export async function getCriticalStockSummary(tx: DbOrTx): Promise<CriticalStockSummary> {
  const rows = await tx
    .select({ rule: reorderRules, sku: products.sku, name: products.name, warehouseCode: warehouses.code })
    .from(reorderRules)
    .innerJoin(products, eq(products.id, reorderRules.productId))
    .innerJoin(warehouses, eq(warehouses.id, reorderRules.warehouseId))
    .where(and(eq(reorderRules.isActive, true), isNotNull(reorderRules.lastDaysOfCover)));

  const critical = rows.filter((r) => D(r.rule.lastDaysOfCover).lt(r.rule.leadTimeDays));
  const sorted = [...critical].sort((a, b) => D(a.rule.lastDaysOfCover).minus(D(b.rule.lastDaysOfCover)).toNumber());
  return {
    count: critical.length,
    items: sorted.slice(0, 5).map((r) => ({
      productId: r.rule.productId, sku: r.sku, name: r.name, warehouseCode: r.warehouseCode,
      daysOfCover: toDb(D(r.rule.lastDaysOfCover)), leadTimeDays: r.rule.leadTimeDays, suggestedQty: toDb(D(r.rule.lastSuggestedQty ?? '0')),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* GM / Admin — SKT riski (30/60/90 kova)                               */
/* ------------------------------------------------------------------ */

export type ExpiryRiskSummary = { totals: ExpiryBuckets['totals']; top5: ExpiryBuckets['rows'] };

/** `getExpiryBuckets`'ı sarmalar — kokpit yalnızca kova toplamları + en yakın 5 lotu gösterir. */
export async function getExpiryRiskSummary(tx: DbOrTx): Promise<ExpiryRiskSummary> {
  const buckets = await getExpiryBuckets(tx);
  return { totals: buckets.totals, top5: buckets.rows.slice(0, 5) };
}

/* ------------------------------------------------------------------ */
/* GM / Admin / Muhasebe / Finans / Satış — geciken alacak (yaşlandırma) */
/* ------------------------------------------------------------------ */

export type AgingBuckets = { b0_30: string; b31_60: string; b61_90: string; b90plus: string; totalOverdue: string; invoiceCount: number };
export type OverdueReceivablesSummary = { aging: AgingBuckets; top5: DueInvoiceRow[] };

/** `findDueInvoices`'ı sarmalar — yaşlandırma kovaları + en büyük 5 vadesi geçmiş fatura. */
export async function getOverdueReceivablesSummary(tx: DbOrTx): Promise<OverdueReceivablesSummary> {
  const due = await findDueInvoices(tx);
  const buckets = { b0_30: ZERO, b31_60: ZERO, b61_90: ZERO, b90plus: ZERO };
  for (const r of due) {
    const amt = D(r.residual);
    if (r.daysOverdue <= 30) buckets.b0_30 = buckets.b0_30.plus(amt);
    else if (r.daysOverdue <= 60) buckets.b31_60 = buckets.b31_60.plus(amt);
    else if (r.daysOverdue <= 90) buckets.b61_90 = buckets.b61_90.plus(amt);
    else buckets.b90plus = buckets.b90plus.plus(amt);
  }
  const total = buckets.b0_30.plus(buckets.b31_60).plus(buckets.b61_90).plus(buckets.b90plus);
  const top5 = [...due].sort((a, b) => D(b.residual).minus(D(a.residual)).toNumber()).slice(0, 5);
  return {
    aging: { b0_30: toDb(buckets.b0_30), b31_60: toDb(buckets.b31_60), b61_90: toDb(buckets.b61_90), b90plus: toDb(buckets.b90plus), totalOverdue: toDb(total), invoiceCount: due.length },
    top5,
  };
}

/* ------------------------------------------------------------------ */
/* GM / Admin / Muhasebe / Finans — break-even'a uzaklık                */
/* ------------------------------------------------------------------ */

export type BreakEvenDistance = {
  period: string; scenario: Scenario; targetRevenue: string; actualNetRevenue: string; progressPct: string;
  daysElapsed: number; daysInMonth: number; daysRemaining: number; dailyPaceActual: string; dailyPaceNeeded: string;
};

/** `getBreakEven`'ı sarmalar — "bu ay gereken min ciro" vs gerçekleşen + günlük gereken tempo. */
export async function getBreakEvenDistance(tx: DbOrTx, opts: { period?: string; scenario?: Scenario } = {}): Promise<BreakEvenDistance> {
  const period = opts.period ?? businessDate(new Date()).slice(0, 7);
  const scenario = opts.scenario ?? 'base';
  const result: BreakEvenResult = await getBreakEven(tx, period, scenario);
  const mtd = result.monthToDate;
  return {
    period, scenario, targetRevenue: toDb(result.targetRevenue), actualNetRevenue: toDb(mtd.actualNetRevenue), progressPct: toDb(mtd.progressPct),
    daysElapsed: mtd.daysElapsed, daysInMonth: mtd.daysInMonth, daysRemaining: mtd.daysRemaining,
    dailyPaceActual: toDb(mtd.dailyPaceActual), dailyPaceNeeded: toDb(mtd.dailyPaceNeeded),
  };
}

/* ------------------------------------------------------------------ */
/* GM / Admin — onay bekleyenler sayaçları                              */
/* ------------------------------------------------------------------ */

export type PendingApprovalsSummary = { purchaseDrafts: number; reconciliation: number; countVariance: number; dunning: number; total: number };

/** Onay kuyruğu sayaçları — AI satın alma taslağı, mutabakat önerisi, sayım farkı, tahsilat hatırlatma onayı. */
export async function getPendingApprovalsSummary(tx: DbOrTx): Promise<PendingApprovalsSummary> {
  const [[po], [recon], [cnt], [dun]] = await Promise.all([
    tx.select({ n: sql<string>`count(*)` }).from(purchaseOrders).where(eq(purchaseOrders.status, 'ai_draft')),
    tx.select({ n: sql<string>`count(*)` }).from(reconciliationMatches).where(eq(reconciliationMatches.status, 'suggested')),
    tx.select({ n: sql<string>`count(*)` }).from(stockCounts).where(eq(stockCounts.status, 'review')),
    tx.select({ n: sql<string>`count(*)` }).from(dunningActions).where(eq(dunningActions.status, 'pending_approval')),
  ]);
  const purchaseDrafts = Number(po?.n ?? 0);
  const reconciliation = Number(recon?.n ?? 0);
  const countVariance = Number(cnt?.n ?? 0);
  const dunning = Number(dun?.n ?? 0);
  return { purchaseDrafts, reconciliation, countVariance, dunning, total: purchaseDrafts + reconciliation + countVariance + dunning };
}

/* ------------------------------------------------------------------ */
/* GM / Admin — son aktiviteler (audit)                                 */
/* ------------------------------------------------------------------ */

export type RecentActivityRow = { id: string; at: string; userName: string | null; action: string; tableName: string; summary: string | null };
export type ActivityGroup = RecentActivityRow & { count: number };

/** Denetim günlüğünün son N satırı — en yeni önce. */
export async function getRecentActivity(tx: DbOrTx, limit = 8): Promise<RecentActivityRow[]> {
  const rows = await tx
    .select({ id: auditLog.id, at: auditLog.at, userName: users.fullName, userEmail: auditLog.userEmail, action: auditLog.action, tableName: auditLog.tableName, summary: auditLog.summary })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .orderBy(desc(auditLog.at))
    .limit(limit);
  return rows.map((r) => ({ id: r.id, at: r.at.toISOString(), userName: r.userName ?? r.userEmail ?? null, action: r.action, tableName: r.tableName, summary: r.summary }));
}

/** Aynı (kullanıcı, özet) ile ardışık gelen audit satırlarını tek satıra katlar — ör. bir kullanıcının
 *  arka arkaya 8 "giriş yaptı" kaydı 8 özdeş satır yerine tek satır + tekrar sayısı olur (Tur 1 P2
 *  bulgusu kokpit-activity-dupe-01). `rows` en yeniden en eskiye sıralı gelir (bkz. `getRecentActivity`)
 *  — her grubun `at`'i grubun EN YENİ (ilk görülen) üyesinden gelir. `maxGroups`'a ulaşınca yeni grup
 *  açılmaz, ama halihazırdaki son grubu genişletmeye (tekrar sayısını artırmaya) devam eder — aksi halde
 *  tam sınırda kesilen bir grubun gerçek tekrar sayısı eksik görünürdü. */
export function groupConsecutiveActivity(rows: RecentActivityRow[], maxGroups = 8): ActivityGroup[] {
  const key = (r: RecentActivityRow) => `${r.userName ?? ''}::${r.summary ?? `${r.action}::${r.tableName}`}`;
  const groups: ActivityGroup[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && key(last) === key(r)) {
      last.count += 1;
      continue;
    }
    if (groups.length >= maxGroups) continue;
    groups.push({ ...r, count: 1 });
  }
  return groups;
}

/* ------------------------------------------------------------------ */
/* Depo                                                                 */
/* ------------------------------------------------------------------ */

export type QuarantineLotRow = {
  quantId: string; lotId: string; lotNo: string; productName: string; qty: string; uomCode: string; value: string; locationCode: string; expiryDate: string | null;
};
export type WarehouseCards = {
  receiptsPending: number; deliveriesPending: number; countsOpen: number;
  quarantine: { count: number; value: string; top5: QuarantineLotRow[] };
  expiry: ExpiryRiskSummary;
};

/** Depo rolü kart seti: mal kabul bekleyen, sevk bekleyen, açık sayım, karantina (toplam + en değerli 5 lot), SKT. */
export async function getWarehouseCards(tx: DbOrTx): Promise<WarehouseCards> {
  const [[receiptsRow], [deliveriesRow], [countsRow], quarantineRows, expiry] = await Promise.all([
    tx.select({ n: sql<string>`count(*)` }).from(receipts).where(inArray(receipts.status, ['draft', 'qc_pending'])),
    tx.select({ n: sql<string>`count(*)` }).from(deliveries).where(inArray(deliveries.status, ['draft', 'reserved', 'picking'])),
    tx.select({ n: sql<string>`count(*)` }).from(stockCounts).where(inArray(stockCounts.status, ['draft', 'counting', 'review'])),
    tx
      .select({
        quantId: stockQuants.id, lotId: stockLots.id, lotNo: stockLots.lotNo, productName: products.name,
        qty: stockQuants.qty, uomCode: uoms.code, unitCost: stockLots.unitCost, locationCode: locations.code, expiryDate: stockLots.expiryDate,
      })
      .from(stockQuants)
      .innerJoin(stockLots, eq(stockLots.id, stockQuants.lotId))
      .innerJoin(locations, eq(locations.id, stockQuants.locationId))
      .innerJoin(products, eq(products.id, stockQuants.productId))
      .innerJoin(uoms, eq(uoms.id, stockLots.uomId))
      .where(and(eq(locations.usage, 'quarantine'), gt(stockQuants.qty, '0'))),
    getExpiryRiskSummary(tx),
  ]);
  const withValue = quarantineRows.map((r) => ({ ...r, value: D(r.qty).mul(D(r.unitCost)) }));
  const quarantineValue = sum(withValue.map((r) => r.value));
  const top5 = [...withValue].sort((a, b) => b.value.minus(a.value).toNumber()).slice(0, 5);
  return {
    receiptsPending: Number(receiptsRow?.n ?? 0),
    deliveriesPending: Number(deliveriesRow?.n ?? 0),
    countsOpen: Number(countsRow?.n ?? 0),
    quarantine: {
      count: quarantineRows.length, value: toDb(quarantineValue),
      top5: top5.map((r) => ({ quantId: r.quantId, lotId: r.lotId, lotNo: r.lotNo, productName: r.productName, qty: toDb(D(r.qty)), uomCode: r.uomCode, value: toDb(r.value), locationCode: r.locationCode, expiryDate: r.expiryDate })),
    },
    expiry,
  };
}

/* ------------------------------------------------------------------ */
/* Üretim şefi                                                          */
/* ------------------------------------------------------------------ */

export type RecentWorkOrderRow = {
  id: string; docNo: string; status: string; lineName: string; productName: string; plannedQty: string; producedQty: string; uomCode: string; isLate: boolean; finishedAt: string | null;
};
export type ScrapReasonRow = { reason: string; qty: string; value: string; entryCount: number };
export type RecentDowntimeRow = { id: string; lineName: string; reason: string; isPlanned: boolean; startedAt: string; minutes: number; ongoing: boolean };

export type ProductionChiefCards = {
  lines: LineStatus[];
  openWorkOrders: number;
  lateWorkOrders: number;
  todayOeePct: string | null;
  scrapRatePct7d: string;
  /** Son iş emirleri (durum fark etmeksizin, en yeni önce) — boş bir "Hat durumu" kartının
   *  ardından panonun tamamen ölü kalmaması için (Tur 1 P1 kokpit-uretim-density-01). */
  recentWorkOrders: RecentWorkOrderRow[];
  /** Son 7 gün fire kırılımı, sebebe göre (en yüksek değer önce). */
  scrapBreakdown7d: ScrapReasonRow[];
  /** Son duruşlar (hat bazlı, en yeni önce) — "Hat durumu" yalnızca ŞU ANKİ iş emrini gösterir, bugünkü
   *  duruş geçmişi ayrı bir sinyal (Tur 1 P1 kokpit-uretim-density-01). */
  recentDowntimes: RecentDowntimeRow[];
};

/** Üretim şefi kart seti: hat durumu, açık/geciken iş emri, bugünkü ortalama OEE, son 7 gün fire oranı + kırılımı, son iş emirleri. */
export async function getProductionChiefCards(tx: DbOrTx): Promise<ProductionChiefCards> {
  const today = businessDate(new Date());
  const lines = await getLineStatuses(tx);
  const openWorkOrders = sum(lines.map((l) => D(l.openCount))).toNumber();
  const lateWorkOrders = sum(lines.map((l) => D(l.lateCount))).toNumber();

  const oeeByLine = await Promise.all(lines.map((l) => computeLineOeeForDay(tx, l.lineId, today)));
  const activeOee = oeeByLine.filter((o) => o.plannedMinutes > 0);
  const todayOeePct = activeOee.length ? toDb(sum(activeOee.map((o) => o.oeePct)).div(activeOee.length)) : null;

  // Fire oranı (son 7 gün): Σ fire değeri / Σ (fire + üretim çıktısı) değeri — iş emri maliyet alanlarından.
  const from = addDays(today, -6);
  const fromTs = new Date(`${from}T00:00:00.000Z`);
  const [rateRows, recentRows, scrapRows, downtimeRows] = await Promise.all([
    tx
      .select({ producedQty: workOrders.producedQty, scrapQty: workOrders.scrapQty })
      .from(workOrders)
      .where(and(isNotNull(workOrders.finishedAt), gte(workOrders.finishedAt, fromTs))),
    tx
      .select({ wo: workOrders, lineName: productionLines.name, productName: products.name, uomCode: uoms.code })
      .from(workOrders)
      .innerJoin(productionLines, eq(productionLines.id, workOrders.lineId))
      .innerJoin(products, eq(products.id, workOrders.productId))
      .innerJoin(uoms, eq(uoms.id, workOrders.uomId))
      .orderBy(desc(sql`coalesce(${workOrders.startedAt}, ${workOrders.plannedStart})`))
      .limit(10),
    tx
      .select({ reason: workOrderScraps.reason, qty: workOrderScraps.qty, value: workOrderScraps.value })
      .from(workOrderScraps)
      .where(gte(workOrderScraps.recordedAt, fromTs)),
    tx
      .select({ id: downtimes.id, lineName: productionLines.name, reason: downtimes.reason, isPlanned: downtimes.isPlanned, startedAt: downtimes.startedAt, endedAt: downtimes.endedAt, minutes: downtimes.minutes })
      .from(downtimes)
      .innerJoin(productionLines, eq(productionLines.id, downtimes.lineId))
      .orderBy(desc(downtimes.startedAt))
      .limit(8),
  ]);
  const produced = sum(rateRows.map((r) => D(r.producedQty)));
  const scrap = sum(rateRows.map((r) => D(r.scrapQty)));
  const scrapRatePct7d = produced.plus(scrap).isZero() ? '0.0000' : toDb(scrap.div(produced.plus(scrap)).mul(100));

  const now = new Date();
  const recentWorkOrders: RecentWorkOrderRow[] = recentRows.map((r) => ({
    id: r.wo.id, docNo: r.wo.docNo, status: r.wo.status, lineName: r.lineName, productName: r.productName,
    plannedQty: toDb(D(r.wo.plannedQty)), producedQty: toDb(D(r.wo.producedQty)), uomCode: r.uomCode,
    isLate: r.wo.plannedEnd !== null && r.wo.plannedEnd < now && !r.wo.finishedAt,
    finishedAt: r.wo.finishedAt ? r.wo.finishedAt.toISOString() : null,
  }));

  const byReason = new Map<string, { qty: Decimal; value: Decimal; entryCount: number }>();
  for (const r of scrapRows) {
    const cur = byReason.get(r.reason) ?? { qty: ZERO, value: ZERO, entryCount: 0 };
    byReason.set(r.reason, { qty: cur.qty.plus(D(r.qty)), value: cur.value.plus(D(r.value)), entryCount: cur.entryCount + 1 });
  }
  const scrapBreakdown7d: ScrapReasonRow[] = [...byReason.entries()]
    .map(([reason, v]) => ({ reason, qty: toDb(v.qty), value: toDb(v.value), entryCount: v.entryCount }))
    .sort((a, b) => D(b.value).minus(D(a.value)).toNumber());

  const recentDowntimes: RecentDowntimeRow[] = downtimeRows.map((d) => ({
    id: d.id, lineName: d.lineName, reason: d.reason, isPlanned: d.isPlanned, startedAt: d.startedAt.toISOString(),
    minutes: d.endedAt ? Math.round((d.endedAt.getTime() - d.startedAt.getTime()) / 60000) : d.minutes,
    ongoing: !d.endedAt,
  }));

  return { lines, openWorkOrders, lateWorkOrders, todayOeePct, scrapRatePct7d, recentWorkOrders, scrapBreakdown7d, recentDowntimes };
}

/* ------------------------------------------------------------------ */
/* Muhasebe / Finans                                                    */
/* ------------------------------------------------------------------ */

export type VatPosition = { period: string; outputVat: string; inputVat: string; payable: string; carriedToNext: string } | null;
export type CashProjectionMonth = { period: string; netCashflow: string; closingCash: string; actualNetCashflow: string | null };

export type ReconciliationQueueItem = {
  id: string; txDate: string; description: string; counterpartyName: string | null; partnerName: string | null; amount: string; confidence: string;
};

export type FinanceCards = {
  bank: BankSummary;
  reconciliationQueue: number;
  reconciliationQueueItems: ReconciliationQueueItem[];
  overdue: OverdueReceivablesSummary;
  vat: VatPosition;
  cashProjection3m: CashProjectionMonth[];
  breakEven: BreakEvenDistance;
};

/** Muhasebe/Finans kart seti — banka, mutabakat kuyruğu (sayaç + bekleyen öneri listesi), vadesi geçen, KDV pozisyonu, 3 aylık nakit projeksiyonu, break-even. */
export async function getFinanceCards(tx: DbOrTx): Promise<FinanceCards> {
  const currentPeriod = businessDate(new Date()).slice(0, 7);
  const periods = [currentPeriod, periodAtOffset(currentPeriod, 1), periodAtOffset(currentPeriod, 2)];

  const [bank, [reconRow], reconItemRows, overdue, [vat], cashRows, breakEven] = await Promise.all([
    getBankSummary(tx),
    tx.select({ n: sql<string>`count(*)` }).from(reconciliationMatches).where(eq(reconciliationMatches.status, 'suggested')),
    tx
      .select({
        id: reconciliationMatches.id, txDate: bankTransactions.txDate, description: bankTransactions.description,
        counterpartyName: bankTransactions.counterpartyName, partnerName: partners.name, amount: bankTransactions.amount, confidence: reconciliationMatches.confidence,
      })
      .from(reconciliationMatches)
      .innerJoin(bankTransactions, eq(bankTransactions.id, reconciliationMatches.bankTransactionId))
      .leftJoin(partners, eq(partners.id, reconciliationMatches.partnerId))
      .where(eq(reconciliationMatches.status, 'suggested'))
      .orderBy(desc(bankTransactions.txDate))
      .limit(8),
    getOverdueReceivablesSummary(tx),
    tx.select().from(vatPeriods).orderBy(desc(vatPeriods.period)).limit(1),
    tx.select().from(cashflowLines).where(and(eq(cashflowLines.scenario, 'base'), inArray(cashflowLines.period, periods))).orderBy(asc(cashflowLines.period)),
    getBreakEvenDistance(tx, { period: currentPeriod }),
  ]);

  const cashByPeriod = new Map(cashRows.map((r) => [r.period, r]));
  const cashProjection3m: CashProjectionMonth[] = periods.map((p) => {
    const r = cashByPeriod.get(p);
    return { period: p, netCashflow: toDb(D(r?.netCashflow ?? '0')), closingCash: toDb(D(r?.closingCash ?? '0')), actualNetCashflow: r?.actualNetCashflow ?? null };
  });

  return {
    bank, reconciliationQueue: Number(reconRow?.n ?? 0),
    reconciliationQueueItems: reconItemRows.map((r) => ({
      id: r.id, txDate: r.txDate, description: r.description, counterpartyName: r.counterpartyName, partnerName: r.partnerName,
      amount: toDb(D(r.amount)), confidence: toDb(D(r.confidence)),
    })),
    overdue,
    vat: vat ? { period: vat.period, outputVat: toDb(D(vat.outputVat)), inputVat: toDb(D(vat.inputVat)), payable: toDb(D(vat.payable)), carriedToNext: toDb(D(vat.carriedToNext)) } : null,
    cashProjection3m, breakEven,
  };
}

/* ------------------------------------------------------------------ */
/* Satış                                                                */
/* ------------------------------------------------------------------ */

export type FunnelStageRow = { stageCode: string; stageName: string; count: number; amount: string };
export type TopProductRow = { productId: string; sku: string; name: string; qty: string; uomCode: string; revenue: string };
export type RecentOrderRow = { id: string; docNo: string; status: string; partnerName: string; channelName: string; netRevenue: string; orderDate: string };

export type SalesCards = {
  funnel: FunnelStageRow[];
  todayOrders: number;
  channelToday: ChannelSalesToday;
  top5Products: TopProductRow[];
  /** Son siparişler (bugün dahil son 14 gün, en yeni önce) — panonun tek başına huni+kanal
   *  çubuğuna sıkışıp ilk ekranın üçte birini boş bırakmasını önleyen gerçek belge listesi
   *  (Tur 1 P1 kokpit-satis-density-01). */
  recentOrders: RecentOrderRow[];
};

/** Satış kart seti: huni (açık fırsatlar), bugünkü sipariş sayısı, kanal ciro (bugün), son siparişler, son 30 gün en çok satan 5 ürün. */
export async function getSalesCards(tx: DbOrTx): Promise<SalesCards> {
  const today = businessDate(new Date());
  const from30 = addDays(today, -29);
  const from14 = addDays(today, -13);

  const [funnelRows, [ordersRow], channelToday, topRows, recentRows] = await Promise.all([
    tx
      .select({ stageCode: opportunityStages.code, stageName: opportunityStages.name, count: sql<string>`count(${opportunities.id})`, amount: sql<string>`coalesce(sum(${opportunities.expectedAmount}), 0)` })
      .from(opportunityStages)
      .leftJoin(opportunities, and(eq(opportunities.stageId, opportunityStages.id), eq(opportunityStages.isWon, false), eq(opportunityStages.isLost, false)))
      .groupBy(opportunityStages.id, opportunityStages.code, opportunityStages.name, opportunityStages.sortOrder)
      .orderBy(asc(opportunityStages.sortOrder)),
    tx.select({ n: sql<string>`count(*)` }).from(salesOrders).where(and(eq(salesOrders.docType, 'order'), eq(salesOrders.orderDate, today))),
    getChannelSalesToday(tx, { date: today }),
    tx
      .select({
        productId: products.id, sku: products.sku, name: products.name, uomCode: uoms.code,
        qty: sql<string>`coalesce(sum(${salesOrderLines.qty}), 0)`, revenue: sql<string>`coalesce(sum(${salesOrderLines.lineTotal}), 0)`,
      })
      .from(salesOrderLines)
      .innerJoin(salesOrders, eq(salesOrders.id, salesOrderLines.orderId))
      .innerJoin(products, eq(products.id, salesOrderLines.productId))
      .innerJoin(uoms, eq(uoms.id, products.uomId))
      .where(and(eq(salesOrders.docType, 'order'), gte(salesOrders.orderDate, from30), lte(salesOrders.orderDate, today)))
      .groupBy(products.id, products.sku, products.name, uoms.code)
      .orderBy(desc(sql`sum(${salesOrderLines.lineTotal})`))
      .limit(5),
    tx
      .select({ id: salesOrders.id, docNo: salesOrders.docNo, status: salesOrders.status, partnerName: partners.name, channelName: salesChannels.name, netRevenue: salesOrders.netRevenue, orderDate: salesOrders.orderDate })
      .from(salesOrders)
      .innerJoin(partners, eq(partners.id, salesOrders.partnerId))
      .innerJoin(salesChannels, eq(salesChannels.id, salesOrders.channelId))
      .where(and(eq(salesOrders.docType, 'order'), gte(salesOrders.orderDate, from14), lte(salesOrders.orderDate, today)))
      .orderBy(desc(salesOrders.orderDate), desc(salesOrders.createdAt))
      .limit(10),
  ]);

  return {
    funnel: funnelRows.map((r) => ({ stageCode: r.stageCode, stageName: r.stageName, count: Number(r.count), amount: toDb(D(r.amount)) })),
    todayOrders: Number(ordersRow?.n ?? 0),
    channelToday,
    top5Products: topRows.map((r) => ({ productId: r.productId, sku: r.sku, name: r.name, qty: toDb(D(r.qty)), uomCode: r.uomCode, revenue: toDb(D(r.revenue)) })),
    recentOrders: recentRows.map((r) => ({ id: r.id, docNo: r.docNo, status: r.status, partnerName: r.partnerName, channelName: r.channelName, netRevenue: toDb(D(r.netRevenue)), orderDate: r.orderDate })),
  };
}

/* ------------------------------------------------------------------ */
/* Kalite                                                               */
/* ------------------------------------------------------------------ */

export type SupplierScoreDrop = { partnerId: string; partnerName: string; period: string; score: string; previousScore: string; deltaPts: string };
export type QualityCards = { pendingQc: number; rejectRatePct30d: string; supplierScoreDrops: SupplierScoreDrop[]; recallsOpen: number };

/** Kalite kart seti: bekleyen QC, son 30 gün red oranı, düşen tedarikçi skorları, açık geri çağırma. */
export async function getQualityCards(tx: DbOrTx): Promise<QualityCards> {
  const today = businessDate(new Date());
  const from30 = new Date(`${addDays(today, -29)}T00:00:00.000Z`);
  const currentPeriod = today.slice(0, 7);
  const previousPeriod = periodAtOffset(currentPeriod, -1);

  const [[pendingRow], checked30, [recallRow], curScores, prevScores, partnerRows] = await Promise.all([
    tx.select({ n: sql<string>`count(*)` }).from(qcChecks).where(eq(qcChecks.result, 'pending')),
    tx.select({ result: qcChecks.result }).from(qcChecks).where(and(isNotNull(qcChecks.checkedAt), gte(qcChecks.checkedAt, from30), ne(qcChecks.result, 'pending'))),
    tx.select({ n: sql<string>`count(*)` }).from(recalls).where(inArray(recalls.status, ['open', 'in_progress'])),
    tx.select().from(supplierScores).where(eq(supplierScores.period, currentPeriod)),
    tx.select().from(supplierScores).where(eq(supplierScores.period, previousPeriod)),
    tx.select({ id: partners.id, name: partners.name }).from(partners).where(eq(partners.kind, 'supplier')),
  ]);

  const rejectRatePct30d = checked30.length === 0 ? '0.0000' : toDb(D(checked30.filter((r) => r.result === 'failed').length).div(checked30.length).mul(100));

  const partnerName = new Map(partnerRows.map((p) => [p.id, p.name]));
  const prevByPartner = new Map(prevScores.map((s) => [s.partnerId, s.score]));
  const drops: SupplierScoreDrop[] = curScores
    .filter((s) => prevByPartner.has(s.partnerId) && D(s.score).lt(D(prevByPartner.get(s.partnerId)!)))
    .map((s) => ({
      partnerId: s.partnerId, partnerName: partnerName.get(s.partnerId) ?? '—', period: s.period,
      score: toDb(D(s.score)), previousScore: toDb(D(prevByPartner.get(s.partnerId)!)),
      deltaPts: toDb(D(s.score).minus(D(prevByPartner.get(s.partnerId)!))),
    }))
    .sort((a, b) => D(a.deltaPts).minus(D(b.deltaPts)).toNumber())
    .slice(0, 5);

  return { pendingQc: Number(pendingRow?.n ?? 0), rejectRatePct30d, supplierScoreDrops: drops, recallsOpen: Number(recallRow?.n ?? 0) };
}

/* ------------------------------------------------------------------ */
/* Bakım                                                                */
/* ------------------------------------------------------------------ */

export type DownMachine = { id: string; code: string; name: string; downSinceMinutes: number | null };
export type MaintenanceCards = { downMachines: DownMachine[]; todayMaintenanceCount: number; todayOeePct: string | null };

/** Bakım kart seti: durmuş makineler (+kaç dakikadır), bugünkü bakım iş emri sayısı, bugünkü ortalama OEE. */
export async function getMaintenanceCards(tx: DbOrTx): Promise<MaintenanceCards> {
  const today = businessDate(new Date());
  const now = new Date();

  const [downRows, [todayRow], lines] = await Promise.all([
    tx.select({ id: machines.id, code: machines.code, name: machines.name }).from(machines).where(eq(machines.status, 'down')),
    tx
      .select({ n: sql<string>`count(*)` })
      .from(maintenanceOrders)
      .where(and(inArray(maintenanceOrders.status, ['reported', 'planned', 'in_progress', 'waiting_parts']), eq(maintenanceOrders.scheduledFor, today))),
    tx.select().from(productionLines).where(eq(productionLines.isActive, true)),
  ]);

  const downMachines: DownMachine[] = [];
  for (const m of downRows) {
    const [openDowntime] = await tx
      .select({ startedAt: downtimes.startedAt })
      .from(downtimes)
      .where(and(eq(downtimes.machineId, m.id), isNull(downtimes.endedAt)))
      .orderBy(desc(downtimes.startedAt))
      .limit(1);
    downMachines.push({ id: m.id, code: m.code, name: m.name, downSinceMinutes: openDowntime ? Math.round((now.getTime() - openDowntime.startedAt.getTime()) / 60_000) : null });
  }

  const oeeByLine = await Promise.all(lines.map((l) => computeLineOeeForDay(tx, l.id, today)));
  const activeOee = oeeByLine.filter((o) => o.plannedMinutes > 0);
  const todayOeePct = activeOee.length ? toDb(sum(activeOee.map((o) => o.oeePct)).div(activeOee.length)) : null;

  return { downMachines, todayMaintenanceCount: Number(todayRow?.n ?? 0), todayOeePct };
}

/* ------------------------------------------------------------------ */
/* Rol panosu birleştiricileri — sayfa tek bir `Promise.all` yerine tek çağrı yapar,                */
/* her alt fonksiyon yine tek başına test edilebilir kalır (yukarıdaki tanımlar).                    */
/* ------------------------------------------------------------------ */

export type GmDashboard = {
  channelSales: ChannelSalesToday;
  bank: BankSummary;
  lines: LineStatus[];
  criticalStock: CriticalStockSummary;
  expiry: ExpiryRiskSummary;
  overdue: OverdueReceivablesSummary;
  breakEven: BreakEvenDistance;
  approvals: PendingApprovalsSummary;
  activity: RecentActivityRow[];
};

/** Genel Müdür / Admin panosu — modül sözleşmesindeki tüm GM kartları tek çağrıda. */
export async function getGmDashboard(tx: DbOrTx): Promise<GmDashboard> {
  const [channelSales, bank, lines, criticalStock, expiry, overdue, breakEven, approvals, activity] = await Promise.all([
    getChannelSalesToday(tx), getBankSummary(tx), getLineStatuses(tx), getCriticalStockSummary(tx),
    getExpiryRiskSummary(tx), getOverdueReceivablesSummary(tx), getBreakEvenDistance(tx), getPendingApprovalsSummary(tx),
    // 30 ham satır çekilir (varsayılan 8 değil) — `groupConsecutiveActivity` ardışık tekrarları
    // katladığı için ekranda YİNE en fazla 8 grup görünür, ama art arda aynı kullanıcı/özet gelen
    // uzun bir seri (ör. 8 ardışık "giriş yaptı") tek bir gruba düşüp geri kalan ham veriyi
    // tüketmesin diye ham havuz geniş tutulur (Tur 1 P2 kokpit-activity-dupe-01).
    getRecentActivity(tx, 30),
  ]);
  return { channelSales, bank, lines, criticalStock, expiry, overdue, breakEven, approvals, activity };
}

