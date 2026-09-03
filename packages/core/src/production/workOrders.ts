import { and, desc, eq, inArray } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import {
  workOrders, workOrderMaterials, workOrderEvents,
  boms, products, productionLines, warehouses, downtimes, type DbOrTx,
} from '@plantero/db';
import { D, toDb, round4 } from '../money.js';
import { nextDocNo } from '../sequences.js';
import { indexDocument, linkDocuments } from '../documents/chain.js';
import { writeAudit } from '../audit/index.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import { explodeBom } from '../masterdata/boms.js';
import { resolveWarehouseRoot, resolveDefaultPutawayLocation } from '../stock/locations.js';
import type { ActorCtx } from '../types.js';

/**
 * İş emri yaşam döngüsü — `packages/db/src/schema/production.ts` üzerinde çalışır.
 * Stok yazımı yalnızca `stock/ledger.postStockMove` (bkz. `consume.ts`/`finish.ts`); bu dosya
 * yalnızca iş emri başlığı/durumu ve planlanan malzeme satırlarını yönetir.
 *
 * Durum akışı: draft yok — `createWorkOrder` doğrudan `planned` ile başlar (malzeme önizlemesi zaten
 * oluşturma formunda yapılır). `planned` → `released` (kaynak/kapasite kontrolü, rezervasyon yok — şema
 * `work_order_materials`'ta lot/lokasyon rezervasyon kolonu taşımaz; fiili tüketim anında FEFO ile
 * doğrulanır) → `in_progress` (operatör "Başlat") ⇄ `paused` (operatör "Duraklat"/"Devam") →
 * `finished` (operatör "Bitir": çıktı lotu + hareketi) → `closed` (üretim şefi "Kapat": maliyet kilidi).
 * `cancelled`: yalnızca henüz tüketim/çıktı olmayan (`planned`/`released`) iş emrinden.
 */

export type WorkOrderMaterialRow = typeof workOrderMaterials.$inferSelect;
export type WorkOrderRow = typeof workOrders.$inferSelect;
export type WorkOrderWithMaterials = { workOrder: WorkOrderRow; materials: WorkOrderMaterialRow[] };

type WorkOrderStatus = WorkOrderRow['status'];
const OPEN_STATUSES: readonly WorkOrderStatus[] = ['planned', 'released', 'in_progress', 'paused'];

async function loadWorkOrder(tx: DbOrTx, id: string, lock = false): Promise<WorkOrderRow> {
  const q = tx.select().from(workOrders).where(eq(workOrders.id, id));
  const [wo] = lock ? await q.for('update') : await q.limit(1);
  if (!wo) throw new NotFoundError('İş emri', id);
  return wo;
}

async function writeEvent(tx: DbOrTx, workOrderId: string, kind: (typeof workOrderEvents.$inferInsert)['kind'], ctx: ActorCtx, extra: Partial<typeof workOrderEvents.$inferInsert> = {}): Promise<void> {
  await tx.insert(workOrderEvents).values({ workOrderId, kind, userId: ctx.userId ?? null, ...extra });
}

async function reindex(tx: DbOrTx, wo: WorkOrderRow): Promise<void> {
  await indexDocument(tx, {
    type: 'work_order', recordId: wo.id, docNo: wo.docNo, status: wo.status, origin: wo.origin,
    title: `İş Emri ${wo.docNo}`, amount: wo.totalCost, docDate: wo.plannedStart ?? wo.createdAt,
  });
}

/* ------------------------------------------------------------------ */
/* Oluşturma                                                           */
/* ------------------------------------------------------------------ */

export type CreateWorkOrderInput = {
  productId: string;
  bomId?: string | null;
  plannedQty: Decimal;
  lineId?: string | null;
  warehouseId: string;
  plannedStart?: string | Date | null;
  plannedEnd?: string | Date | null;
  salesOrderId?: string | null;
  priority?: number;
  origin?: 'manual' | 'chain';
  note?: string | null;
};

/**
 * İş emri oluşturur: aktif BOM'u (verilmezse ürünün aktif reçetesi) `explodeBom` ile açar,
 * `work_order_materials` satırlarını yazar. Kaynak lokasyon deponun hammadde kökü (bilgi amaçlı —
 * fiili tüketimde her malzeme kendi ürün tipine göre ayrı kökten FEFO ile çekilir, bkz. `consume.ts`),
 * hedef lokasyon deponun mamul rafı.
 */
export async function createWorkOrder(tx: DbOrTx, input: CreateWorkOrderInput, ctx: ActorCtx): Promise<WorkOrderWithMaterials> {
  const plannedQty = round4(D(input.plannedQty));
  if (plannedQty.lte(0)) throw new ValidationError('Planlanan miktar sıfırdan büyük olmalı');

  const [product] = await tx.select().from(products).where(eq(products.id, input.productId)).limit(1);
  if (!product) throw new NotFoundError('Ürün', input.productId);
  if (!product.isManufactured) throw new ValidationError(`${product.name} üretilebilir (isManufactured) olarak işaretli değil`);

  let bom: typeof boms.$inferSelect | undefined;
  if (input.bomId) {
    [bom] = await tx.select().from(boms).where(eq(boms.id, input.bomId)).limit(1);
    if (!bom) throw new NotFoundError('Reçete', input.bomId);
    if (bom.productId !== product.id) throw new ValidationError('Seçilen reçete bu ürüne ait değil');
  } else {
    [bom] = await tx.select().from(boms).where(and(eq(boms.productId, product.id), eq(boms.status, 'active'))).orderBy(desc(boms.version)).limit(1);
  }
  if (!bom) throw new DomainError('BOM_NOT_FOUND', `${product.name} için aktif reçete yok`, { productId: product.id });
  if (bom.status !== 'active') throw new ValidationError('Yalnızca aktif reçete ile iş emri açılabilir');

  const lineId = input.lineId ?? bom.defaultLineId;
  if (!lineId) throw new ValidationError('Hat seçin (reçetede varsayılan hat tanımlı değil)');
  const [line] = await tx.select().from(productionLines).where(eq(productionLines.id, lineId)).limit(1);
  if (!line) throw new NotFoundError('Üretim hattı', lineId);

  const [warehouse] = await tx.select().from(warehouses).where(eq(warehouses.id, input.warehouseId)).limit(1);
  if (!warehouse) throw new NotFoundError('Depo', input.warehouseId);

  const sourceLocation = await resolveWarehouseRoot(tx, warehouse.id, 'raw_material');
  const destLocation = await resolveDefaultPutawayLocation(tx, warehouse.id, 'finished');

  const docNo = await nextDocNo(tx, 'WO');
  const [wo] = await tx
    .insert(workOrders)
    .values({
      docNo, status: 'planned', productId: product.id, bomId: bom.id, lineId: line.id, warehouseId: warehouse.id,
      sourceLocationId: sourceLocation.id, destLocationId: destLocation.id, plannedQty: toDb(plannedQty), uomId: product.uomId,
      plannedStart: input.plannedStart ? new Date(input.plannedStart) : null, plannedEnd: input.plannedEnd ? new Date(input.plannedEnd) : null,
      salesOrderId: input.salesOrderId ?? null, priority: input.priority ?? 0, origin: input.origin ?? 'manual', note: input.note ?? null,
      createdBy: ctx.userId ?? null,
    })
    .returning();

  const exploded = await explodeBom(tx, bom.id, plannedQty);
  const materials: WorkOrderMaterialRow[] = [];
  for (const e of exploded) {
    const [row] = await tx
      .insert(workOrderMaterials)
      .values({
        workOrderId: wo!.id, bomLineId: e.line.id, productId: e.line.productId, plannedQty: toDb(round4(e.requiredQty)),
        uomId: e.line.uomId, isByproduct: e.line.isByproduct, sequence: e.line.sequence,
      })
      .returning();
    materials.push(row!);
  }

  if (input.salesOrderId) {
    await linkDocuments(tx, { sourceType: 'sales_order', sourceId: input.salesOrderId, targetType: 'work_order', targetId: wo!.id }, ctx);
  }
  await reindex(tx, wo!);
  await writeAudit(tx, { action: 'create', tableName: 'work_orders', recordId: wo!.id, summary: `İş emri ${docNo} oluşturuldu: ${product.name} × ${toDb(plannedQty)}`, after: wo }, ctx);

  return { workOrder: wo!, materials };
}

export async function getWorkOrderMaterials(tx: DbOrTx, workOrderId: string): Promise<WorkOrderMaterialRow[]> {
  return tx.select().from(workOrderMaterials).where(eq(workOrderMaterials.workOrderId, workOrderId)).orderBy(workOrderMaterials.sequence);
}

/* ------------------------------------------------------------------ */
/* Durum geçişleri                                                     */
/* ------------------------------------------------------------------ */

/**
 * planned → released. Yalnızca malzemelerin toplam eldeki (serbest) stoğunun planlanan miktarı
 * karşılayıp karşılamadığını bilgilendirici olarak kontrol eder (sert blok değil — depo eksik
 * malzemeyle de serbest bırakılabilir, fiili tüketim FEFO ile zaten doğrulanır).
 */
export async function releaseWorkOrder(tx: DbOrTx, workOrderId: string, ctx: ActorCtx): Promise<WorkOrderRow> {
  const wo = await loadWorkOrder(tx, workOrderId, true);
  if (wo.status !== 'planned') throw new DomainError('WO_NOT_PLANNED', `İş emri ${wo.docNo} planlı değil (durum: ${wo.status})`, { status: wo.status });
  const [updated] = await tx.update(workOrders).set({ status: 'released', updatedBy: ctx.userId ?? null }).where(eq(workOrders.id, workOrderId)).returning();
  await writeEvent(tx, workOrderId, 'note', ctx, { payload: { transition: 'released' } });
  await reindex(tx, updated!);
  await writeAudit(tx, { action: 'update', tableName: 'work_orders', recordId: workOrderId, summary: `İş emri ${wo.docNo} serbest bırakıldı`, before: { status: wo.status }, after: { status: 'released' } }, ctx);
  return updated!;
}

export async function startWorkOrder(tx: DbOrTx, workOrderId: string, ctx: ActorCtx, opts: { asOf?: Date } = {}): Promise<WorkOrderRow> {
  const wo = await loadWorkOrder(tx, workOrderId, true);
  if (!['released', 'planned'].includes(wo.status)) throw new DomainError('WO_NOT_STARTABLE', `İş emri ${wo.docNo} başlatılamaz (durum: ${wo.status})`, { status: wo.status });
  const now = opts.asOf ?? new Date();
  const [updated] = await tx
    .update(workOrders)
    .set({ status: 'in_progress', startedAt: wo.startedAt ?? now, operatorId: ctx.userId ?? wo.operatorId, updatedBy: ctx.userId ?? null })
    .where(eq(workOrders.id, workOrderId))
    .returning();
  await writeEvent(tx, workOrderId, 'start', ctx, { at: now });
  await reindex(tx, updated!);
  await writeAudit(tx, { action: 'update', tableName: 'work_orders', recordId: workOrderId, summary: `İş emri ${wo.docNo} başlatıldı`, before: { status: wo.status }, after: { status: 'in_progress' } }, ctx);
  return updated!;
}

type DowntimeReason = (typeof downtimes.$inferInsert)['reason'];
const DOWNTIME_REASON_TO_ENUM: Record<string, DowntimeReason> = {
  machine_failure: 'breakdown', material_wait: 'material_shortage', cleaning: 'cleaning', break: 'break', changeover: 'changeover', other: 'other',
};

export async function pauseWorkOrder(tx: DbOrTx, workOrderId: string, input: { reason: string; note?: string | null; asOf?: Date }, ctx: ActorCtx): Promise<WorkOrderRow> {
  const wo = await loadWorkOrder(tx, workOrderId, true);
  if (wo.status !== 'in_progress') throw new DomainError('WO_NOT_IN_PROGRESS', `İş emri ${wo.docNo} devam etmiyor (durum: ${wo.status})`, { status: wo.status });
  const now = input.asOf ?? new Date();
  const [updated] = await tx.update(workOrders).set({ status: 'paused', updatedBy: ctx.userId ?? null }).where(eq(workOrders.id, workOrderId)).returning();
  await writeEvent(tx, workOrderId, 'pause', ctx, { at: now, reason: input.reason, payload: { note: input.note ?? null } });
  await tx.insert(downtimes).values({
    lineId: wo.lineId, workOrderId, reason: DOWNTIME_REASON_TO_ENUM[input.reason] ?? 'other', isPlanned: false, startedAt: now, reportedBy: ctx.userId ?? null, note: input.note ?? null,
  });
  await reindex(tx, updated!);
  await writeAudit(tx, { action: 'update', tableName: 'work_orders', recordId: workOrderId, summary: `İş emri ${wo.docNo} duraklatıldı (${input.reason})`, before: { status: wo.status }, after: { status: 'paused' } }, ctx);
  return updated!;
}

export async function resumeWorkOrder(tx: DbOrTx, workOrderId: string, ctx: ActorCtx, opts: { asOf?: Date } = {}): Promise<WorkOrderRow> {
  const wo = await loadWorkOrder(tx, workOrderId, true);
  if (wo.status !== 'paused') throw new DomainError('WO_NOT_PAUSED', `İş emri ${wo.docNo} duraklatılmamış (durum: ${wo.status})`, { status: wo.status });
  const now = opts.asOf ?? new Date();

  const [openDowntime] = await tx.select().from(downtimes).where(and(eq(downtimes.workOrderId, workOrderId), eq(downtimes.lineId, wo.lineId))).orderBy(desc(downtimes.startedAt)).limit(1);
  let pauseMinutesDelta = 0;
  if (openDowntime && !openDowntime.endedAt) {
    pauseMinutesDelta = Math.max(0, Math.round((now.getTime() - openDowntime.startedAt.getTime()) / 60000));
    await tx.update(downtimes).set({ endedAt: now, minutes: pauseMinutesDelta }).where(eq(downtimes.id, openDowntime.id));
  }

  const [updated] = await tx
    .update(workOrders)
    .set({ status: 'in_progress', pauseMinutes: wo.pauseMinutes + pauseMinutesDelta, updatedBy: ctx.userId ?? null })
    .where(eq(workOrders.id, workOrderId))
    .returning();
  await writeEvent(tx, workOrderId, 'resume', ctx, { at: now, durationMinutes: pauseMinutesDelta || null });
  await reindex(tx, updated!);
  await writeAudit(tx, { action: 'update', tableName: 'work_orders', recordId: workOrderId, summary: `İş emri ${wo.docNo} devam ediyor`, before: { status: wo.status }, after: { status: 'in_progress' } }, ctx);
  return updated!;
}

export async function rescheduleWorkOrder(tx: DbOrTx, workOrderId: string, input: { lineId?: string; plannedStart?: string | Date | null; plannedEnd?: string | Date | null }, ctx: ActorCtx): Promise<WorkOrderRow> {
  const wo = await loadWorkOrder(tx, workOrderId, true);
  if (!OPEN_STATUSES.includes(wo.status)) throw new DomainError('WO_NOT_OPEN', `İş emri ${wo.docNo} planlanamaz (durum: ${wo.status})`, { status: wo.status });
  if (input.lineId) {
    const [line] = await tx.select().from(productionLines).where(eq(productionLines.id, input.lineId)).limit(1);
    if (!line) throw new NotFoundError('Üretim hattı', input.lineId);
  }
  const [updated] = await tx
    .update(workOrders)
    .set({
      lineId: input.lineId ?? wo.lineId,
      plannedStart: input.plannedStart !== undefined ? (input.plannedStart ? new Date(input.plannedStart) : null) : wo.plannedStart,
      plannedEnd: input.plannedEnd !== undefined ? (input.plannedEnd ? new Date(input.plannedEnd) : null) : wo.plannedEnd,
      updatedBy: ctx.userId ?? null,
    })
    .where(eq(workOrders.id, workOrderId))
    .returning();
  await reindex(tx, updated!);
  await writeAudit(tx, { action: 'update', tableName: 'work_orders', recordId: workOrderId, summary: `İş emri ${wo.docNo} yeniden planlandı`, before: { lineId: wo.lineId, plannedStart: wo.plannedStart }, after: { lineId: updated!.lineId, plannedStart: updated!.plannedStart } }, ctx);
  return updated!;
}

export async function cancelWorkOrder(tx: DbOrTx, workOrderId: string, input: { reason?: string | null }, ctx: ActorCtx): Promise<WorkOrderRow> {
  const wo = await loadWorkOrder(tx, workOrderId, true);
  if (!['planned', 'released'].includes(wo.status)) throw new DomainError('WO_NOT_CANCELLABLE', `İş emri ${wo.docNo} iptal edilemez (durum: ${wo.status}); tüketim başlamış iş emirleri kapatılmalı`, { status: wo.status });
  const [updated] = await tx.update(workOrders).set({ status: 'cancelled', updatedBy: ctx.userId ?? null }).where(eq(workOrders.id, workOrderId)).returning();
  await writeEvent(tx, workOrderId, 'note', ctx, { payload: { transition: 'cancelled', reason: input.reason ?? null } });
  await reindex(tx, updated!);
  await writeAudit(tx, { action: 'cancel', tableName: 'work_orders', recordId: workOrderId, summary: `İş emri ${wo.docNo} iptal edildi`, before: { status: wo.status }, after: { status: 'cancelled' } }, ctx);
  return updated!;
}

/* ------------------------------------------------------------------ */
/* Yardımcı sorgular (planlama/hatlar ekranları)                       */
/* ------------------------------------------------------------------ */

/** Bir hattaki açık (planlanmış/serbest/devam eden/duraklamış) iş emirleri — /uretim/hatlar, /operator */
export async function getOpenWorkOrdersForLine(tx: DbOrTx, lineId: string): Promise<WorkOrderRow[]> {
  return tx.select().from(workOrders).where(and(eq(workOrders.lineId, lineId), inArray(workOrders.status, OPEN_STATUSES))).orderBy(workOrders.priority, workOrders.plannedStart);
}
