'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@plantero/db';
import {
  reportBreakdown, startOrder, markWaitingParts, updateChecklist, updateDiagnosis, completeOrder, cancelOrder, addPhotos,
} from '@plantero/core/maintenance/orders';
import { createPlan as createPlanCore, updatePlan, generateOrderNow } from '@plantero/core/maintenance/plans';
import { requirePermission } from '@/lib/auth';
import { withAudit } from '@/lib/actions';

function revalidateMaintenance(machineId?: string, orderId?: string) {
  revalidatePath('/bakim/makineler');
  if (machineId) revalidatePath(`/bakim/makineler/${machineId}`);
  revalidatePath('/bakim/planlar');
  revalidatePath('/bakim/is-emirleri');
  if (orderId) revalidatePath(`/bakim/is-emirleri/${orderId}`);
  revalidatePath('/bakim/oee');
}

/* ==================================================================== */
/* Arıza bildirimi (fotoğraflı)                                         */
/* ==================================================================== */

const photoSchema = z.object({ fileName: z.string().min(1), mimeType: z.string().min(1), dataUrl: z.string().startsWith('data:') });

const reportSchema = z.object({
  machineId: z.string().uuid('Makine seçin'),
  title: z.string().trim().min(1, 'Başlık gerekli'),
  description: z.string().trim().optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  photos: z.array(photoSchema).max(6, 'En fazla 6 fotoğraf').optional(),
  workOrderId: z.string().uuid().optional().nullable(),
});

export const reportBreakdownAction = withAudit('maintenance.reportBreakdown', async (raw: z.infer<typeof reportSchema>) => {
  const user = await requirePermission('maintenance.report');
  const input = reportSchema.parse(raw);
  const order = await db.transaction((tx) => reportBreakdown(tx, input, user.actor));
  revalidateMaintenance(input.machineId, order.id);
  return {
    data: { id: order.id, docNo: order.docNo },
    audit: { action: 'create', tableName: 'maintenance_orders', recordId: order.id, summary: `Arıza bildirildi: ${order.docNo}`, after: order },
  };
});

/* ==================================================================== */
/* İş emri yaşam döngüsü                                                */
/* ==================================================================== */

const idSchema = z.object({ id: z.string().uuid() });

export const startOrderAction = withAudit('maintenance.startOrder', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('maintenance.execute');
  const input = idSchema.parse(raw);
  const order = await db.transaction((tx) => startOrder(tx, input.id, user.actor));
  revalidateMaintenance(order.machineId, order.id);
  return { data: { status: order.status }, audit: { action: 'update', tableName: 'maintenance_orders', recordId: order.id, summary: `İş emri ${order.docNo} işleme alındı` } };
});

const waitingSchema = z.object({ id: z.string().uuid(), note: z.string().trim().optional().nullable() });

export const markWaitingPartsAction = withAudit('maintenance.markWaitingParts', async (raw: z.infer<typeof waitingSchema>) => {
  const user = await requirePermission('maintenance.execute');
  const input = waitingSchema.parse(raw);
  const order = await db.transaction((tx) => markWaitingParts(tx, input.id, { note: input.note }, user.actor));
  revalidateMaintenance(order.machineId, order.id);
  return { data: { status: order.status }, audit: { action: 'update', tableName: 'maintenance_orders', recordId: order.id, summary: `İş emri ${order.docNo} parça bekliyor` } };
});

const checklistSchema = z.object({ id: z.string().uuid(), checklistResults: z.array(z.object({ item: z.string(), done: z.boolean(), note: z.string().optional() })) });

export const updateChecklistAction = withAudit('maintenance.updateChecklist', async (raw: z.infer<typeof checklistSchema>) => {
  const user = await requirePermission('maintenance.execute');
  const input = checklistSchema.parse(raw);
  const order = await db.transaction((tx) => updateChecklist(tx, input.id, input.checklistResults, user.actor));
  revalidateMaintenance(order.machineId, order.id);
  return { data: { checklistResults: order.checklistResults } };
});

const diagnosisSchema = z.object({
  id: z.string().uuid(), rootCause: z.string().trim().optional().nullable(), resolution: z.string().trim().optional().nullable(),
  laborMinutes: z.number().int().min(0).optional(), laborCost: z.string().optional(), partsCost: z.string().optional(),
});

export const updateDiagnosisAction = withAudit('maintenance.updateDiagnosis', async (raw: z.infer<typeof diagnosisSchema>) => {
  const user = await requirePermission('maintenance.execute');
  const input = diagnosisSchema.parse(raw);
  const order = await db.transaction((tx) => updateDiagnosis(tx, input.id, input, user.actor));
  revalidateMaintenance(order.machineId, order.id);
  return { data: { id: order.id } };
});

const completeSchema = z.object({
  id: z.string().uuid(), rootCause: z.string().trim().optional().nullable(), resolution: z.string().trim().optional().nullable(),
  laborMinutes: z.number().int().min(0).optional(), laborCost: z.string().optional(), partsCost: z.string().optional(),
});

export const completeOrderAction = withAudit('maintenance.completeOrder', async (raw: z.infer<typeof completeSchema>) => {
  const user = await requirePermission('maintenance.execute');
  const input = completeSchema.parse(raw);
  const order = await db.transaction((tx) => completeOrder(tx, input.id, input, user.actor));
  revalidateMaintenance(order.machineId, order.id);
  return { data: { status: order.status, downtimeMinutes: order.downtimeMinutes }, audit: { action: 'post', tableName: 'maintenance_orders', recordId: order.id, summary: `İş emri ${order.docNo} tamamlandı`, after: order } };
});

const cancelSchema = z.object({ id: z.string().uuid(), reason: z.string().trim().optional().nullable() });

export const cancelOrderAction = withAudit('maintenance.cancelOrder', async (raw: z.infer<typeof cancelSchema>) => {
  const user = await requirePermission('maintenance.execute');
  const input = cancelSchema.parse(raw);
  const order = await db.transaction((tx) => cancelOrder(tx, input.id, { reason: input.reason }, user.actor));
  revalidateMaintenance(order.machineId, order.id);
  return { data: { status: order.status }, audit: { action: 'cancel', tableName: 'maintenance_orders', recordId: order.id, summary: `İş emri ${order.docNo} iptal edildi` } };
});

const addPhotosSchema = z.object({ id: z.string().uuid(), photos: z.array(photoSchema).min(1).max(6) });

export const addPhotosAction = withAudit('maintenance.addPhotos', async (raw: z.infer<typeof addPhotosSchema>) => {
  const user = await requirePermission('maintenance.report');
  const input = addPhotosSchema.parse(raw);
  const order = await db.transaction((tx) => addPhotos(tx, input.id, input.photos, user.actor));
  revalidateMaintenance(order.machineId, order.id);
  return { data: { photoCount: order.photoCount } };
});

/* ==================================================================== */
/* Periyodik planlar                                                    */
/* ==================================================================== */

const createPlanSchema = z.object({
  machineId: z.string().uuid('Makine seçin'), name: z.string().trim().min(1, 'Plan adı gerekli'),
  intervalValue: z.number().int().min(1), intervalUnit: z.enum(['day', 'week', 'month', 'runtime_hours']),
  checklist: z.array(z.string().trim().min(1)).default([]), estimatedMinutes: z.number().int().min(1).default(60),
  assigneeId: z.string().uuid().optional().nullable(),
});

export const createPlanAction = withAudit('maintenance.createPlan', async (raw: z.infer<typeof createPlanSchema>) => {
  const user = await requirePermission('maintenance.plan');
  const input = createPlanSchema.parse(raw);
  const plan = await db.transaction((tx) => createPlanCore(tx, input, user.actor));
  revalidateMaintenance(input.machineId);
  return { data: { id: plan.id }, audit: { action: 'create', tableName: 'maintenance_plans', recordId: plan.id, summary: `Bakım planı oluşturuldu: ${plan.name}`, after: plan } };
});

const setPlanActiveSchema = z.object({ id: z.string().uuid(), isActive: z.boolean() });

export const setPlanActiveAction = withAudit('maintenance.setPlanActive', async (raw: z.infer<typeof setPlanActiveSchema>) => {
  const user = await requirePermission('maintenance.plan');
  const input = setPlanActiveSchema.parse(raw);
  const plan = await db.transaction((tx) => updatePlan(tx, input.id, { isActive: input.isActive }, user.actor));
  revalidateMaintenance(plan.machineId);
  return { data: { isActive: plan.isActive }, audit: { action: 'update', tableName: 'maintenance_plans', recordId: plan.id, summary: `Bakım planı ${plan.isActive ? 'aktifleştirildi' : 'pasifleştirildi'}: ${plan.name}` } };
});

export const generateOrderNowAction = withAudit('maintenance.generateOrderNow', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('maintenance.plan');
  const input = idSchema.parse(raw);
  const { order, created } = await db.transaction((tx) => generateOrderNow(tx, input.id, user.actor));
  revalidateMaintenance(order.machineId, order.id);
  return {
    data: { orderId: order.id, docNo: order.docNo, created },
    message: created ? `İş emri oluşturuldu: ${order.docNo}` : `Zaten açık bir iş emri var: ${order.docNo}`,
  };
});
