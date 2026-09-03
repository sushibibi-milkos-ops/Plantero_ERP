import 'server-only';
import { and, asc, desc, eq, inArray, gte, lte, isNull, isNotNull } from 'drizzle-orm';
import { db, schema } from '@plantero/db';
import { D, round2, toDb, sum, getChain, computeLineOeeForDay } from '@plantero/core';
import { businessDate, addDays } from '@plantero/core/dates';

const {
  workOrders, workOrderMaterials, workOrderConsumptions, workOrderOutputs, workOrderScraps, workOrderEvents,
  products, uoms, boms, productionLines, warehouses, locations, stockLots, users, roles, userRoles, downtimes,
} = schema;

/* ==================================================================== */
/* Ortak arama listeleri (form combobox'ları)                           */
/* ==================================================================== */

export async function listProductionLines() {
  return db.select().from(productionLines).where(eq(productionLines.isActive, true)).orderBy(asc(productionLines.sortOrder), asc(productionLines.code));
}

export type ManufacturableProductRow = { id: string; sku: string; name: string; uomId: string; uomCode: string; activeBomId: string | null; activeBomCode: string | null; defaultLineId: string | null };

/** Aktif reçetesi olan üretilebilir ürünler — "Yeni iş emri" ürün seçimi */
export async function listManufacturableProducts(): Promise<ManufacturableProductRow[]> {
  const rows = await db
    .select({ p: products, uomCode: uoms.code, bom: boms })
    .from(products)
    .innerJoin(uoms, eq(uoms.id, products.uomId))
    .innerJoin(boms, and(eq(boms.productId, products.id), eq(boms.status, 'active')))
    .where(and(eq(products.isManufactured, true), eq(products.status, 'active')))
    .orderBy(asc(products.name));
  // Aynı üründe birden fazla aktif versiyon olmaz (activateBom garantisi) — yine de en yüksek versiyonu tut
  const byProduct = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const cur = byProduct.get(r.p.id);
    if (!cur || r.bom.version > cur.bom.version) byProduct.set(r.p.id, r);
  }
  return Array.from(byProduct.values()).map((r) => ({ id: r.p.id, sku: r.p.sku, name: r.p.name, uomId: r.p.uomId, uomCode: r.uomCode, activeBomId: r.bom.id, activeBomCode: r.bom.code, defaultLineId: r.bom.defaultLineId }));
}

export async function listWarehousesForProduction() {
  return db.select().from(warehouses).where(and(eq(warehouses.isActive, true), eq(warehouses.isProduction, true))).orderBy(asc(warehouses.code));
}

/* ==================================================================== */
/* /uretim/is-emirleri                                                  */
/* ==================================================================== */

export type WorkOrderRow = {
  id: string; docNo: string; status: string; productId: string; sku: string; productName: string; uomCode: string;
  lineId: string; lineCode: string; lineName: string; warehouseCode: string;
  plannedQty: string; producedQty: string; scrapQty: string; yieldPct: string | null;
  plannedStart: Date | null; operatorName: string | null; unitCost: string; totalCost: string; priority: number;
};

export async function listWorkOrders(): Promise<WorkOrderRow[]> {
  const rows = await db
    .select({
      wo: workOrders, sku: products.sku, productName: products.name, uomCode: uoms.code,
      lineCode: productionLines.code, lineName: productionLines.name, warehouseCode: warehouses.code, operatorName: users.fullName,
    })
    .from(workOrders)
    .innerJoin(products, eq(products.id, workOrders.productId))
    .innerJoin(uoms, eq(uoms.id, workOrders.uomId))
    .innerJoin(productionLines, eq(productionLines.id, workOrders.lineId))
    .innerJoin(warehouses, eq(warehouses.id, workOrders.warehouseId))
    .leftJoin(users, eq(users.id, workOrders.operatorId))
    .orderBy(desc(workOrders.priority), desc(workOrders.plannedStart));
  return rows.map((r) => ({
    id: r.wo.id, docNo: r.wo.docNo, status: r.wo.status, productId: r.wo.productId, sku: r.sku, productName: r.productName, uomCode: r.uomCode,
    lineId: r.wo.lineId, lineCode: r.lineCode, lineName: r.lineName, warehouseCode: r.warehouseCode,
    plannedQty: r.wo.plannedQty, producedQty: r.wo.producedQty, scrapQty: r.wo.scrapQty, yieldPct: r.wo.yieldPct,
    plannedStart: r.wo.plannedStart, operatorName: r.operatorName, unitCost: r.wo.unitCost, totalCost: r.wo.totalCost, priority: r.wo.priority,
  }));
}

export type WorkOrderKpis = {
  openCount: number; openCountDelta: number | null; overdueCount: number;
  inProgressCount: number; inProgressCountDelta: number | null; runningLines: number; totalLines: number;
  plannedValue: string; plannedValueDelta: number | null;
  producedValueToday: string;
  avgYieldPct: string; avgYieldPctDelta: number | null;
};

/** Yüzde değişim (delta rozeti için) — pay/payda `sum`den gelen Decimal olabileceğinden `D()` ile sarılır. */
function pctChange(curr: unknown, prev: unknown): number | null {
  const c = D(curr as never);
  const p = D(prev as never);
  if (p.eq(0)) return null;
  return round2(c.minus(p).div(p).mul(100)).toNumber();
}

export async function getWorkOrderKpis(): Promise<WorkOrderKpis> {
  const rows = await db.select().from(workOrders);
  const open = rows.filter((r) => !['closed', 'cancelled'].includes(r.status));
  const inProgress = rows.filter((r) => r.status === 'in_progress');
  const todayIso = businessDate(new Date());
  const today = new Date().toISOString().slice(0, 10);
  const finishedToday = rows.filter((r) => r.finishedAt && r.finishedAt.toISOString().slice(0, 10) === today);
  const withYield = rows.filter((r) => r.yieldPct !== null && D(r.yieldPct).gt(0));
  const avgYield = withYield.length ? sum(withYield.map((r) => r.yieldPct)).div(withYield.length) : D(0);

  // Gecikmiş: açık iş emri, planlanan başlangıcı bugünden önce. "Üretimde" hangi hatlarda: kaç
  // hattın şu an çalıştığı — bu ikisi eskiden birbirini tekrar eden dolgu ipuçlarıyla ("Açık iş emri
  // 4 / 1 üretimde" ↔ "Üretimde 1 / 4 açık iş emri") gösteriliyordu, sıfır yeni bilgi (Tur 3
  // bulgusu, P1) — burada her kart kendi gerçek ikincil ölçüsünü taşır.
  const overdueCount = open.filter((r) => r.plannedStart && businessDate(r.plannedStart) < todayIso).length;
  const totalLines = (await db.select({ id: productionLines.id }).from(productionLines).where(eq(productionLines.isActive, true))).length;
  const runningLines = new Set(inProgress.map((r) => r.lineId)).size;

  // "Geçen döneme göre" delta'lar: kalıcı bir KPI geçmişi tablosu yok (şema dondurulmuş — bkz. rapor,
  // şema talepleri). Mevcut zaman damgalarından (createdAt/startedAt/finishedAt/closedAt) geriye dönük
  // yaklaşık yeniden inşa yapılır; iptal anı ayrı sütunda tutulmadığından şu an `cancelled` olan iş
  // emirleri geçmişte hiç "açık" sayılmaz (muhafazakâr yaklaşım) — kesin muhasebe değil, yönelim rozeti.
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const openAsOfWeekAgo = rows.filter((r) => r.status !== 'cancelled' && r.createdAt <= weekAgo && (!r.closedAt || r.closedAt > weekAgo));
  const inProgressAsOfWeekAgo = rows.filter((r) => ['in_progress', 'paused'].includes(r.status) && r.startedAt && r.startedAt <= weekAgo && (!r.finishedAt || r.finishedAt > weekAgo));

  // Verim: gerçek dönem karşılaştırması (son 30 gün bitenler vs önceki 30 gün) — finishedAt zaten
  // güvenilir bir zaman damgası olduğundan yaklaşım gerekmez.
  const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const prevPeriodStart = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const finishedThisPeriod = rows.filter((r) => r.finishedAt && r.finishedAt >= periodStart && r.yieldPct !== null && D(r.yieldPct).gt(0));
  const finishedPrevPeriod = rows.filter((r) => r.finishedAt && r.finishedAt >= prevPeriodStart && r.finishedAt < periodStart && r.yieldPct !== null && D(r.yieldPct).gt(0));
  const avgYieldThisPeriod = finishedThisPeriod.length ? sum(finishedThisPeriod.map((r) => r.yieldPct)).div(finishedThisPeriod.length) : null;
  const avgYieldPrevPeriod = finishedPrevPeriod.length ? sum(finishedPrevPeriod.map((r) => r.yieldPct)).div(finishedPrevPeriod.length) : null;

  return {
    openCount: open.length,
    openCountDelta: pctChange(open.length, openAsOfWeekAgo.length),
    overdueCount,
    inProgressCount: inProgress.length,
    inProgressCountDelta: pctChange(inProgress.length, inProgressAsOfWeekAgo.length),
    runningLines, totalLines,
    plannedValue: toDb(sum(open.map((r) => r.totalCost))),
    plannedValueDelta: pctChange(sum(open.map((r) => r.totalCost)), sum(openAsOfWeekAgo.map((r) => r.totalCost))),
    producedValueToday: toDb(sum(finishedToday.map((r) => r.totalCost))),
    avgYieldPct: toDb(avgYield),
    avgYieldPctDelta: avgYieldThisPeriod !== null && avgYieldPrevPeriod !== null ? pctChange(avgYieldThisPeriod, avgYieldPrevPeriod) : null,
  };
}

/* ==================================================================== */
/* /uretim/is-emirleri/[id]                                             */
/* ==================================================================== */

export async function getWorkOrderDetail(id: string) {
  // Kök neden (Tur 4 P1): yedi bağımsız sorgu (ana satır + 5 alt tablo + belge zinciri) sırayla
  // `await`lenip her biri ayrı bir round-trip bekliyordu — /uretim/is-emirleri/[id] için toplam
  // gecikme networkidle sonrası 1140ms'e çıkıyor, `loading.tsx` iskeleti o süre boyunca ekranda
  // kalıyordu. Hiçbiri diğerinin sonucuna bağlı değil (hepsi yalnızca `id` ile filtrelenir) —
  // `Promise.all` ile paralel çalıştırılır, ana satır bulunamazsa (`row` boş) alt sorguların
  // sonucu görmezden gelinip `null` dönülür.
  const [rowResult, materials, consumptions, outputs, scraps, events, chain] = await Promise.all([
    db
      .select({ wo: workOrders, product: products, uomCode: uoms.code, bom: boms, line: productionLines, warehouse: warehouses, operatorName: users.fullName })
      .from(workOrders)
      .innerJoin(products, eq(products.id, workOrders.productId))
      .innerJoin(uoms, eq(uoms.id, workOrders.uomId))
      .innerJoin(boms, eq(boms.id, workOrders.bomId))
      .innerJoin(productionLines, eq(productionLines.id, workOrders.lineId))
      .innerJoin(warehouses, eq(warehouses.id, workOrders.warehouseId))
      .leftJoin(users, eq(users.id, workOrders.operatorId))
      .where(eq(workOrders.id, id))
      .limit(1),
    db
      .select({ m: workOrderMaterials, sku: products.sku, productName: products.name, uomCode: uoms.code })
      .from(workOrderMaterials)
      .innerJoin(products, eq(products.id, workOrderMaterials.productId))
      .innerJoin(uoms, eq(uoms.id, workOrderMaterials.uomId))
      .where(eq(workOrderMaterials.workOrderId, id))
      .orderBy(asc(workOrderMaterials.sequence)),
    db
      .select({ c: workOrderConsumptions, sku: products.sku, productName: products.name, uomCode: uoms.code, lotNo: stockLots.lotNo, locationCode: locations.code, scannedByName: users.fullName })
      .from(workOrderConsumptions)
      .innerJoin(products, eq(products.id, workOrderConsumptions.productId))
      .innerJoin(uoms, eq(uoms.id, workOrderConsumptions.uomId))
      .innerJoin(stockLots, eq(stockLots.id, workOrderConsumptions.lotId))
      .innerJoin(locations, eq(locations.id, workOrderConsumptions.fromLocationId))
      .leftJoin(users, eq(users.id, workOrderConsumptions.scannedBy))
      .where(eq(workOrderConsumptions.workOrderId, id))
      .orderBy(desc(workOrderConsumptions.consumedAt)),
    db
      .select({ o: workOrderOutputs, lotNo: stockLots.lotNo, lotStatus: stockLots.status, locationCode: locations.code })
      .from(workOrderOutputs)
      .innerJoin(stockLots, eq(stockLots.id, workOrderOutputs.lotId))
      .innerJoin(locations, eq(locations.id, workOrderOutputs.toLocationId))
      .where(eq(workOrderOutputs.workOrderId, id))
      .orderBy(desc(workOrderOutputs.producedAt)),
    db
      .select({ s: workOrderScraps, recordedByName: users.fullName })
      .from(workOrderScraps)
      .leftJoin(users, eq(users.id, workOrderScraps.recordedBy))
      .where(eq(workOrderScraps.workOrderId, id))
      .orderBy(desc(workOrderScraps.recordedAt)),
    db
      .select({ e: workOrderEvents, userName: users.fullName })
      .from(workOrderEvents)
      .leftJoin(users, eq(users.id, workOrderEvents.userId))
      .where(eq(workOrderEvents.workOrderId, id))
      .orderBy(desc(workOrderEvents.at)),
    getChain(db, 'work_order', id),
  ]);
  const row = rowResult[0];
  if (!row) return null;

  return { ...row, materials, consumptions, outputs, scraps, events, chain };
}

/* ==================================================================== */
/* /uretim/hatlar                                                       */
/* ==================================================================== */

export type LineCardRow = {
  id: string; code: string; name: string; capacityPerHour: string | null; shiftMinutes: number;
  activeWorkOrder: { id: string; docNo: string; productName: string; status: string; producedQty: string; plannedQty: string; uomCode: string } | null;
  todayProducedQty: string;
  /** Bugün biten iş emirlerinin ortak birimi — hepsi aynıysa dolu, karışıksa null (toplam miktar tek birime indirgenemez) */
  todayUomCode: string | null;
  oee: Awaited<ReturnType<typeof computeLineOeeForDay>>;
  lastDowntimeReason: string | null;
  /** Son 7 günün üretilen değeri (₺, gün gün) — miktar değil değer: hat farklı birimde ürün
   *  üretebildiğinden (todayUomCode ile aynı sorun) fiziksel miktar sparkline'ı yanıltıcı olurdu. */
  sparkline: number[];
  /** Bu 7 gün toplamının önceki 7 güne göre değişimi (%) — Stripe'ın çıplak bırakmadığı karşılaştırma
   *  deltası; önceki dönem toplamı 0 ise (yeni hat / veri yok) null (Tur 5 bulgusu, P1). */
  sparklineDeltaPct: number | null;
  lastClosedWorkOrder: { docNo: string; productName: string; producedQty: string; uomCode: string; closedAt: Date } | null;
};

export async function listLineCards(): Promise<LineCardRow[]> {
  const lines = await listProductionLines();
  const today = new Date().toISOString().slice(0, 10);
  const out: LineCardRow[] = [];
  for (const line of lines) {
    const [active] = await db
      .select({ wo: workOrders, productName: products.name, uomCode: uoms.code })
      .from(workOrders)
      .innerJoin(products, eq(products.id, workOrders.productId))
      .innerJoin(uoms, eq(uoms.id, workOrders.uomId))
      .where(and(eq(workOrders.lineId, line.id), inArray(workOrders.status, ['in_progress', 'paused'])))
      .orderBy(desc(workOrders.startedAt))
      .limit(1);

    const oee = await computeLineOeeForDay(db, line.id, today);

    const finishedRows = await db
      .select({ wo: workOrders, productName: products.name, uomCode: uoms.code })
      .from(workOrders)
      .innerJoin(products, eq(products.id, workOrders.productId))
      .innerJoin(uoms, eq(uoms.id, workOrders.uomId))
      .where(and(eq(workOrders.lineId, line.id), isNotNull(workOrders.finishedAt)));
    const todayUomCodes = new Set(finishedRows.filter((r) => businessDate(r.wo.finishedAt!) === today).map((r) => r.uomCode));
    // Bugün hiç biten iş emri yoksa (küme boş) sütun birimsiz "0" basıyordu — aynı sütunda
    // HAT2 "39 ADET" iken HAT1/HAT3 çıplak "0", iki farklı rakam anatomisi (Tur 5 bulgusu, P1).
    // Hattın tüm zamanlardaki üretiminin ortak birimi varsa (çoğunlukla öyle — bir hat tipik
    // olarak tek tip ürün ailesi üretir) o birim soluk gösterilir; hiç geçmiş üretim de yoksa
    // (yeni hat) birim boş kalır — bu tek durumda birimsiz "0" dürüsttür.
    const allTimeUomCodes = new Set(finishedRows.map((r) => r.uomCode));
    const fallbackUomCode = allTimeUomCodes.size === 1 ? Array.from(allTimeUomCodes)[0]! : null;

    // 7 günlük değer sparkline'ı: eskiden kartın altında 900px viewport'un ~%47'si boş kalıyordu
    // (Tur 3 bulgusu, P2) — hattın son bir haftasına dair gerçek bir eğri gösterir.
    const last7Days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
    const sparkline = last7Days.map((d) => sum(finishedRows.filter((r) => businessDate(r.wo.finishedAt!) === d).map((r) => r.wo.totalCost)).toNumber());
    // Delta: bu 7 günün toplamı vs önceki 7 gün — sparkline tek başına büyüklüğü söylemiyordu
    // (Tur 4'te eklenen çizgi hangi büyüklükte olduğu okunamayan çıplak bir eğriydi, Tur 5 bulgusu, P1).
    const prev7Days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 13));
    const prev7DaySet = new Set(prev7Days);
    const prevWeekSum = sum(finishedRows.filter((r) => prev7DaySet.has(businessDate(r.wo.finishedAt!))).map((r) => r.wo.totalCost));
    const thisWeekSum = sparkline.reduce((a, b) => a + b, 0);
    const sparklineDeltaPct = pctChange(thisWeekSum, prevWeekSum);

    const closedRows = finishedRows.filter((r) => r.wo.status === 'closed' && r.wo.closedAt).sort((a, b) => b.wo.closedAt!.getTime() - a.wo.closedAt!.getTime());
    const lastClosed = closedRows[0];

    out.push({
      id: line.id, code: line.code, name: line.name, capacityPerHour: line.capacityPerHour, shiftMinutes: line.shiftMinutes,
      activeWorkOrder: active ? { id: active.wo.id, docNo: active.wo.docNo, productName: active.productName, status: active.wo.status, producedQty: active.wo.producedQty, plannedQty: active.wo.plannedQty, uomCode: active.uomCode } : null,
      todayProducedQty: toDb(oee.actualOutput),
      todayUomCode: todayUomCodes.size === 1 ? Array.from(todayUomCodes)[0]! : fallbackUomCode,
      oee,
      lastDowntimeReason: null,
      sparkline,
      sparklineDeltaPct,
      lastClosedWorkOrder: lastClosed ? { docNo: lastClosed.wo.docNo, productName: lastClosed.productName, producedQty: lastClosed.wo.producedQty, uomCode: lastClosed.uomCode, closedAt: lastClosed.wo.closedAt! } : null,
    });
  }
  return out;
}

/* ==================================================================== */
/* /uretim/planlama                                                     */
/* ==================================================================== */

export type PlanningWorkOrderRow = { id: string; docNo: string; status: string; productName: string; lineId: string; plannedQty: string; uomCode: string; plannedStart: string | null };

export async function listPlanningWorkOrders(fromIso: string, toIso: string): Promise<PlanningWorkOrderRow[]> {
  const rows = await db
    .select({ wo: workOrders, productName: products.name, uomCode: uoms.code })
    .from(workOrders)
    .innerJoin(products, eq(products.id, workOrders.productId))
    .innerJoin(uoms, eq(uoms.id, workOrders.uomId))
    .where(and(inArray(workOrders.status, ['planned', 'released', 'in_progress', 'paused']), gte(workOrders.plannedStart, new Date(`${fromIso}T00:00:00Z`)), lte(workOrders.plannedStart, new Date(`${toIso}T23:59:59Z`))))
    .orderBy(asc(workOrders.plannedStart));
  const unscheduled = await db
    .select({ wo: workOrders, productName: products.name, uomCode: uoms.code })
    .from(workOrders)
    .innerJoin(products, eq(products.id, workOrders.productId))
    .innerJoin(uoms, eq(uoms.id, workOrders.uomId))
    .where(and(inArray(workOrders.status, ['planned', 'released']), isNull(workOrders.plannedStart)));
  return [...rows, ...unscheduled].map((r) => ({
    id: r.wo.id, docNo: r.wo.docNo, status: r.wo.status, productName: r.productName, lineId: r.wo.lineId,
    plannedQty: r.wo.plannedQty, uomCode: r.uomCode, plannedStart: r.wo.plannedStart ? r.wo.plannedStart.toISOString().slice(0, 10) : null,
  }));
}

/* ==================================================================== */
/* /operator                                                            */
/* ==================================================================== */

export type OperatorUserRow = { id: string; fullName: string; roleCode: string };

/** PIN girişi kullanıcı seçimi: operatör/üretim şefi rolündeki, PIN tanımlı aktif kullanıcılar */
export async function listOperatorUsers(): Promise<OperatorUserRow[]> {
  const rows = await db
    .select({ id: users.id, fullName: users.fullName, roleCode: roles.code })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(users.isActive, true), inArray(roles.code, ['uretim_operatoru', 'uretim_sefi'])));
  const seen = new Set<string>();
  const out: OperatorUserRow[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

export type OperatorWorkOrderDetail = NonNullable<Awaited<ReturnType<typeof getWorkOrderDetail>>>;

const LINE_ACTIVE_STATUSES = ['in_progress', 'paused', 'released'] as const;
const LINE_STATUS_PRIORITY: Record<string, number> = { in_progress: 0, paused: 1, released: 2 };

/**
 * Bu hattaki açık (devam eden/duraklamış/serbest) iş emirleri, deterministik sırayla
 * (öncelik: in_progress > paused > released; eşitlikte plannedStart artan, sonra docNo artan —
 * SQL ORDER BY, tarihsizler Postgres varsayımıyla ASC'de sonda). `/operator` hat kartı rozeti ve
 * `/operator/[lineId]` kuyruk ekranı bunu kullanır.
 */
export async function listOpenWorkOrdersForLine(lineId: string): Promise<LineQueueRow[]> {
  const rows = await db
    .select({ wo: workOrders, productName: products.name, uomCode: uoms.code })
    .from(workOrders)
    .innerJoin(products, eq(products.id, workOrders.productId))
    .innerJoin(uoms, eq(uoms.id, workOrders.uomId))
    .where(and(eq(workOrders.lineId, lineId), inArray(workOrders.status, LINE_ACTIVE_STATUSES)))
    .orderBy(asc(workOrders.plannedStart), asc(workOrders.docNo));
  const sorted = rows
    .map((r) => ({
      id: r.wo.id, docNo: r.wo.docNo, status: r.wo.status, productName: r.productName, uomCode: r.uomCode,
      plannedQty: r.wo.plannedQty, producedQty: r.wo.producedQty,
      plannedStart: r.wo.plannedStart ? r.wo.plannedStart.toISOString().slice(0, 10) : null,
    }))
    .sort((a, b) => (LINE_STATUS_PRIORITY[a.status] ?? 9) - (LINE_STATUS_PRIORITY[b.status] ?? 9)); // stable — SQL sırasını önceliğe göre yalnızca yeniden gruplar
  return sorted;
}

export type LineQueueRow = { id: string; docNo: string; status: string; productName: string; uomCode: string; plannedQty: string; producedQty: string; plannedStart: string | null };

/**
 * Bu hattaki tek anlamlı "aktif" iş emri — yoksa ya da birden fazla iş emri aynı öncelik
 * kademesinde eşitse (ör. iki `released`) null döner: eskiden bu durumda hangi kaydın seçildiği
 * sorgunun ORDER BY'sız, keyfi dönüş sırasına bağlıydı — operatör planlamacının serbest bıraktığı
 * iş emrinden habersiz, önceki (yanlış) iş emrine karşı okutma/fire/bitir yapabiliyordu (Tur 3
 * bulgusu, P0 — lot geri izleme ve miktar zinciri riski). Belirsiz durumda çağıran taraf
 * (`/operator/[lineId]`) `listOpenWorkOrdersForLine` ile kuyruğu listeleyip operatöre seçtirir.
 */
export async function getActiveWorkOrderForLine(lineId: string): Promise<OperatorWorkOrderDetail | null> {
  const queue = await listOpenWorkOrdersForLine(lineId);
  if (!queue.length) return null;
  const top = queue[0]!;
  const tiedWithTop = queue.filter((r) => (LINE_STATUS_PRIORITY[r.status] ?? 9) === (LINE_STATUS_PRIORITY[top.status] ?? 9));
  if (tiedWithTop.length > 1) return null;
  return getWorkOrderDetail(top.id);
}

export type LineOption = { id: string; code: string; name: string; capacityPerHour: string | null; shiftMinutes: number };
export async function listLineOptions(): Promise<LineOption[]> {
  const rows = await listProductionLines();
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, capacityPerHour: r.capacityPerHour, shiftMinutes: r.shiftMinutes }));
}

export type NextPlannedWorkOrder = { docNo: string; plannedStart: string | null };

/**
 * Hat başına henüz serbest bırakılmamış (status='planned') en yakın iş emri — yalnızca operatör
 * kuyruğunda (released/in_progress/paused) hiçbir şey yokken boş hat kartında "Sıradaki" ipucu
 * göstermek için (Tur 5 bulgusu, P1: boş kart "Aktif iş emri yok" dışında hiçbir bağlam
 * vermiyordu — operatör hattı açmadan bugün/yarın ne planlandığını göremiyordu).
 */
export async function listNextPlannedWorkOrders(lineIds: string[]): Promise<Map<string, NextPlannedWorkOrder>> {
  if (!lineIds.length) return new Map();
  const rows = await db
    .select({ lineId: workOrders.lineId, docNo: workOrders.docNo, plannedStart: workOrders.plannedStart })
    .from(workOrders)
    .where(and(inArray(workOrders.lineId, lineIds), eq(workOrders.status, 'planned')))
    .orderBy(asc(workOrders.plannedStart), asc(workOrders.docNo));
  const map = new Map<string, NextPlannedWorkOrder>();
  for (const r of rows) {
    if (!map.has(r.lineId)) map.set(r.lineId, { docNo: r.docNo, plannedStart: r.plannedStart ? r.plannedStart.toISOString().slice(0, 10) : null });
  }
  return map;
}

/* ==================================================================== */
/* /operator — Vardiya özeti                                            */
/* ==================================================================== */

export type LineShiftSummary = {
  lineId: string;
  /** Bugün üretilen (mamul) miktar */
  todayProducedQty: string;
  /** Bugünün ideal (hedef) üretimi — kapasite/saat × (vardiya süresi − duruş süresi) */
  todayTargetQty: string;
  lastDowntime: { reason: string; minutes: number; startedAt: Date } | null;
};

/**
 * Operatör ana ekranındaki "Vardiya özeti" şeridi için hat başına bugünkü üretim/hedef ve son
 * duruş bilgisi — `computeLineOeeForDay` zaten bu hesabı yapıyor (Tur 4 bulgusu, P1: 1024×768'te
 * kartların altında %35 boş alan kalıyordu, şerit bu bilgiyle genişletilir).
 */
export async function listLineShiftSummaries(lineIds: string[]): Promise<LineShiftSummary[]> {
  const today = businessDate(new Date());
  return Promise.all(
    lineIds.map(async (lineId) => {
      const [oee, [lastDowntime]] = await Promise.all([
        computeLineOeeForDay(db, lineId, today),
        db
          .select({ reason: downtimes.reason, minutes: downtimes.minutes, startedAt: downtimes.startedAt })
          .from(downtimes)
          .where(and(eq(downtimes.lineId, lineId), gte(downtimes.startedAt, new Date(`${today}T00:00:00Z`))))
          .orderBy(desc(downtimes.startedAt))
          .limit(1),
      ]);
      return {
        lineId,
        todayProducedQty: toDb(oee.actualOutput),
        todayTargetQty: toDb(oee.idealOutput),
        lastDowntime: lastDowntime ? { reason: lastDowntime.reason, minutes: lastDowntime.minutes, startedAt: lastDowntime.startedAt } : null,
      };
    }),
  );
}
