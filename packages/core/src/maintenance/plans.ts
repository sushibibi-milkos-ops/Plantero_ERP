import { and, asc, eq, inArray, isNotNull, lte } from 'drizzle-orm';
import { maintenancePlans, maintenanceOrders, machines, type DbOrTx } from '@plantero/db';
import { nextDocNo } from '../sequences.js';
import { writeAudit } from '../audit/index.js';
import { indexDocument } from '../documents/chain.js';
import { NotFoundError, ValidationError } from '../auth/errors.js';
import { businessDate, addDays } from '../dates.js';
import type { ActorCtx } from '../types.js';

/**
 * Periyodik bakım planları — docs/modules/bakim.md §2.
 * `generateDueOrders` worker `maintenance-scheduler` (05:00) tarafından her sabah çağrılır: vadesi
 * `bugün + horizonDays` (varsayılan 3) içine düşen aktif planlar için otomatik `kind='preventive'`,
 * `status='planned'` bakım iş emri açar. "Şimdi üret" ekran eylemi aynı üretici fonksiyonu
 * (`generateOrderForPlan`) vade beklemeden çağırır. İkisi de idempotent: bir plan için zaten açık
 * (done/cancelled dışı) bir iş emri varsa yenisi açılmaz — worker'ın her gün tekrar çalışması ya da
 * kullanıcının "Şimdi üret"e art arda basması çift iş emri üretmez.
 */

export type MaintenancePlanRow = typeof maintenancePlans.$inferSelect;
export type MaintenanceOrderRow = typeof maintenanceOrders.$inferSelect;

export type IntervalUnit = 'day' | 'week' | 'month' | 'runtime_hours';
const OPEN_ORDER_STATUSES = ['reported', 'planned', 'in_progress', 'waiting_parts'] as const;

/**
 * Bir sonraki vade tarihi. `runtime_hours` birimi takvim tarihine çevrilemez (makine çalışma saati
 * biriktirme hızı burada bilinmiyor — `machines.runtimeHours` sayaç olarak tutuluyor ama günlük artış
 * tahmini bu modülün kapsamında değil); bu birimdeki planlar OTOMATİK üretilmez, yalnızca "Şimdi
 * üret" ile elle tetiklenir (bilinen sınırlama — rapora yazıldı).
 */
export function computeNextDueDate(fromIso: string, intervalValue: number, intervalUnit: IntervalUnit): string | null {
  if (intervalValue <= 0) return null;
  switch (intervalUnit) {
    case 'day':
      return addDays(fromIso, intervalValue);
    case 'week':
      return addDays(fromIso, intervalValue * 7);
    case 'month': {
      const d = new Date(`${fromIso}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + intervalValue);
      return d.toISOString().slice(0, 10);
    }
    case 'runtime_hours':
    default:
      return null;
  }
}

export type CreatePlanInput = {
  machineId: string;
  name: string;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  checklist?: string[];
  estimatedMinutes?: number;
  assigneeId?: string | null;
};

export async function createPlan(tx: DbOrTx, input: CreatePlanInput, ctx: ActorCtx): Promise<MaintenancePlanRow> {
  const [machine] = await tx.select().from(machines).where(eq(machines.id, input.machineId)).limit(1);
  if (!machine) throw new NotFoundError('Makine', input.machineId);
  if (!input.name.trim()) throw new ValidationError('Plan adı gerekli');
  if (input.intervalValue <= 0) throw new ValidationError('Aralık sıfırdan büyük olmalı');

  const nextDueAt = computeNextDueDate(businessDate(new Date()), input.intervalValue, input.intervalUnit);
  const [plan] = await tx
    .insert(maintenancePlans)
    .values({
      machineId: machine.id, name: input.name.trim(), intervalValue: input.intervalValue, intervalUnit: input.intervalUnit,
      checklist: input.checklist ?? [], estimatedMinutes: input.estimatedMinutes ?? 60, nextDueAt,
      assigneeId: input.assigneeId ?? null, createdBy: ctx.userId ?? null,
    })
    .returning();
  await writeAudit(tx, { action: 'create', tableName: 'maintenance_plans', recordId: plan!.id, summary: `Bakım planı oluşturuldu: ${plan!.name} (${machine.name})`, after: plan }, ctx);
  return plan!;
}

export type UpdatePlanInput = Partial<Omit<CreatePlanInput, 'machineId'>> & { isActive?: boolean };

export async function updatePlan(tx: DbOrTx, id: string, input: UpdatePlanInput, ctx: ActorCtx): Promise<MaintenancePlanRow> {
  const [plan] = await tx.select().from(maintenancePlans).where(eq(maintenancePlans.id, id)).limit(1);
  if (!plan) throw new NotFoundError('Bakım planı', id);
  if (input.intervalValue !== undefined && input.intervalValue <= 0) throw new ValidationError('Aralık sıfırdan büyük olmalı');

  const intervalValue = input.intervalValue ?? plan.intervalValue;
  const intervalUnit = (input.intervalUnit ?? plan.intervalUnit) as IntervalUnit;
  // Aralık/birim değiştiyse vade son yapılan tarihten (yoksa bugünden) yeniden hesaplanır.
  const intervalChanged = input.intervalValue !== undefined || input.intervalUnit !== undefined;
  const nextDueAt = intervalChanged ? computeNextDueDate(plan.lastDoneAt ?? businessDate(new Date()), intervalValue, intervalUnit) : plan.nextDueAt;

  const [updated] = await tx
    .update(maintenancePlans)
    .set({
      name: input.name?.trim() ?? plan.name, intervalValue, intervalUnit,
      checklist: input.checklist ?? plan.checklist, estimatedMinutes: input.estimatedMinutes ?? plan.estimatedMinutes,
      assigneeId: input.assigneeId !== undefined ? input.assigneeId : plan.assigneeId,
      isActive: input.isActive ?? plan.isActive, nextDueAt, updatedBy: ctx.userId ?? null,
    })
    .where(eq(maintenancePlans.id, id))
    .returning();
  await writeAudit(tx, { action: 'update', tableName: 'maintenance_plans', recordId: id, summary: `Bakım planı güncellendi: ${updated!.name}`, before: plan, after: updated }, ctx);
  return updated!;
}

/**
 * Bir plan için preventif iş emri üretir. Zaten açık bir iş emri varsa YENİ oluşturmaz (idempotent —
 * hem günlük worker'ın tekrar çalışması hem de "Şimdi üret"e art arda basılması güvenli).
 */
export async function generateOrderForPlan(tx: DbOrTx, plan: MaintenancePlanRow, ctx: ActorCtx, opts: { scheduledFor?: string } = {}): Promise<{ order: MaintenanceOrderRow; created: boolean }> {
  const [existing] = await tx
    .select()
    .from(maintenanceOrders)
    .where(and(eq(maintenanceOrders.planId, plan.id), inArray(maintenanceOrders.status, OPEN_ORDER_STATUSES)))
    .limit(1);
  if (existing) return { order: existing, created: false };

  const [machine] = await tx.select().from(machines).where(eq(machines.id, plan.machineId)).limit(1);
  if (!machine) throw new NotFoundError('Makine', plan.machineId);

  const scheduledFor = opts.scheduledFor ?? plan.nextDueAt ?? businessDate(new Date());
  const docNo = await nextDocNo(tx, 'MO');
  const checklistResults = (plan.checklist ?? []).map((item) => ({ item, done: false }));

  const [order] = await tx
    .insert(maintenanceOrders)
    .values({
      docNo, kind: 'preventive', status: 'planned', priority: 'normal', machineId: machine.id, planId: plan.id,
      title: `${plan.name} — ${machine.name}`, scheduledFor, assigneeId: plan.assigneeId,
      checklistResults, createdBy: ctx.userId ?? null,
    })
    .returning();

  // origin='manual': periyodik plan `document_links`/`document_type` kapsamında bir "belge" değildir
  // (documentTypeEnum'da `maintenance_plan` yok) — bu iş emrinin gerçek bir üst belgesi olmadığından
  // I7 (belge zinciri) kuralı gereği kaynak referanssız belgeler için doğru köken budur (CLAUDE.md #5).
  await indexDocument(tx, { type: 'maintenance_order', recordId: order!.id, docNo, status: 'planned', origin: 'manual', title: `Periyodik bakım: ${plan.name}`, docDate: new Date(`${scheduledFor}T00:00:00Z`) });
  await writeAudit(tx, { action: 'create', tableName: 'maintenance_orders', recordId: order!.id, summary: `Periyodik bakım iş emri ${docNo} otomatik oluşturuldu (${plan.name})`, after: order }, ctx);
  return { order: order!, created: true };
}

/** "Şimdi üret" ekran eylemi — vade beklemeden bugün için üretir. */
export async function generateOrderNow(tx: DbOrTx, planId: string, ctx: ActorCtx): Promise<{ order: MaintenanceOrderRow; created: boolean }> {
  const [plan] = await tx.select().from(maintenancePlans).where(eq(maintenancePlans.id, planId)).limit(1);
  if (!plan) throw new NotFoundError('Bakım planı', planId);
  return generateOrderForPlan(tx, plan, ctx, { scheduledFor: businessDate(new Date()) });
}

export type GenerateDueOrdersResult = { plansChecked: number; ordersCreated: number; ordersSkipped: number; createdOrderIds: string[] };

/** worker `maintenance-scheduler` (05:00): vadesi `bugün + horizonDays` içine düşen tüm aktif planlar. */
export async function generateDueOrders(tx: DbOrTx, ctx: ActorCtx, opts: { asOf?: Date; horizonDays?: number } = {}): Promise<GenerateDueOrdersResult> {
  const asOf = opts.asOf ?? new Date();
  const horizonDays = opts.horizonDays ?? 3;
  const threshold = addDays(businessDate(asOf), horizonDays);

  const duePlans = await tx
    .select()
    .from(maintenancePlans)
    .where(and(eq(maintenancePlans.isActive, true), isNotNull(maintenancePlans.nextDueAt), lte(maintenancePlans.nextDueAt, threshold)))
    .orderBy(asc(maintenancePlans.nextDueAt));

  let ordersCreated = 0;
  let ordersSkipped = 0;
  const createdOrderIds: string[] = [];
  for (const plan of duePlans) {
    const { order, created } = await generateOrderForPlan(tx, plan, ctx);
    if (created) {
      ordersCreated++;
      createdOrderIds.push(order.id);
    } else {
      ordersSkipped++;
    }
  }
  return { plansChecked: duePlans.length, ordersCreated, ordersSkipped, createdOrderIds };
}
