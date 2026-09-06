import { and, eq, isNull } from 'drizzle-orm';
import { maintenanceOrders, machines, maintenancePlans, downtimes, attachments, type DbOrTx } from '@plantero/db';
import { D, toDb } from '../money.js';
import { nextDocNo } from '../sequences.js';
import { writeAudit } from '../audit/index.js';
import { indexDocument, linkDocuments } from '../documents/chain.js';
import { postJournalEntry } from '../accounting/journal.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import { businessDate } from '../dates.js';
import { computeNextDueDate, type IntervalUnit } from './plans.js';
import { countOpenOrdersForMachine } from './machines.js';
import type { ActorCtx } from '../types.js';

/**
 * Bakım iş emri yaşam döngüsü — docs/modules/bakim.md §3.
 * Durum akışı: `reported` (fotoğraflı arıza bildirimi) / `planned` (periyodik plan) → `in_progress`
 * ⇄ `waiting_parts` → `done` | `cancelled`. Arıza bildirimi ANINDA makineyi `down` yapar ve açık bir
 * `downtimes` satırı başlatır (OEE kullanılabilirliğini o gün düşürür); "Tamamla" bu satırı kapatır
 * ve — başka açık iş emri kalmadıysa — makineyi `idle`'a döndürür (bkz. `machines.ts::countOpenOrdersForMachine`).
 * Fotoğraflar `attachments` tablosuna data URL olarak yazılır (`table_name='maintenance_orders'`).
 */

export type MaintenanceOrderRow = typeof maintenanceOrders.$inferSelect;
type MachineRow = typeof machines.$inferSelect;

const OPEN_STATUSES = ['reported', 'planned', 'in_progress', 'waiting_parts'] as const;

async function loadOrder(tx: DbOrTx, id: string, lock = false): Promise<MaintenanceOrderRow> {
  const q = tx.select().from(maintenanceOrders).where(eq(maintenanceOrders.id, id));
  const [row] = lock ? await q.for('update') : await q.limit(1);
  if (!row) throw new NotFoundError('Bakım iş emri', id);
  return row;
}

/**
 * `maintenance_orders` şemasında (dondurulmuş) bir `origin` kolonu yok — I7 (belge zinciri) için doğru
 * köken her `reindex` çağrısında `workOrderId`/`planId`'den YENİDEN türetilir (oluşturuşta kullanılan
 * mantıkla birebir aynı): üretim iş emrine bağlıysa 'chain', aksi halde (arıza kendi başına ya da
 * periyodik plandan — plan `documentTypeEnum`'da bir belge türü değil) 'manual'. `indexDocument`
 * `origin` verilmezse varsayılan olarak 'chain' yazar — bu satır olmadan her durum geçişi (start/
 * complete/cancel) sessizce I7 ihlali üretirdi (kök neden: seed sonrası `pnpm db:check` bulgusu).
 */
function documentOrigin(order: Pick<MaintenanceOrderRow, 'workOrderId'>): 'chain' | 'manual' {
  return order.workOrderId ? 'chain' : 'manual';
}

async function reindex(tx: DbOrTx, order: MaintenanceOrderRow, title: string): Promise<void> {
  await indexDocument(tx, { type: 'maintenance_order', recordId: order.id, docNo: order.docNo, status: order.status, origin: documentOrigin(order), title, docDate: order.reportedAt });
}

type PhotoInput = { fileName: string; mimeType: string; dataUrl: string };

async function insertPhotos(tx: DbOrTx, maintenanceOrderId: string, photos: PhotoInput[], ctx: ActorCtx): Promise<number> {
  if (photos.length === 0) return 0;
  for (const p of photos) {
    // data: URL'in base64 gövdesinden yaklaşık bayt boyutu (her 4 base64 karakteri ~3 bayt).
    const base64Len = p.dataUrl.includes(',') ? p.dataUrl.slice(p.dataUrl.indexOf(',') + 1).length : p.dataUrl.length;
    const sizeBytes = Math.max(0, Math.round((base64Len * 3) / 4));
    await tx.insert(attachments).values({ tableName: 'maintenance_orders', recordId: maintenanceOrderId, fileName: p.fileName, mimeType: p.mimeType, sizeBytes, storagePath: p.dataUrl, createdBy: ctx.userId ?? null });
  }
  return photos.length;
}

export type ReportBreakdownInput = {
  machineId: string;
  title: string;
  description?: string | null;
  priority?: MaintenanceOrderRow['priority'];
  photos?: PhotoInput[];
  /** Arıza bir üretim iş emri sırasında fark edildiyse (operatör ekranından bildirim) bağlanır. */
  workOrderId?: string | null;
};

/** Fotoğraflı arıza bildirimi — makine anında `down`, bir `downtimes` satırı açılır. */
export async function reportBreakdown(tx: DbOrTx, input: ReportBreakdownInput, ctx: ActorCtx): Promise<MaintenanceOrderRow> {
  if (!input.title.trim()) throw new ValidationError('Başlık gerekli');
  const [machine] = await tx.select().from(machines).where(eq(machines.id, input.machineId)).limit(1);
  if (!machine) throw new NotFoundError('Makine', input.machineId);

  const now = new Date();
  const docNo = await nextDocNo(tx, 'MO');
  const photos = input.photos ?? [];
  const [order] = await tx
    .insert(maintenanceOrders)
    .values({
      docNo, kind: 'corrective', status: 'reported', priority: input.priority ?? 'normal', machineId: machine.id,
      title: input.title.trim(), description: input.description ?? null, reportedBy: ctx.userId ?? null, reportedAt: now,
      workOrderId: input.workOrderId ?? null, photoCount: photos.length,
    })
    .returning();

  await insertPhotos(tx, order!.id, photos, ctx);
  await tx.update(machines).set({ status: 'down', updatedBy: ctx.userId ?? null }).where(eq(machines.id, machine.id));
  await tx.insert(downtimes).values({
    machineId: machine.id, lineId: machine.lineId, workOrderId: input.workOrderId ?? null, maintenanceOrderId: order!.id,
    reason: 'breakdown', isPlanned: false, startedAt: now, reportedBy: ctx.userId ?? null,
  });

  if (input.workOrderId) {
    await linkDocuments(tx, { sourceType: 'work_order', sourceId: input.workOrderId, targetType: 'maintenance_order', targetId: order!.id }, ctx);
  }
  await indexDocument(tx, { type: 'maintenance_order', recordId: order!.id, docNo, status: 'reported', origin: input.workOrderId ? 'chain' : 'manual', title: `Arıza: ${machine.name}`, docDate: now });
  await writeAudit(tx, {
    action: 'create', tableName: 'maintenance_orders', recordId: order!.id,
    summary: `Arıza bildirildi ${docNo}: ${machine.name} — ${input.title.trim()}${photos.length ? ` (${photos.length} fotoğraf)` : ''}`,
    after: order,
  }, ctx);
  return order!;
}

/** Ek fotoğraf (ör. onarım sonrası) — açık iş emrine sonradan eklenebilir. */
export async function addPhotos(tx: DbOrTx, orderId: string, photos: PhotoInput[], ctx: ActorCtx): Promise<MaintenanceOrderRow> {
  const order = await loadOrder(tx, orderId, true);
  const added = await insertPhotos(tx, orderId, photos, ctx);
  const [updated] = await tx.update(maintenanceOrders).set({ photoCount: order.photoCount + added, updatedBy: ctx.userId ?? null }).where(eq(maintenanceOrders.id, orderId)).returning();
  await writeAudit(tx, { action: 'update', tableName: 'maintenance_orders', recordId: orderId, summary: `${added} fotoğraf eklendi (${order.docNo})` }, ctx);
  return updated!;
}

/** planned/reported/waiting_parts → in_progress. Makine henüz `down` değilse (periyodik/kontrol) `maintenance`'a alınır. */
export async function startOrder(tx: DbOrTx, orderId: string, ctx: ActorCtx, opts: { asOf?: Date } = {}): Promise<MaintenanceOrderRow> {
  const order = await loadOrder(tx, orderId, true);
  if (!(['reported', 'planned', 'waiting_parts'] as const).includes(order.status as 'reported' | 'planned' | 'waiting_parts')) {
    throw new DomainError('MO_NOT_STARTABLE', `İş emri ${order.docNo} başlatılamaz (durum: ${order.status})`, { status: order.status });
  }
  const now = opts.asOf ?? new Date();
  const [updated] = await tx
    .update(maintenanceOrders)
    .set({ status: 'in_progress', assigneeId: ctx.userId ?? order.assigneeId, startedAt: order.startedAt ?? now, updatedBy: ctx.userId ?? null })
    .where(eq(maintenanceOrders.id, orderId))
    .returning();

  const [machine] = await tx.select().from(machines).where(eq(machines.id, order.machineId)).limit(1);
  if (machine && machine.status !== 'down') {
    await tx.update(machines).set({ status: 'maintenance', updatedBy: ctx.userId ?? null }).where(eq(machines.id, machine.id));
  }
  await reindex(tx, updated!, `${order.kind === 'corrective' ? 'Arıza' : order.kind === 'inspection' ? 'Kontrol' : 'Periyodik bakım'}: ${order.title}`);
  await writeAudit(tx, { action: 'update', tableName: 'maintenance_orders', recordId: orderId, summary: `İş emri ${order.docNo} işleme alındı`, before: { status: order.status }, after: { status: 'in_progress' } }, ctx);
  return updated!;
}

export async function markWaitingParts(tx: DbOrTx, orderId: string, input: { note?: string | null }, ctx: ActorCtx): Promise<MaintenanceOrderRow> {
  const order = await loadOrder(tx, orderId, true);
  if (order.status !== 'in_progress') throw new DomainError('MO_NOT_IN_PROGRESS', `İş emri ${order.docNo} yürütülmüyor (durum: ${order.status})`, { status: order.status });
  const [updated] = await tx.update(maintenanceOrders).set({ status: 'waiting_parts', note: input.note ?? order.note, updatedBy: ctx.userId ?? null }).where(eq(maintenanceOrders.id, orderId)).returning();
  await reindex(tx, updated!, order.title);
  await writeAudit(tx, { action: 'update', tableName: 'maintenance_orders', recordId: orderId, summary: `İş emri ${order.docNo} parça bekliyor`, before: { status: order.status }, after: { status: 'waiting_parts' } }, ctx);
  return updated!;
}

export type ChecklistResult = { item: string; done: boolean; note?: string };

export async function updateChecklist(tx: DbOrTx, orderId: string, checklistResults: ChecklistResult[], ctx: ActorCtx): Promise<MaintenanceOrderRow> {
  const order = await loadOrder(tx, orderId);
  const [updated] = await tx.update(maintenanceOrders).set({ checklistResults, updatedBy: ctx.userId ?? null }).where(eq(maintenanceOrders.id, orderId)).returning();
  await writeAudit(tx, { action: 'update', tableName: 'maintenance_orders', recordId: orderId, summary: `İş emri ${order.docNo} kontrol listesi güncellendi` }, ctx);
  return updated!;
}

export type UpdateCostsInput = { laborMinutes?: number; laborCost?: string; partsCost?: string; rootCause?: string | null; resolution?: string | null };

export async function updateDiagnosis(tx: DbOrTx, orderId: string, input: UpdateCostsInput, ctx: ActorCtx): Promise<MaintenanceOrderRow> {
  const order = await loadOrder(tx, orderId);
  // P0 düzeltmesi (Tur 2 regresyonu): `completeOrder`/`cancelOrder` gibi kardeşleri MO_ALREADY_CLOSED
  // koruması taşırken bu fonksiyon taşımıyordu — 'done' bir iş emrinde partsCost/laborCost sessizce
  // güncellenebiliyordu, ama tamamlanma anında 730/100 hesabına atılan yevmiye fişi (bkz. completeOrder)
  // ASLA yeniden atılmıyor/düzeltilmiyor: muhasebe kalıcı olarak maintenance_orders.parts_cost+labor_cost'tan
  // sapıyordu (checks/53_maintenance_journal_amount.sql). Kapalı bir iş emrinde maliyet/tanı değişikliği
  // gerekiyorsa (ör. geç gelen tedarikçi faturası) ayrı bir düzeltme fişi atan bir servis gerekir — burada
  // sessiz üzerine yazma değil, sibling'lerle aynı sert durum koruması.
  if (order.status === 'done' || order.status === 'cancelled') {
    throw new DomainError('MO_ALREADY_CLOSED', `İş emri ${order.docNo} zaten kapalı (durum: ${order.status})`, { status: order.status });
  }
  const [updated] = await tx
    .update(maintenanceOrders)
    .set({
      laborMinutes: input.laborMinutes ?? order.laborMinutes,
      laborCost: input.laborCost !== undefined ? toDb(D(input.laborCost)) : order.laborCost,
      partsCost: input.partsCost !== undefined ? toDb(D(input.partsCost)) : order.partsCost,
      rootCause: input.rootCause !== undefined ? input.rootCause : order.rootCause,
      resolution: input.resolution !== undefined ? input.resolution : order.resolution,
      updatedBy: ctx.userId ?? null,
    })
    .where(eq(maintenanceOrders.id, orderId))
    .returning();
  await writeAudit(tx, { action: 'update', tableName: 'maintenance_orders', recordId: orderId, summary: `İş emri ${order.docNo} maliyet/tanı güncellendi` }, ctx);
  return updated!;
}

async function closeMachineIfNoOpenOrders(tx: DbOrTx, machine: MachineRow, finishedOrderId: string, ctx: ActorCtx): Promise<void> {
  const remaining = await countOpenOrdersForMachine(tx, machine.id, finishedOrderId);
  if (remaining === 0 && machine.status !== 'retired') {
    await tx.update(machines).set({ status: 'idle', updatedBy: ctx.userId ?? null }).where(eq(machines.id, machine.id));
  }
}

async function closeOpenDowntime(tx: DbOrTx, orderId: string, asOf: Date): Promise<number> {
  const [open] = await tx.select().from(downtimes).where(and(eq(downtimes.maintenanceOrderId, orderId), isNull(downtimes.endedAt))).limit(1);
  if (!open) return 0;
  const minutes = Math.max(0, Math.round((asOf.getTime() - open.startedAt.getTime()) / 60000));
  await tx.update(downtimes).set({ endedAt: asOf, minutes }).where(eq(downtimes.id, open.id));
  return minutes;
}

export type CompleteOrderInput = { rootCause?: string | null; resolution?: string | null; laborMinutes?: number; laborCost?: string; partsCost?: string; asOf?: Date };

/**
 * Tamamla: açık duruşu kapatır (varsa), makineyi (başka açık iş emri yoksa) `idle`'a döndürür,
 * plandan üretildiyse planın `lastDoneAt`/`nextDueAt`'ını ilerletir.
 */
export async function completeOrder(tx: DbOrTx, orderId: string, input: CompleteOrderInput, ctx: ActorCtx): Promise<MaintenanceOrderRow> {
  const order = await loadOrder(tx, orderId, true);
  if (order.status === 'done' || order.status === 'cancelled') {
    throw new DomainError('MO_ALREADY_CLOSED', `İş emri ${order.docNo} zaten kapalı (durum: ${order.status})`, { status: order.status });
  }
  const now = input.asOf ?? new Date();
  const downtimeMinutes = await closeOpenDowntime(tx, orderId, now);

  const [updated] = await tx
    .update(maintenanceOrders)
    .set({
      status: 'done', finishedAt: now, downtimeMinutes: downtimeMinutes || order.downtimeMinutes,
      rootCause: input.rootCause !== undefined ? input.rootCause : order.rootCause,
      resolution: input.resolution !== undefined ? input.resolution : order.resolution,
      laborMinutes: input.laborMinutes ?? order.laborMinutes,
      laborCost: input.laborCost !== undefined ? toDb(D(input.laborCost)) : order.laborCost,
      partsCost: input.partsCost !== undefined ? toDb(D(input.partsCost)) : order.partsCost,
      updatedBy: ctx.userId ?? null,
    })
    .where(eq(maintenanceOrders.id, orderId))
    .returning();

  const [machine] = await tx.select().from(machines).where(eq(machines.id, order.machineId)).limit(1);
  if (machine) await closeMachineIfNoOpenOrders(tx, machine, orderId, ctx);

  // I51 kök neden düzeltmesi: bakım maliyeti (işçilik+parça) yalnızca `maintenance_orders` üzerinde
  // sayı olarak kalıyor, hiçbir mizanda görünmüyordu (CLAUDE.md "muhasebe yazımı yalnızca
  // postJournalEntry" ilkesinin ihlali). Tamamlanma anındaki NİHAİ maliyet (`updated`) tek seferlik
  // bir fişe dönüştürülür — `completeOrder` yalnızca açık bir iş emrinde çalışır (üstteki
  // MO_ALREADY_CLOSED koruması) ve durum makinesi aynı emri ikinci kez tamamlatamaz, dolayısıyla bu
  // satır aynı iş emri için asla iki kez çalışmaz (çift kayıt riski yok). 730 "Genel Üretim
  // Giderleri" bakım/onarım maliyetinin standart TDHP karşılığı; karşı taraf 100 Kasa (saha bakımı
  // nakit/küçük harcama varsayımı — cari/banka bilgisi maintenance_orders şemasında yok).
  const totalCost = D(updated!.partsCost).plus(D(updated!.laborCost));
  if (totalCost.gt(0)) {
    await postJournalEntry(tx, {
      ledger: 'both',
      journalCode: 'GEN',
      entryDate: now,
      description: `Bakım maliyeti: ${order.docNo}${machine ? ` — ${machine.name}` : ''}`,
      refType: 'maintenance_order',
      refId: order.id,
      refNo: order.docNo,
      origin: documentOrigin(order),
      lines: [
        { accountCode: '730', debit: totalCost, description: `${order.docNo} işçilik + parça maliyeti` },
        { accountCode: '100', credit: totalCost },
      ],
    }, ctx);
  }

  if (order.planId) {
    const [plan] = await tx.select().from(maintenancePlans).where(eq(maintenancePlans.id, order.planId)).limit(1);
    if (plan) {
      const lastDoneAt = businessDate(now);
      const nextDueAt = computeNextDueDate(lastDoneAt, plan.intervalValue, plan.intervalUnit as IntervalUnit);
      await tx.update(maintenancePlans).set({ lastDoneAt, nextDueAt, updatedBy: ctx.userId ?? null }).where(eq(maintenancePlans.id, plan.id));
    }
  }

  await reindex(tx, updated!, order.title);
  await writeAudit(tx, { action: 'post', tableName: 'maintenance_orders', recordId: orderId, summary: `İş emri ${order.docNo} tamamlandı (${downtimeMinutes || order.downtimeMinutes} dk duruş)`, before: { status: order.status }, after: updated }, ctx);
  return updated!;
}

export async function cancelOrder(tx: DbOrTx, orderId: string, input: { reason?: string | null }, ctx: ActorCtx): Promise<MaintenanceOrderRow> {
  const order = await loadOrder(tx, orderId, true);
  if (order.status === 'done' || order.status === 'cancelled') {
    throw new DomainError('MO_ALREADY_CLOSED', `İş emri ${order.docNo} zaten kapalı (durum: ${order.status})`, { status: order.status });
  }
  const now = new Date();
  await closeOpenDowntime(tx, orderId, now);
  const [updated] = await tx.update(maintenanceOrders).set({ status: 'cancelled', note: input.reason ?? order.note, updatedBy: ctx.userId ?? null }).where(eq(maintenanceOrders.id, orderId)).returning();

  const [machine] = await tx.select().from(machines).where(eq(machines.id, order.machineId)).limit(1);
  if (machine) await closeMachineIfNoOpenOrders(tx, machine, orderId, ctx);

  await reindex(tx, updated!, order.title);
  await writeAudit(tx, { action: 'cancel', tableName: 'maintenance_orders', recordId: orderId, summary: `İş emri ${order.docNo} iptal edildi`, before: { status: order.status }, after: { status: 'cancelled' } }, ctx);
  return updated!;
}

export { OPEN_STATUSES as OPEN_MAINTENANCE_ORDER_STATUSES };
