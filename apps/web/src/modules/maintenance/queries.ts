import 'server-only';
import { and, asc, desc, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { db, schema } from '@plantero/db';
import { D, round2, sum } from '@plantero/core';
import { businessDate, addDays } from '@plantero/core/dates';
import { computeMtbfMttr } from '@plantero/core/maintenance/machines';

const {
  machines, maintenancePlans, maintenanceOrders, downtimes, oeeRecords, attachments,
  productionLines, users, roles, userRoles, workOrders, products, auditLog,
} = schema;

/* ==================================================================== */
/* Ortak arama listeleri (form combobox'ları)                           */
/* ==================================================================== */

export async function listActiveMachinesForForm() {
  return db.select({ id: machines.id, code: machines.code, name: machines.name, category: machines.category, lineId: machines.lineId, status: machines.status }).from(machines).where(eq(machines.isActive, true)).orderBy(asc(machines.code));
}

export type RecentBreakdownRow = {
  id: string; docNo: string; title: string; status: string; priority: string; machineCode: string; machineName: string; reportedAt: Date;
};

/** Kök neden (Tur 4 P2 bakim-yeni-02): "Arıza Bildir" formu masaüstünde ekranın %85'ini boş
 *  bırakıyordu (tek sütun, telefon akışı). Masaüstünde form yanına bu listeyi (son 5 arıza)
 *  koyarak boşluğu dolduruyoruz — sahada telefon akışı DEĞİŞMEDİ, yalnızca geniş ekranda ek bağlam. */
export async function listRecentBreakdowns(limit = 5): Promise<RecentBreakdownRow[]> {
  const rows = await db
    .select({ o: maintenanceOrders, machineCode: machines.code, machineName: machines.name })
    .from(maintenanceOrders)
    .innerJoin(machines, eq(machines.id, maintenanceOrders.machineId))
    .where(eq(maintenanceOrders.kind, 'corrective'))
    .orderBy(desc(maintenanceOrders.reportedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.o.id, docNo: r.o.docNo, title: r.o.title, status: r.o.status, priority: r.o.priority,
    machineCode: r.machineCode, machineName: r.machineName, reportedAt: r.o.reportedAt,
  }));
}

export type AssigneeOption = { id: string; fullName: string };

/** Bakım/üretim şefi rolündeki kullanıcılar — plan/iş emri sorumlusu seçimi. */
export async function listMaintenanceAssignees(): Promise<AssigneeOption[]> {
  const rows = await db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(users.isActive, true), inArray(roles.code, ['bakim', 'uretim_sefi'])));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return Array.from(byId.values()).sort((a, b) => a.fullName.localeCompare(b.fullName, 'tr'));
}

/** Bir makinenin hattında açık üretim iş emirleri — arıza bildirimini bir üretim iş emrine bağlamak için. */
export async function listOpenWorkOrdersForLine(lineId: string | null) {
  if (!lineId) return [];
  return db
    .select({ id: workOrders.id, docNo: workOrders.docNo, productName: products.name })
    .from(workOrders)
    .innerJoin(products, eq(products.id, workOrders.productId))
    .where(and(eq(workOrders.lineId, lineId), inArray(workOrders.status, ['released', 'in_progress', 'paused'])))
    .orderBy(desc(workOrders.plannedStart));
}

/* ==================================================================== */
/* /bakim/makineler                                                     */
/* ==================================================================== */

export type MachineListRow = {
  id: string; code: string; name: string; category: string; status: string;
  lineCode: string | null; lineName: string | null; capacityPerHour: string | null; capacityUnit: string | null;
  runtimeHours: string; nextDueAt: string | null; openOrderCount: number; planCount: number;
};

export async function listMachines(): Promise<MachineListRow[]> {
  const rows = await db
    .select({ m: machines, lineCode: productionLines.code, lineName: productionLines.name })
    .from(machines)
    .leftJoin(productionLines, eq(productionLines.id, machines.lineId))
    .where(eq(machines.isActive, true))
    .orderBy(asc(machines.code));

  const plans = await db.select({ machineId: maintenancePlans.machineId, nextDueAt: maintenancePlans.nextDueAt }).from(maintenancePlans).where(eq(maintenancePlans.isActive, true));
  const nextDueByMachine = new Map<string, string>();
  const planCountByMachine = new Map<string, number>();
  for (const p of plans) {
    planCountByMachine.set(p.machineId, (planCountByMachine.get(p.machineId) ?? 0) + 1);
    if (p.nextDueAt) {
      const cur = nextDueByMachine.get(p.machineId);
      if (!cur || p.nextDueAt < cur) nextDueByMachine.set(p.machineId, p.nextDueAt);
    }
  }

  const openOrders = await db
    .select({ machineId: maintenanceOrders.machineId })
    .from(maintenanceOrders)
    .where(inArray(maintenanceOrders.status, ['reported', 'planned', 'in_progress', 'waiting_parts']));
  const openCountByMachine = new Map<string, number>();
  for (const o of openOrders) openCountByMachine.set(o.machineId, (openCountByMachine.get(o.machineId) ?? 0) + 1);

  return rows.map((r) => ({
    id: r.m.id, code: r.m.code, name: r.m.name, category: r.m.category, status: r.m.status,
    lineCode: r.lineCode, lineName: r.lineName, capacityPerHour: r.m.capacityPerHour, capacityUnit: r.m.capacityUnit,
    runtimeHours: r.m.runtimeHours, nextDueAt: nextDueByMachine.get(r.m.id) ?? null,
    openOrderCount: openCountByMachine.get(r.m.id) ?? 0, planCount: planCountByMachine.get(r.m.id) ?? 0,
  }));
}

export type MachineDetail = {
  machine: typeof machines.$inferSelect;
  lineCode: string | null; lineName: string | null; warehouseCode: string | null; productSku: string | null; productName: string | null;
  responsibleName: string | null;
  plans: Array<typeof maintenancePlans.$inferSelect & { assigneeName: string | null }>;
  orders: Array<typeof maintenanceOrders.$inferSelect & { assigneeName: string | null }>;
  downtimes: Array<typeof downtimes.$inferSelect>;
  photos: Array<{ id: string; orderId: string; orderDocNo: string; fileName: string; mimeType: string; storagePath: string; createdAt: Date }>;
  oeeTrend: Array<{ day: string; oeePct: string }>;
  mtbfHours: number | null; mttrHours: number | null; failureCount: number;
};

export async function getMachineDetail(id: string): Promise<MachineDetail | null> {
  const { warehouses } = schema;
  const [row] = await db
    .select({ m: machines, lineCode: productionLines.code, lineName: productionLines.name, warehouseCode: warehouses.code, productSku: products.sku, productName: products.name, responsibleName: users.fullName })
    .from(machines)
    .leftJoin(productionLines, eq(productionLines.id, machines.lineId))
    .leftJoin(warehouses, eq(warehouses.id, machines.warehouseId))
    .leftJoin(products, eq(products.id, machines.productId))
    .leftJoin(users, eq(users.id, machines.responsibleId))
    .where(eq(machines.id, id))
    .limit(1);
  if (!row) return null;

  const planRows = await db
    .select({ p: maintenancePlans, assigneeName: users.fullName })
    .from(maintenancePlans)
    .leftJoin(users, eq(users.id, maintenancePlans.assigneeId))
    .where(eq(maintenancePlans.machineId, id))
    .orderBy(asc(maintenancePlans.nextDueAt));

  const orderRows = await db
    .select({ o: maintenanceOrders, assigneeName: users.fullName })
    .from(maintenanceOrders)
    .leftJoin(users, eq(users.id, maintenanceOrders.assigneeId))
    .where(eq(maintenanceOrders.machineId, id))
    .orderBy(desc(maintenanceOrders.reportedAt));

  const downtimeRows = await db.select().from(downtimes).where(eq(downtimes.machineId, id)).orderBy(desc(downtimes.startedAt)).limit(20);

  const orderIds = orderRows.map((r) => r.o.id);
  const photoRows = orderIds.length
    ? await db.select().from(attachments).where(and(eq(attachments.tableName, 'maintenance_orders'), inArray(attachments.recordId, orderIds))).orderBy(desc(attachments.createdAt))
    : [];
  const docNoByOrder = new Map(orderRows.map((r) => [r.o.id, r.o.docNo]));

  const oeeTrend = row.m.lineId
    ? await db.select({ day: oeeRecords.day, oeePct: oeeRecords.oeePct }).from(oeeRecords).where(eq(oeeRecords.lineId, row.m.lineId)).orderBy(desc(oeeRecords.day)).limit(30)
    : [];

  const { mtbfHours, mttrHours, failureCount } = await computeMtbfMttr(db, id);

  return {
    machine: row.m, lineCode: row.lineCode, lineName: row.lineName, warehouseCode: row.warehouseCode, productSku: row.productSku, productName: row.productName, responsibleName: row.responsibleName,
    plans: planRows.map((r) => ({ ...r.p, assigneeName: r.assigneeName })),
    orders: orderRows.map((r) => ({ ...r.o, assigneeName: r.assigneeName })),
    downtimes: downtimeRows,
    photos: photoRows.map((p) => ({ id: p.id, orderId: p.recordId, orderDocNo: docNoByOrder.get(p.recordId) ?? '', fileName: p.fileName, mimeType: p.mimeType, storagePath: p.storagePath, createdAt: p.createdAt })),
    oeeTrend: oeeTrend.reverse(),
    mtbfHours, mttrHours, failureCount,
  };
}

/* ==================================================================== */
/* /bakim/planlar                                                       */
/* ==================================================================== */

export type PlanRow = {
  id: string; name: string; intervalValue: number; intervalUnit: string; estimatedMinutes: number;
  lastDoneAt: string | null; nextDueAt: string | null; isActive: boolean; checklistCount: number;
  machineId: string; machineCode: string; machineName: string; assigneeName: string | null;
  hasOpenOrder: boolean;
};

export async function listPlans(): Promise<PlanRow[]> {
  const rows = await db
    .select({ p: maintenancePlans, machineCode: machines.code, machineName: machines.name, assigneeName: users.fullName })
    .from(maintenancePlans)
    .innerJoin(machines, eq(machines.id, maintenancePlans.machineId))
    .leftJoin(users, eq(users.id, maintenancePlans.assigneeId))
    .orderBy(asc(maintenancePlans.nextDueAt));

  const openOrders = await db.select({ planId: maintenanceOrders.planId }).from(maintenanceOrders).where(inArray(maintenanceOrders.status, ['reported', 'planned', 'in_progress', 'waiting_parts']));
  const openPlanIds = new Set(openOrders.map((o) => o.planId).filter((v): v is string => Boolean(v)));

  return rows.map((r) => ({
    id: r.p.id, name: r.p.name, intervalValue: r.p.intervalValue, intervalUnit: r.p.intervalUnit, estimatedMinutes: r.p.estimatedMinutes,
    lastDoneAt: r.p.lastDoneAt, nextDueAt: r.p.nextDueAt, isActive: r.p.isActive, checklistCount: (r.p.checklist ?? []).length,
    machineId: r.p.machineId, machineCode: r.machineCode, machineName: r.machineName, assigneeName: r.assigneeName,
    hasOpenOrder: openPlanIds.has(r.p.id),
  }));
}

/* ==================================================================== */
/* /bakim/is-emirleri                                                   */
/* ==================================================================== */

export type MaintenanceOrderRow = {
  id: string; docNo: string; kind: string; status: string; priority: string; title: string;
  machineId: string; machineCode: string; machineName: string; lineCode: string | null;
  reportedAt: Date; scheduledFor: string | null; assigneeName: string | null; photoCount: number; downtimeMinutes: number;
};

export async function listMaintenanceOrders(): Promise<MaintenanceOrderRow[]> {
  const rows = await db
    .select({ o: maintenanceOrders, machineCode: machines.code, machineName: machines.name, lineCode: productionLines.code, assigneeName: users.fullName })
    .from(maintenanceOrders)
    .innerJoin(machines, eq(machines.id, maintenanceOrders.machineId))
    .leftJoin(productionLines, eq(productionLines.id, machines.lineId))
    .leftJoin(users, eq(users.id, maintenanceOrders.assigneeId))
    .orderBy(desc(maintenanceOrders.reportedAt));
  return rows.map((r) => ({
    id: r.o.id, docNo: r.o.docNo, kind: r.o.kind, status: r.o.status, priority: r.o.priority, title: r.o.title,
    machineId: r.o.machineId, machineCode: r.machineCode, machineName: r.machineName, lineCode: r.lineCode,
    reportedAt: r.o.reportedAt, scheduledFor: r.o.scheduledFor, assigneeName: r.assigneeName, photoCount: r.o.photoCount, downtimeMinutes: r.o.downtimeMinutes,
  }));
}

export type MaintenanceOrderDetail = {
  order: typeof maintenanceOrders.$inferSelect;
  machine: typeof machines.$inferSelect;
  lineCode: string | null; lineName: string | null;
  machineResponsibleName: string | null;
  nextPlan: { name: string; nextDueAt: string | null } | null;
  relatedOrders: Array<{ id: string; docNo: string; title: string; status: string; reportedAt: Date }>;
  plan: typeof maintenancePlans.$inferSelect | null;
  assigneeName: string | null; reportedByName: string | null;
  photos: Array<typeof attachments.$inferSelect>;
  downtime: typeof downtimes.$inferSelect | null;
  workOrderDocNo: string | null;
  events: MaintenanceOrderEvent[];
};

export async function getMaintenanceOrderDetail(id: string): Promise<MaintenanceOrderDetail | null> {
  const assignee = { id: users.id, fullName: users.fullName };
  const [row] = await db
    .select({ o: maintenanceOrders, machine: machines, lineCode: productionLines.code, lineName: productionLines.name, machineResponsibleName: users.fullName })
    .from(maintenanceOrders)
    .innerJoin(machines, eq(machines.id, maintenanceOrders.machineId))
    .leftJoin(productionLines, eq(productionLines.id, machines.lineId))
    .leftJoin(users, eq(users.id, machines.responsibleId))
    .where(eq(maintenanceOrders.id, id))
    .limit(1);
  if (!row) return null;

  const [plan] = row.o.planId ? await db.select().from(maintenancePlans).where(eq(maintenancePlans.id, row.o.planId)).limit(1) : [];
  const [assigneeRow] = row.o.assigneeId ? await db.select(assignee).from(users).where(eq(users.id, row.o.assigneeId)).limit(1) : [];
  const [reporterRow] = row.o.reportedBy ? await db.select(assignee).from(users).where(eq(users.id, row.o.reportedBy)).limit(1) : [];
  const photos = await db.select().from(attachments).where(and(eq(attachments.tableName, 'maintenance_orders'), eq(attachments.recordId, id))).orderBy(asc(attachments.createdAt));
  const [downtime] = await db.select().from(downtimes).where(eq(downtimes.maintenanceOrderId, id)).orderBy(desc(downtimes.startedAt)).limit(1);
  const [wo] = row.o.workOrderId ? await db.select({ docNo: workOrders.docNo }).from(workOrders).where(eq(workOrders.id, row.o.workOrderId)).limit(1) : [];
  // Kriter 3 (Tur 2 P1 bakim-isemirleri-detay-04) yardımcı içerik: sparse (yeni bildirilmiş, tanı/
  // maliyet/kontrol listesi/fotoğrafsız) bir arıza iş emrinde ekranın yarısı boş kalmasın diye bu
  // makinenin bir sonraki planlı bakımı da gösterilir — teknisyen için doğrudan faydalı bağlam.
  const [nextPlanRow] = await db
    .select({ name: maintenancePlans.name, nextDueAt: maintenancePlans.nextDueAt })
    .from(maintenancePlans)
    .where(and(eq(maintenancePlans.machineId, row.o.machineId), eq(maintenancePlans.isActive, true)))
    .orderBy(asc(maintenancePlans.nextDueAt))
    .limit(1);
  const events = await getMaintenanceOrderEvents(id);
  // Kriter 3 (Tur 2 P1 bakim-isemirleri-detay-04) yardımcı içerik: aynı makinenin diğer iş emirleri —
  // "bu tekrarlayan bir arıza mı?" sorusuna sekme değiştirmeden yanıt verir.
  const relatedOrderRows = await db
    .select({ id: maintenanceOrders.id, docNo: maintenanceOrders.docNo, title: maintenanceOrders.title, status: maintenanceOrders.status, reportedAt: maintenanceOrders.reportedAt })
    .from(maintenanceOrders)
    .where(and(eq(maintenanceOrders.machineId, row.o.machineId), ne(maintenanceOrders.id, id)))
    .orderBy(desc(maintenanceOrders.reportedAt))
    .limit(5);

  return {
    order: row.o, machine: row.machine, lineCode: row.lineCode, lineName: row.lineName,
    machineResponsibleName: row.machineResponsibleName, nextPlan: nextPlanRow ?? null, relatedOrders: relatedOrderRows, plan: plan ?? null,
    assigneeName: assigneeRow?.fullName ?? null, reportedByName: reporterRow?.fullName ?? null,
    photos, downtime: downtime ?? null, workOrderDocNo: wo?.docNo ?? null, events,
  };
}

export type MaintenanceOrderEvent = { id: string; at: Date; action: string; summary: string | null; status: string | null; userName: string | null };

/**
 * Kriter 3 (Tur 2 P1 bakim-isemirleri-detay-04) kök neden düzeltmesi: iş emri detayında durum
 * yalnızca TEK bir rozetle temsil ediliyordu — "bildirildi → işleme alındı → parça bekliyor →
 * tamamlandı" geçişleri (kim, ne zaman) hiçbir yerde görünmüyordu. `maintenance_orders` şemasında
 * (dondurulmuş) ayrı bir olay/geçmiş tablosu yok; her durum geçişi zaten `audit_log`'a yazılıyor
 * (orders.ts: reportBreakdown→create, start/markWaitingParts→update, completeOrder→post,
 * cancelOrder→cancel) — kaynak veri burada, yeni tablo gerekmiyor. Kontrol listesi/maliyet
 * güncellemeleri de 'update' yazıyor ama `before`/`after` alanlarını HİÇ doldurmuyor (yalnızca
 * `summary`); durum geçişleri ise her zaman `after` içinde bir `status` alanı taşıyor — bu filtre
 * checklist tıklamalarının zaman çizelgesini spamlamasını engeller.
 */
export async function getMaintenanceOrderEvents(orderId: string): Promise<MaintenanceOrderEvent[]> {
  const rows = await db
    .select({ id: auditLog.id, at: auditLog.at, action: auditLog.action, summary: auditLog.summary, after: auditLog.after, userName: users.fullName, userEmail: auditLog.userEmail })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .where(and(eq(auditLog.tableName, 'maintenance_orders'), eq(auditLog.recordId, orderId)))
    .orderBy(asc(auditLog.at));

  return rows
    .filter((r) => r.after && typeof r.after === 'object' && 'status' in (r.after as Record<string, unknown>))
    .map((r) => ({
      id: r.id, at: r.at, action: r.action, summary: r.summary,
      status: String((r.after as Record<string, unknown>).status),
      userName: r.userName ?? r.userEmail ?? null,
    }));
}

/* ==================================================================== */
/* /bakim/oee                                                           */
/* ==================================================================== */

export type OeeTrendPoint = { day: string; lineCode: string; lineId: string; oeePct: string; availabilityPct: string; performancePct: string; qualityPct: string };
export type DowntimeParetoRow = { reason: string; minutes: number };
export type OeeKpis = {
  avgOeePct: string | null; avgOeePctDelta: number | null;
  avgAvailabilityPct: string | null; avgPerformancePct: string | null; avgQualityPct: string | null;
  totalDowntimeMinutes: number;
};

export type MachineOeeRow = {
  machineId: string; machineCode: string; machineName: string; lineCode: string;
  oeePct: string; availabilityPct: string; downtimeMinutes: number;
};

export type OeeDashboardData = {
  lines: Array<{ id: string; code: string; name: string }>;
  trend: OeeTrendPoint[];
  pareto: DowntimeParetoRow[];
  kpis: OeeKpis;
  machines: MachineOeeRow[];
};

/** Son `days` günün OEE trendi + duruş pareto'su. `lineId` verilmezse tüm hatların ağırlıklı ortalaması. */
export async function getOeeDashboard(opts: { lineId?: string; days?: number } = {}): Promise<OeeDashboardData> {
  const days = opts.days ?? 30;
  const today = businessDate(new Date());
  const fromDay = addDays(today, -(days - 1));
  const prevFromDay = addDays(fromDay, -days);

  const lines = await db.select({ id: productionLines.id, code: productionLines.code, name: productionLines.name }).from(productionLines).where(eq(productionLines.isActive, true)).orderBy(asc(productionLines.sortOrder));

  const recordConds = [gte(oeeRecords.day, fromDay), lte(oeeRecords.day, today)];
  if (opts.lineId) recordConds.push(eq(oeeRecords.lineId, opts.lineId));
  const records = await db.select({ r: oeeRecords, lineCode: productionLines.code }).from(oeeRecords).innerJoin(productionLines, eq(productionLines.id, oeeRecords.lineId)).where(and(...recordConds)).orderBy(asc(oeeRecords.day));

  // Hat seçilmediyse günlük ortalama (basit — hatlar arası ağırlıklandırma yapılmaz, tüm hatlar aynı vardiya uzunluğunda).
  const byDay = new Map<string, typeof records>();
  for (const r of records) {
    const arr = byDay.get(r.r.day) ?? [];
    arr.push(r);
    byDay.set(r.r.day, arr);
  }
  const trend: OeeTrendPoint[] = opts.lineId
    ? records.map((r) => ({ day: r.r.day, lineId: r.r.lineId, lineCode: r.lineCode, oeePct: r.r.oeePct, availabilityPct: r.r.availabilityPct, performancePct: r.r.performancePct, qualityPct: r.r.qualityPct }))
    : Array.from(byDay.entries()).map(([day, rows]) => {
        const avg = (key: 'oeePct' | 'availabilityPct' | 'performancePct' | 'qualityPct') => round2(sum(rows.map((x) => D(x.r[key]))).div(rows.length || 1)).toFixed(2);
        return { day, lineId: '', lineCode: 'Tüm hatlar', oeePct: avg('oeePct'), availabilityPct: avg('availabilityPct'), performancePct: avg('performancePct'), qualityPct: avg('qualityPct') };
      });

  const avgOeePct = trend.length ? round2(sum(trend.map((t) => D(t.oeePct))).div(trend.length)).toFixed(2) : null;
  const avgAvailabilityPct = trend.length ? round2(sum(trend.map((t) => D(t.availabilityPct))).div(trend.length)).toFixed(2) : null;
  const avgPerformancePct = trend.length ? round2(sum(trend.map((t) => D(t.performancePct))).div(trend.length)).toFixed(2) : null;
  const avgQualityPct = trend.length ? round2(sum(trend.map((t) => D(t.qualityPct))).div(trend.length)).toFixed(2) : null;

  const prevConds = [gte(oeeRecords.day, prevFromDay), lte(oeeRecords.day, addDays(fromDay, -1))];
  if (opts.lineId) prevConds.push(eq(oeeRecords.lineId, opts.lineId));
  const prevRecords = await db.select({ oeePct: oeeRecords.oeePct }).from(oeeRecords).where(and(...prevConds));
  const prevAvg = prevRecords.length ? sum(prevRecords.map((r) => D(r.oeePct))).div(prevRecords.length) : null;
  const avgOeePctDelta = avgOeePct !== null && prevAvg && prevAvg.gt(0) ? round2(D(avgOeePct).minus(prevAvg).div(prevAvg).mul(100)).toNumber() : null;

  const dtConds = [gte(downtimes.startedAt, new Date(`${fromDay}T00:00:00Z`))];
  if (opts.lineId) dtConds.push(eq(downtimes.lineId, opts.lineId));
  const dtRows = await db.select({ reason: downtimes.reason, minutes: downtimes.minutes }).from(downtimes).where(and(...dtConds));
  const byReason = new Map<string, number>();
  for (const r of dtRows) byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + r.minutes);
  const pareto = Array.from(byReason.entries()).map(([reason, minutes]) => ({ reason, minutes })).sort((a, b) => b.minutes - a.minutes);
  const totalDowntimeMinutes = pareto.reduce((a, r) => a + r.minutes, 0);

  // Kök neden (Tur 4 P2 bakim-oee-02): sayfa 1440×900'de 262px boş bırakıyordu (tek satır KPI +
  // iki grafikten ibaretti). Aynı `records` sorgusu zaten makine bazında satır taşıyor (oee_records
  // hem lineId hem nullable machineId tutuyor — bkz. schema) — makineye ayrıştırılmış kayıtlar
  // (`r.r.machineId` dolu olanlar) makine koduna göre gruplanıp ortalama OEE/kullanılabilirlik +
  // toplam duruş dakikasıyla, grafiklerin altına ikinci bir tablo olarak eklendi.
  const machineRecords = records.filter((r) => r.r.machineId);
  const machineIds = Array.from(new Set(machineRecords.map((r) => r.r.machineId as string)));
  const machineMeta = machineIds.length
    ? await db.select({ id: machines.id, code: machines.code, name: machines.name }).from(machines).where(inArray(machines.id, machineIds))
    : [];
  const machineMetaById = new Map(machineMeta.map((m) => [m.id, m]));
  const byMachine = new Map<string, typeof machineRecords>();
  for (const r of machineRecords) {
    const key = r.r.machineId as string;
    const arr = byMachine.get(key) ?? [];
    arr.push(r);
    byMachine.set(key, arr);
  }
  const machineOeeRows: MachineOeeRow[] = Array.from(byMachine.entries())
    .map(([machineId, rows]) => {
      const meta = machineMetaById.get(machineId);
      const avgOee = round2(sum(rows.map((x) => D(x.r.oeePct))).div(rows.length)).toFixed(2);
      const avgAvail = round2(sum(rows.map((x) => D(x.r.availabilityPct))).div(rows.length)).toFixed(2);
      const downtimeMinutes = rows.reduce((a, x) => a + x.r.downtimeMinutes, 0);
      return { machineId, machineCode: meta?.code ?? '—', machineName: meta?.name ?? '—', lineCode: rows[0]!.lineCode, oeePct: avgOee, availabilityPct: avgAvail, downtimeMinutes };
    })
    .sort((a, b) => D(a.oeePct).minus(b.oeePct).toNumber());

  return { lines, trend, pareto, kpis: { avgOeePct, avgOeePctDelta, avgAvailabilityPct, avgPerformancePct, avgQualityPct, totalDowntimeMinutes }, machines: machineOeeRows };
}
