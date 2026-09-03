'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db, schema } from '@plantero/db';
import {
  D, explodeBom, getOnHand,
  createWorkOrder, releaseWorkOrder, startWorkOrder, pauseWorkOrder, resumeWorkOrder, cancelWorkOrder, rescheduleWorkOrder,
  scanConsume, consumeLot, autoConsumeRemaining,
  recordScrap, finishWorkOrder, closeWorkOrder,
} from '@plantero/core';
import { verifyPin } from '@plantero/core/auth/password';
import { createSession, destroySession } from '@plantero/core/auth/session';
import { writeAudit } from '@plantero/core/audit/index';
import { requirePermission } from '@/lib/auth';
import { withAudit } from '@/lib/actions';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';

/* ==================================================================== */
/* Malzeme önizleme (BOM patlatma) — oluşturma formunda canlı çağrılır   */
/* ==================================================================== */

const previewSchema = z.object({ bomId: z.string().uuid(), plannedQty: z.string().min(1), warehouseId: z.string().uuid() });

export type MaterialPreviewLine = {
  productId: string; sku: string; name: string; uomCode: string; requiredQty: string; availableQty: string; shortQty: string; isByproduct: boolean;
};

export const previewMaterialsAction = withAudit('production.previewMaterials', async (raw: z.infer<typeof previewSchema>) => {
  await requirePermission('production.plan');
  const input = previewSchema.parse(raw);
  const exploded = await explodeBom(db, input.bomId, D(input.plannedQty));
  const { products, uoms } = schema;
  const lines: MaterialPreviewLine[] = [];
  for (const e of exploded) {
    const [product] = await db.select({ p: products, uomCode: uoms.code }).from(products).innerJoin(uoms, eq(uoms.id, products.uomId)).where(eq(products.id, e.line.productId)).limit(1);
    if (!product) continue;
    const onHand = await getOnHand(db, { productId: e.line.productId, warehouseId: input.warehouseId, includeQuarantine: false });
    const short = e.requiredQty.minus(onHand.available);
    lines.push({
      productId: e.line.productId, sku: product.p.sku, name: product.p.name, uomCode: product.uomCode,
      requiredQty: e.requiredQty.toFixed(4), availableQty: onHand.available.toFixed(4),
      shortQty: short.gt(0) ? short.toFixed(4) : '0.0000', isByproduct: e.line.isByproduct,
    });
  }
  return { data: lines };
});

/* ==================================================================== */
/* İş emri yaşam döngüsü                                                */
/* ==================================================================== */

const createSchema = z.object({
  productId: z.string().uuid(), bomId: z.string().uuid(), plannedQty: z.string().min(1), lineId: z.string().uuid(),
  warehouseId: z.string().uuid(), plannedStart: z.string().optional().nullable(), plannedEnd: z.string().optional().nullable(),
  salesOrderId: z.string().uuid().optional().nullable(), note: z.string().trim().optional().nullable(),
});

export const createWorkOrderAction = withAudit('production.createWorkOrder', async (raw: z.infer<typeof createSchema>) => {
  const user = await requirePermission('production.plan');
  const input = createSchema.parse(raw);
  const { workOrder } = await db.transaction((tx) =>
    createWorkOrder(tx, {
      productId: input.productId, bomId: input.bomId, plannedQty: D(input.plannedQty), lineId: input.lineId, warehouseId: input.warehouseId,
      plannedStart: input.plannedStart || null, plannedEnd: input.plannedEnd || null, salesOrderId: input.salesOrderId || null, note: input.note || null,
    }, user.actor),
  );
  revalidatePath('/uretim/is-emirleri');
  revalidatePath('/uretim/planlama');
  return { data: { id: workOrder.id, docNo: workOrder.docNo }, audit: { action: 'create', tableName: 'work_orders', recordId: workOrder.id, summary: `İş emri ${workOrder.docNo} oluşturuldu`, after: workOrder } };
});

const idSchema = z.object({ id: z.string().uuid() });

function revalidateWo(id: string) {
  revalidatePath('/uretim/is-emirleri');
  revalidatePath(`/uretim/is-emirleri/${id}`);
  revalidatePath('/uretim/planlama');
  revalidatePath('/uretim/hatlar');
  revalidatePath('/operator');
}

export const releaseWorkOrderAction = withAudit('production.releaseWorkOrder', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('production.plan');
  const input = idSchema.parse(raw);
  const wo = await db.transaction((tx) => releaseWorkOrder(tx, input.id, user.actor));
  revalidateWo(wo.id);
  return { data: { status: wo.status }, audit: { action: 'update', tableName: 'work_orders', recordId: wo.id, summary: `İş emri ${wo.docNo} serbest bırakıldı` } };
});

export const startWorkOrderAction = withAudit('production.startWorkOrder', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('production.operate');
  const input = idSchema.parse(raw);
  const wo = await db.transaction((tx) => startWorkOrder(tx, input.id, user.actor));
  revalidateWo(wo.id);
  return { data: { status: wo.status }, audit: { action: 'update', tableName: 'work_orders', recordId: wo.id, summary: `İş emri ${wo.docNo} başlatıldı` } };
});

const pauseSchema = z.object({ id: z.string().uuid(), reason: z.string().min(1), note: z.string().trim().optional().nullable() });

export const pauseWorkOrderAction = withAudit('production.pauseWorkOrder', async (raw: z.infer<typeof pauseSchema>) => {
  const user = await requirePermission('production.operate');
  const input = pauseSchema.parse(raw);
  const wo = await db.transaction((tx) => pauseWorkOrder(tx, input.id, { reason: input.reason, note: input.note }, user.actor));
  revalidateWo(wo.id);
  return { data: { status: wo.status }, audit: { action: 'update', tableName: 'work_orders', recordId: wo.id, summary: `İş emri ${wo.docNo} duraklatıldı` } };
});

export const resumeWorkOrderAction = withAudit('production.resumeWorkOrder', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('production.operate');
  const input = idSchema.parse(raw);
  const wo = await db.transaction((tx) => resumeWorkOrder(tx, input.id, user.actor));
  revalidateWo(wo.id);
  return { data: { status: wo.status }, audit: { action: 'update', tableName: 'work_orders', recordId: wo.id, summary: `İş emri ${wo.docNo} devam ediyor` } };
});

const cancelSchema = z.object({ id: z.string().uuid(), reason: z.string().trim().optional().nullable() });

export const cancelWorkOrderAction = withAudit('production.cancelWorkOrder', async (raw: z.infer<typeof cancelSchema>) => {
  const user = await requirePermission('production.plan');
  const input = cancelSchema.parse(raw);
  const wo = await db.transaction((tx) => cancelWorkOrder(tx, input.id, { reason: input.reason }, user.actor));
  revalidateWo(wo.id);
  return { data: { status: wo.status }, audit: { action: 'cancel', tableName: 'work_orders', recordId: wo.id, summary: `İş emri ${wo.docNo} iptal edildi` } };
});

const rescheduleSchema = z.object({ id: z.string().uuid(), lineId: z.string().uuid().optional(), plannedStart: z.string().optional().nullable() });

export const rescheduleWorkOrderAction = withAudit('production.rescheduleWorkOrder', async (raw: z.infer<typeof rescheduleSchema>) => {
  const user = await requirePermission('production.plan');
  const input = rescheduleSchema.parse(raw);
  const wo = await db.transaction((tx) => rescheduleWorkOrder(tx, input.id, { lineId: input.lineId, plannedStart: input.plannedStart }, user.actor));
  revalidateWo(wo.id);
  return { data: { lineId: wo.lineId, plannedStart: wo.plannedStart }, audit: { action: 'update', tableName: 'work_orders', recordId: wo.id, summary: `İş emri ${wo.docNo} yeniden planlandı` } };
});

/* ==================================================================== */
/* Operatör — okut / fire / bitir                                       */
/* ==================================================================== */

const scanSchema = z.object({ workOrderId: z.string().uuid(), code: z.string().trim().min(1), forceOverride: z.boolean().optional() });

export const scanConsumeAction = withAudit('production.scanConsume', async (raw: z.infer<typeof scanSchema>) => {
  const user = await requirePermission('production.operate');
  const input = scanSchema.parse(raw);
  const result = await db.transaction((tx) => scanConsume(tx, { workOrderId: input.workOrderId, code: input.code, forceOverride: input.forceOverride }, user.actor));
  if (result.fefoWarning) return { data: result };
  revalidateWo(input.workOrderId);
  return {
    data: result,
    audit: { action: 'post', tableName: 'work_order_consumptions', recordId: result.consumption!.id, summary: `Malzeme okutuldu: ${input.code} (${result.consumption!.qty})` },
  };
});

const consumeLotSchema = z.object({ workOrderId: z.string().uuid(), lotId: z.string().uuid(), qty: z.string().min(1), forceOverride: z.boolean().optional() });

export const consumeLotAction = withAudit('production.consumeLot', async (raw: z.infer<typeof consumeLotSchema>) => {
  const user = await requirePermission('production.operate');
  const input = consumeLotSchema.parse(raw);
  const result = await db.transaction((tx) => consumeLot(tx, { workOrderId: input.workOrderId, lotId: input.lotId, qty: D(input.qty), forceOverride: input.forceOverride }, user.actor));
  if (result.fefoWarning) return { data: result };
  revalidateWo(input.workOrderId);
  return { data: result, audit: { action: 'post', tableName: 'work_order_consumptions', recordId: result.consumption!.id, summary: `Lot tüketildi (${result.consumption!.qty})` } };
});

export const autoConsumeRemainingAction = withAudit('production.autoConsumeRemaining', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('production.operate');
  const input = idSchema.parse(raw);
  const results = await db.transaction((tx) => autoConsumeRemaining(tx, input.id, user.actor));
  revalidateWo(input.id);
  return { data: { count: results.length }, audit: { action: 'post', tableName: 'work_order_consumptions', recordId: input.id, summary: `Reçeteye göre ${results.length} satır otomatik tüketildi` } };
});

const scrapSchema = z.object({ workOrderId: z.string().uuid(), qty: z.string().min(1), reason: z.enum(['spill', 'burnt', 'contamination', 'packaging', 'startup', 'other']), stage: z.enum(['hammadde', 'proses', 'ambalaj']), note: z.string().trim().optional().nullable() });

export const recordScrapAction = withAudit('production.recordScrap', async (raw: z.infer<typeof scrapSchema>) => {
  const user = await requirePermission('production.operate');
  const input = scrapSchema.parse(raw);
  const scrap = await db.transaction((tx) => recordScrap(tx, { workOrderId: input.workOrderId, qty: D(input.qty), reason: input.reason, stage: input.stage, note: input.note }, user.actor));
  revalidateWo(input.workOrderId);
  return { data: { id: scrap.id, value: scrap.value }, audit: { action: 'post', tableName: 'work_order_scraps', recordId: scrap.id, summary: `Fire: ${scrap.qty} (${input.reason})` } };
});

const finishSchema = z.object({ workOrderId: z.string().uuid(), producedQty: z.string().min(1), autoConsumeRemainingMaterials: z.boolean().optional() });

export const finishWorkOrderAction = withAudit('production.finishWorkOrder', async (raw: z.infer<typeof finishSchema>) => {
  const user = await requirePermission('production.operate');
  const input = finishSchema.parse(raw);
  const result = await db.transaction((tx) => finishWorkOrder(tx, { workOrderId: input.workOrderId, producedQty: D(input.producedQty), autoConsumeRemainingMaterials: input.autoConsumeRemainingMaterials }, user.actor));
  revalidateWo(input.workOrderId);
  return {
    data: { status: result.workOrder.status, lotNo: result.lot?.lotNo ?? null, yieldPct: result.workOrder.yieldPct },
    audit: { action: 'post', tableName: 'work_orders', recordId: result.workOrder.id, summary: `İş emri ${result.workOrder.docNo} bitti (${result.workOrder.producedQty})`, after: result.workOrder },
  };
});

export const closeWorkOrderAction = withAudit('production.closeWorkOrder', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('production.close');
  const input = idSchema.parse(raw);
  const wo = await db.transaction((tx) => closeWorkOrder(tx, input.id, user.actor));
  revalidateWo(wo.id);
  return { data: { status: wo.status }, audit: { action: 'approve', tableName: 'work_orders', recordId: wo.id, summary: `İş emri ${wo.docNo} kapatıldı (${wo.totalCost} TL)` } };
});

/* ==================================================================== */
/* Operatör PIN girişi (/operator/giris) — tam oturum açar, RBAC aynen  */
/* geçerli kalır (production.operate izni gerekir). Şifre akışının     */
/* dokunmatik terminal eşdeğeri; `apps/web/src/modules/auth` yerine    */
/* burada tutulur (yalnızca operatör terminali kullanır).               */
/* ==================================================================== */

const pinLoginSchema = z.object({ userId: z.string().uuid(), pin: z.string().min(4).max(4) });

export type PinLoginResult = { ok: true } | { ok: false; error: string };

export async function operatorPinLogin(raw: z.infer<typeof pinLoginSchema>): Promise<PinLoginResult> {
  const parsed = pinLoginSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Kullanıcı ve 4 haneli PIN gerekli.' };
  const { userId, pin } = parsed.data;

  const { users } = schema;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const ok = user ? await verifyPin(pin, user.pinHash) : await verifyPin(pin, '$2a$10$abcdefghijklmnopqrstuuA9kZ2h8YvI8nP7iUbZQqXm1x0WcWyf6');
  if (!user || !ok || !user.isActive) return { ok: false, error: 'Kullanıcı veya PIN hatalı.' };

  const h = await headers();
  const meta = { userAgent: h.get('user-agent') ?? undefined, ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined };
  const session = await db.transaction(async (tx) => {
    const s = await createSession(tx, user.id, meta);
    await writeAudit(tx, { action: 'login', tableName: 'users', recordId: user.id, summary: `${user.fullName} PIN ile giriş yaptı (operatör terminali)` }, { userId: user.id, userEmail: user.email, ip: meta.ip });
    return s;
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.token, sessionCookieOptions(new Date(session.expiresAt)));
  return { ok: true };
}

export async function operatorLogout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await destroySession(db, token);
    } catch (err) {
      console.error('[operatorLogout] oturum silinemedi', err);
    }
  }
  jar.delete(SESSION_COOKIE);
  redirect('/operator/giris');
}
