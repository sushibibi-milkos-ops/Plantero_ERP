import 'server-only';
import { and, asc, desc, eq, inArray, gte, lte, isNull, isNotNull } from 'drizzle-orm';
import { db, schema } from '@plantero/db';
import { D, round2, toDb, sum, getChain, computeLineOeeForDay } from '@plantero/core';
import { businessDate } from '@plantero/core/dates';

const {
  workOrders, workOrderMaterials, workOrderConsumptions, workOrderOutputs, workOrderScraps, workOrderEvents,
  products, uoms, boms, productionLines, warehouses, locations, stockLots, users, roles, userRoles,
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
  openCount: number; openCountDelta: number | null;
  inProgressCount: number; inProgressCountDelta: number | null;
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
  const today = new Date().toISOString().slice(0, 10);
  const finishedToday = rows.filter((r) => r.finishedAt && r.finishedAt.toISOString().slice(0, 10) === today);
  const withYield = rows.filter((r) => r.yieldPct !== null && D(r.yieldPct).gt(0));
  const avgYield = withYield.length ? sum(withYield.map((r) => r.yieldPct)).div(withYield.length) : D(0);

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
    inProgressCount: inProgress.length,
    inProgressCountDelta: pctChange(inProgress.length, inProgressAsOfWeekAgo.length),
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
  const [row] = await db
    .select({ wo: workOrders, product: products, uomCode: uoms.code, bom: boms, line: productionLines, warehouse: warehouses, operatorName: users.fullName })
    .from(workOrders)
    .innerJoin(products, eq(products.id, workOrders.productId))
    .innerJoin(uoms, eq(uoms.id, workOrders.uomId))
    .innerJoin(boms, eq(boms.id, workOrders.bomId))
    .innerJoin(productionLines, eq(productionLines.id, workOrders.lineId))
    .innerJoin(warehouses, eq(warehouses.id, workOrders.warehouseId))
    .leftJoin(users, eq(users.id, workOrders.operatorId))
    .where(eq(workOrders.id, id))
    .limit(1);
  if (!row) return null;

  const materials = await db
    .select({ m: workOrderMaterials, sku: products.sku, productName: products.name, uomCode: uoms.code })
    .from(workOrderMaterials)
    .innerJoin(products, eq(products.id, workOrderMaterials.productId))
    .innerJoin(uoms, eq(uoms.id, workOrderMaterials.uomId))
    .where(eq(workOrderMaterials.workOrderId, id))
    .orderBy(asc(workOrderMaterials.sequence));

  const consumptions = await db
    .select({ c: workOrderConsumptions, sku: products.sku, productName: products.name, uomCode: uoms.code, lotNo: stockLots.lotNo, locationCode: locations.code, scannedByName: users.fullName })
    .from(workOrderConsumptions)
    .innerJoin(products, eq(products.id, workOrderConsumptions.productId))
    .innerJoin(uoms, eq(uoms.id, workOrderConsumptions.uomId))
    .innerJoin(stockLots, eq(stockLots.id, workOrderConsumptions.lotId))
    .innerJoin(locations, eq(locations.id, workOrderConsumptions.fromLocationId))
    .leftJoin(users, eq(users.id, workOrderConsumptions.scannedBy))
    .where(eq(workOrderConsumptions.workOrderId, id))
    .orderBy(desc(workOrderConsumptions.consumedAt));

  const outputs = await db
    .select({ o: workOrderOutputs, lotNo: stockLots.lotNo, lotStatus: stockLots.status, locationCode: locations.code })
    .from(workOrderOutputs)
    .innerJoin(stockLots, eq(stockLots.id, workOrderOutputs.lotId))
    .innerJoin(locations, eq(locations.id, workOrderOutputs.toLocationId))
    .where(eq(workOrderOutputs.workOrderId, id))
    .orderBy(desc(workOrderOutputs.producedAt));

  const scraps = await db
    .select({ s: workOrderScraps, recordedByName: users.fullName })
    .from(workOrderScraps)
    .leftJoin(users, eq(users.id, workOrderScraps.recordedBy))
    .where(eq(workOrderScraps.workOrderId, id))
    .orderBy(desc(workOrderScraps.recordedAt));

  const events = await db
    .select({ e: workOrderEvents, userName: users.fullName })
    .from(workOrderEvents)
    .leftJoin(users, eq(users.id, workOrderEvents.userId))
    .where(eq(workOrderEvents.workOrderId, id))
    .orderBy(desc(workOrderEvents.at));

  const chain = await getChain(db, 'work_order', id);

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
      .select({ finishedAt: workOrders.finishedAt, uomCode: uoms.code })
      .from(workOrders)
      .innerJoin(uoms, eq(uoms.id, workOrders.uomId))
      .where(and(eq(workOrders.lineId, line.id), isNotNull(workOrders.finishedAt)));
    const todayUomCodes = new Set(finishedRows.filter((r) => businessDate(r.finishedAt!) === today).map((r) => r.uomCode));

    out.push({
      id: line.id, code: line.code, name: line.name, capacityPerHour: line.capacityPerHour, shiftMinutes: line.shiftMinutes,
      activeWorkOrder: active ? { id: active.wo.id, docNo: active.wo.docNo, productName: active.productName, status: active.wo.status, producedQty: active.wo.producedQty, plannedQty: active.wo.plannedQty, uomCode: active.uomCode } : null,
      todayProducedQty: toDb(oee.actualOutput),
      todayUomCode: todayUomCodes.size === 1 ? Array.from(todayUomCodes)[0]! : null,
      oee,
      lastDowntimeReason: null,
    });
  }
  return out;
}

/* ==================================================================== */
/* /uretim/planlama                                                     */
/* ==================================================================== */

export type PlanningWorkOrderRow = { id: string; docNo: string; status: string; productName: string; lineId: string; plannedQty: string; plannedStart: string | null };

export async function listPlanningWorkOrders(fromIso: string, toIso: string): Promise<PlanningWorkOrderRow[]> {
  const rows = await db
    .select({ wo: workOrders, productName: products.name })
    .from(workOrders)
    .innerJoin(products, eq(products.id, workOrders.productId))
    .where(and(inArray(workOrders.status, ['planned', 'released', 'in_progress', 'paused']), gte(workOrders.plannedStart, new Date(`${fromIso}T00:00:00Z`)), lte(workOrders.plannedStart, new Date(`${toIso}T23:59:59Z`))))
    .orderBy(asc(workOrders.plannedStart));
  const unscheduled = await db
    .select({ wo: workOrders, productName: products.name })
    .from(workOrders)
    .innerJoin(products, eq(products.id, workOrders.productId))
    .where(and(inArray(workOrders.status, ['planned', 'released']), isNull(workOrders.plannedStart)));
  return [...rows, ...unscheduled].map((r) => ({
    id: r.wo.id, docNo: r.wo.docNo, status: r.wo.status, productName: r.productName, lineId: r.wo.lineId,
    plannedQty: r.wo.plannedQty, plannedStart: r.wo.plannedStart ? r.wo.plannedStart.toISOString().slice(0, 10) : null,
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

/** Bu hattaki aktif (devam eden > duraklamış > serbest) iş emri — yoksa null */
export async function getActiveWorkOrderForLine(lineId: string): Promise<OperatorWorkOrderDetail | null> {
  const rows = await db.select({ id: workOrders.id, status: workOrders.status }).from(workOrders).where(and(eq(workOrders.lineId, lineId), inArray(workOrders.status, ['in_progress', 'paused', 'released'])));
  if (!rows.length) return null;
  const priority: Record<string, number> = { in_progress: 0, paused: 1, released: 2 };
  rows.sort((a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9));
  return getWorkOrderDetail(rows[0]!.id);
}

export type LineOption = { id: string; code: string; name: string; capacityPerHour: string | null; shiftMinutes: number };
export async function listLineOptions(): Promise<LineOption[]> {
  const rows = await listProductionLines();
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, capacityPerHour: r.capacityPerHour, shiftMinutes: r.shiftMinutes }));
}
