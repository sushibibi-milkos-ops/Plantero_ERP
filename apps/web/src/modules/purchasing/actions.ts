'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, schema } from '@plantero/db';
import {
  D, toDb,
  createPurchaseOrder, approvePurchaseOrder, rejectPurchaseOrder, markPurchaseOrderSent, cancelPurchaseOrder,
  evaluateRules, computeConsumptionRates, evaluateAutoOrderEligibility, isSupplierWhitelisted, setSupplierWhitelist,
} from '@plantero/core';
import { draftPurchaseOrders, type ReplenishRule, type ConsumptionPoint, type SupplierProductOption } from '@plantero/ai';
import { email } from '@plantero/integrations/messaging/email';
import { requirePermission } from '@/lib/auth';
import { withAudit, type AuditInfo } from '@/lib/actions';

const { purchaseOrders, approvals, replenishmentRuns, warehouses, supplierProducts, products, partners } = schema;

/* ==================================================================== */
/* Sipariş oluşturma / yaşam döngüsü                                    */
/* ==================================================================== */

const lineSchema = z.object({
  productId: z.string().uuid('Ürün seçin'),
  qty: z.string().min(1, 'Miktar girin'),
  uomId: z.string().uuid(),
  unitPrice: z.string().min(1, 'Birim fiyat girin'),
  vatRate: z.string().optional(),
  expectedDate: z.string().optional().nullable(),
});

const createOrderSchema = z.object({
  partnerId: z.string().uuid('Tedarikçi seçin'),
  warehouseId: z.string().uuid('Depo seçin'),
  orderDate: z.string().optional().nullable(),
  expectedDate: z.string().optional().nullable(),
  paymentTermDays: z.coerce.number().int().min(0).optional(),
  note: z.string().trim().optional().nullable(),
  lines: z.array(lineSchema).min(1, 'En az bir satır ekleyin'),
});

export const createPurchaseOrderAction = withAudit('purchasing.createOrder', async (raw: z.infer<typeof createOrderSchema>) => {
  const user = await requirePermission('purchasing.draft');
  const input = createOrderSchema.parse(raw);
  const { order } = await db.transaction((tx) =>
    createPurchaseOrder(tx, {
      partnerId: input.partnerId, warehouseId: input.warehouseId, orderDate: input.orderDate || undefined,
      expectedDate: input.expectedDate || null, paymentTermDays: input.paymentTermDays, note: input.note || null,
      lines: input.lines.map((l) => ({ productId: l.productId, qty: D(l.qty), uomId: l.uomId, unitPrice: D(l.unitPrice), vatRate: l.vatRate ? D(l.vatRate) : undefined, expectedDate: l.expectedDate || null })),
    }, user.actor));
  revalidatePath('/satin-alma/siparisler');
  return { data: { id: order.id, docNo: order.docNo }, audit: { action: 'create', tableName: 'purchase_orders', recordId: order.id, summary: `Satın alma siparişi ${order.docNo} oluşturuldu`, after: order } };
});

const idSchema = z.object({ id: z.string().uuid() });

export const approvePurchaseOrderAction = withAudit('purchasing.approveOrder', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('purchasing.approve');
  const input = idSchema.parse(raw);
  const order = await db.transaction(async (tx) => {
    const updated = await approvePurchaseOrder(tx, input.id, user.actor);
    // AI onay kuyruğundaki karşılığı (varsa) kapat.
    await tx.update(approvals).set({ status: 'approved', decidedBy: user.actor.userId, decidedAt: new Date() }).where(eq(approvals.refId, input.id));
    return updated;
  });
  revalidatePath('/satin-alma/siparisler');
  revalidatePath(`/satin-alma/siparisler/${input.id}`);
  revalidatePath('/satin-alma/onay-kuyrugu');
  return { data: { id: order.id, status: order.status }, audit: { action: 'approve', tableName: 'purchase_orders', recordId: order.id, summary: `Satın alma siparişi ${order.docNo} onaylandı` } };
});

const rejectSchema = z.object({ id: z.string().uuid(), reason: z.string().trim().optional().nullable() });

export const rejectPurchaseOrderAction = withAudit('purchasing.rejectOrder', async (raw: z.infer<typeof rejectSchema>) => {
  const user = await requirePermission('purchasing.approve');
  const input = rejectSchema.parse(raw);
  const order = await db.transaction(async (tx) => {
    const updated = await rejectPurchaseOrder(tx, input.id, input.reason || null, user.actor);
    await tx.update(approvals).set({ status: 'rejected', decidedBy: user.actor.userId, decidedAt: new Date(), decisionNote: input.reason || null }).where(eq(approvals.refId, input.id));
    return updated;
  });
  revalidatePath('/satin-alma/siparisler');
  revalidatePath(`/satin-alma/siparisler/${input.id}`);
  revalidatePath('/satin-alma/onay-kuyrugu');
  return { data: { id: order.id, status: order.status }, audit: { action: 'reject', tableName: 'purchase_orders', recordId: order.id, summary: `Satın alma siparişi ${order.docNo} reddedildi` } };
});

export const sendPurchaseOrderAction = withAudit('purchasing.sendOrder', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('purchasing.send');
  const input = idSchema.parse(raw);
  const [before] = await db.select({ partnerId: purchaseOrders.partnerId }).from(purchaseOrders).where(eq(purchaseOrders.id, input.id)).limit(1);
  const [partner] = before ? await db.select().from(partners).where(eq(partners.id, before.partnerId)).limit(1) : [null];
  // Gönderim (e-posta, sandbox — SMTP_URL yoksa gerçek posta atılmaz): katman kuralı gereği (core →
  // integrations bağımlılığı yasak) burada, transaction DIŞINDA yapılır; `markPurchaseOrderSent` yalnızca
  // sonucu kalıcılaştırır.
  const sendResult = await email.sendEmail({
    to: partner?.email ?? 'siparis@tedarikci.local', subject: `Satın Alma Siparişi`,
    body: `Sayın ${partner?.name ?? 'Tedarikçi'}, satın alma siparişimiz ekte/sistemde görüntülenebilir.`,
  });
  const order = await db.transaction((tx) => markPurchaseOrderSent(tx, input.id, { sentVia: 'email', sentTo: partner?.email ?? null, pdfPath: sendResult.providerId }, user.actor));
  revalidatePath('/satin-alma/siparisler');
  revalidatePath(`/satin-alma/siparisler/${input.id}`);
  return { data: { id: order.id, status: order.status }, audit: { action: 'post', tableName: 'purchase_orders', recordId: order.id, summary: `Satın alma siparişi ${order.docNo} tedarikçiye gönderildi (${sendResult.sandbox ? 'sandbox' : 'e-posta'})` } };
});

export const cancelPurchaseOrderAction = withAudit('purchasing.cancelOrder', async (raw: z.infer<typeof rejectSchema>) => {
  const user = await requirePermission('purchasing.approve');
  const input = rejectSchema.parse(raw);
  const order = await db.transaction((tx) => cancelPurchaseOrder(tx, input.id, input.reason || null, user.actor));
  revalidatePath('/satin-alma/siparisler');
  revalidatePath(`/satin-alma/siparisler/${input.id}`);
  return { data: { id: order.id, status: order.status }, audit: { action: 'cancel', tableName: 'purchase_orders', recordId: order.id, summary: `Satın alma siparişi ${order.docNo} iptal edildi` } };
});

/* ==================================================================== */
/* Tedarikçi beyaz listesi                                              */
/* ==================================================================== */

const whitelistSchema = z.object({ supplierId: z.string().uuid(), whitelisted: z.boolean() });

export const setSupplierWhitelistAction = withAudit('purchasing.setWhitelist', async (raw: z.infer<typeof whitelistSchema>) => {
  const user = await requirePermission('purchasing.approve');
  const input = whitelistSchema.parse(raw);
  const partner = await db.transaction((tx) => setSupplierWhitelist(tx, input.supplierId, input.whitelisted, user.actor));
  revalidatePath('/satin-alma/tedarikciler');
  return { data: { id: partner.id, isPurchaseWhitelisted: partner.isPurchaseWhitelisted }, audit: { action: 'update', tableName: 'partners', recordId: partner.id, summary: `${partner.name}: satın alma beyaz listesi ${input.whitelisted ? 'açıldı' : 'kapatıldı'}` } };
});

/* ==================================================================== */
/* Kritik stok motoru                                                    */
/* ==================================================================== */

export type RunReplenishmentResult = { evaluated: number; suggested: number; draftedOrders: number; autoOrdered: number };

/**
 * "Motoru çalıştır" — `evaluateRules` (kural/DB hesapları) + `@plantero/ai` `draftPurchaseOrders`
 * (tedarikçi bazlı gruplama, `ANTHROPIC_API_KEY` yoksa kural tabanlı fallback) + beyaz liste
 * kontrolü (`whitelist.ts`) ile tedarikçi başına 1 taslak PO üretir. Beyaz liste + tutar sınırı
 * içindekiler otomatik onaylanıp gönderilir; diğerleri `pending_approval` + `approvals` kaydına düşer
 * (docs/modules/tedarik.md §1). Gönderim (e-posta) katman kuralı gereği transaction dışında yapılır.
 */
export const runReplenishmentAction = withAudit('purchasing.runReplenishment', async () => {
  const user = await requirePermission('purchasing.draft');

  const toSend: Array<{ orderId: string; docNo: string; partnerEmail: string | null; partnerName: string }> = [];
  // `createPurchaseOrder` (core) kendi audit satırını yazmaz (sözleşme: audit yalnızca web
  // katmanındaki `withAudit`'te) — bu action'ın oluşturduğu her PO için ayrı bir audit girdisi
  // gerekir (I17: son 24 saatteki her purchase_orders satırının audit_log karşılığı olmalı; tek bir
  // özet satırı (`reorder_rules` için) yeterli değildi — tur 6, canlı çalıştırmada yakalandı).
  const auditEntries: AuditInfo[] = [];

  const result = await db.transaction(async (tx) => {
    const rules = await evaluateRules(tx, user.actor);
    const critical = rules.filter((r) => r.risk !== 'none' && r.suggestedQty.gt(0));
    if (!critical.length) {
      await tx.insert(replenishmentRuns).values({ trigger: 'manual', evaluated: rules.length, suggested: 0, autoOrdered: 0, items: [], purchaseOrderIds: [] });
      return { evaluated: rules.length, suggested: 0, draftedOrders: 0, autoOrdered: 0 } satisfies RunReplenishmentResult;
    }

    const [tire] = await tx.select().from(warehouses).where(eq(warehouses.code, 'TIRE')).limit(1);
    const productRows = await tx.select().from(products);
    const productById = new Map(productRows.map((p) => [p.id, p]));

    const productIds = critical.map((r) => r.productId);
    const supplierProductRows = productIds.length
      ? await tx.select({ sp: supplierProducts, partnerName: partners.name }).from(supplierProducts).innerJoin(partners, eq(partners.id, supplierProducts.partnerId))
      : [];
    const consumption = await computeConsumptionRates(tx);

    const rulesForAi: ReplenishRule[] = critical.map((r) => ({ productId: r.productId, productName: r.productName, warehouseId: r.warehouseId, minQty: toDb(r.minQty), maxQty: toDb(r.maxQty), onHandQty: toDb(r.available), incomingQty: toDb(r.openPoQty) }));
    const consumptionForAi: ConsumptionPoint[] = consumption.map((c) => ({ productId: c.productId, avgDailyQty: toDb(c.avgDailyQty) }));
    const supplierOptionsForAi: SupplierProductOption[] = supplierProductRows
      .filter((r) => productIds.includes(r.sp.productId))
      .map((r) => ({ productId: r.sp.productId, partnerId: r.sp.partnerId, partnerName: r.partnerName, price: r.sp.price, currency: r.sp.currency, leadTimeDays: r.sp.leadTimeDays, minOrderQty: r.sp.minOrderQty, isPreferred: r.sp.isPreferred }));

    const drafts = await draftPurchaseOrders(rulesForAi, consumptionForAi, supplierOptionsForAi);
    const ruleByProduct = new Map(critical.map((r) => [r.productId, r]));

    let autoOrdered = 0;
    const purchaseOrderIds: string[] = [];
    for (const draft of drafts) {
      const lines = draft.lines
        .map((l) => {
          const product = productById.get(l.productId);
          if (!product) return null;
          const rule = ruleByProduct.get(l.productId);
          return { productId: l.productId, qty: D(l.qty), uomId: product.uomId, unitPrice: D(l.unitPrice), reorderRuleId: rule?.ruleId ?? null };
        })
        .filter((l): l is NonNullable<typeof l> => l !== null);
      if (!lines.length) continue;

      const { order } = await createPurchaseOrder(tx, {
        partnerId: draft.partnerId, warehouseId: tire!.id, isAiGenerated: true, status: 'ai_draft',
        aiRationale: draft.rationale, aiConfidence: D(draft.confidence), lines,
      }, user.actor);
      purchaseOrderIds.push(order.id);
      auditEntries.push({ action: 'create', tableName: 'purchase_orders', recordId: order.id, summary: `Satın alma taslağı ${order.docNo} kritik stok motoru tarafından oluşturuldu (${draft.rationale})`, after: order });

      const rulesForOrder = draft.lines.map((l) => ruleByProduct.get(l.productId)).filter((r): r is NonNullable<typeof r> => Boolean(r));
      const ruleWhitelisted = rulesForOrder.length > 0 && rulesForOrder.every((r) => r.isAutoOrderWhitelisted);
      const amounts = rulesForOrder.map((r) => r.autoOrderMaxAmount).filter((a): a is NonNullable<typeof a> => a !== null);
      const autoOrderMaxAmount = amounts.length === rulesForOrder.length && amounts.length > 0 ? amounts.reduce((a, b) => (a.lt(b) ? a : b)) : null;
      const supplierWhitelisted = await isSupplierWhitelisted(tx, draft.partnerId);
      const eligibility = evaluateAutoOrderEligibility({ supplierWhitelisted, ruleWhitelisted, autoOrderMaxAmount, orderAmount: D(order.grandTotal) });

      const [partner] = await tx.select().from(partners).where(eq(partners.id, draft.partnerId)).limit(1);
      if (eligibility.eligible) {
        await approvePurchaseOrder(tx, order.id, user.actor);
        await tx.update(purchaseOrders).set({ isAutoApproved: true }).where(eq(purchaseOrders.id, order.id));
        toSend.push({ orderId: order.id, docNo: order.docNo, partnerEmail: partner?.email ?? null, partnerName: partner?.name ?? draft.partnerName });
        autoOrdered += 1;
      } else {
        await tx.update(purchaseOrders).set({ status: 'pending_approval' }).where(eq(purchaseOrders.id, order.id));
        await tx.insert(approvals).values({
          kind: 'purchase_draft', refTable: 'purchase_orders', refId: order.id, title: `Satın alma taslağı ${order.docNo}`,
          summary: `${partner?.name ?? draft.partnerName} — ₺${D(order.grandTotal).toFixed(2)} — ${eligibility.reason}`,
          confidence: String(draft.confidence), status: 'pending', requestedBy: user.actor.userId,
        });
      }
    }

    await tx.insert(replenishmentRuns).values({
      trigger: 'manual', evaluated: rules.length, suggested: critical.length, autoOrdered,
      items: critical.map((r) => ({ productId: r.productId, productName: r.productName, suggestedQty: toDb(r.suggestedQty), risk: r.risk })),
      purchaseOrderIds,
    });

    return { evaluated: rules.length, suggested: critical.length, draftedOrders: purchaseOrderIds.length, autoOrdered } satisfies RunReplenishmentResult;
  });

  // Otomatik onaylanıp gönderilenler için e-posta (sandbox) + durum kalıcılaştırma — transaction dışında.
  for (const s of toSend) {
    const sendResult = await email.sendEmail({ to: s.partnerEmail ?? 'siparis@tedarikci.local', subject: 'Satın Alma Siparişi (otomatik)', body: `Sayın ${s.partnerName}, kritik stok motoru tarafından otomatik oluşturulan siparişimiz ekte/sistemde görüntülenebilir.` });
    const sent = await db.transaction((tx) => markPurchaseOrderSent(tx, s.orderId, { sentVia: 'email', sentTo: s.partnerEmail, isAutoApproved: true, pdfPath: sendResult.providerId }, user.actor));
    auditEntries.push({ action: 'post', tableName: 'purchase_orders', recordId: sent.id, summary: `Satın alma siparişi ${sent.docNo}: beyaz liste + tutar sınırı içinde otomatik onaylanıp gönderildi` });
  }

  revalidatePath('/satin-alma/kritik-stok');
  revalidatePath('/satin-alma/siparisler');
  revalidatePath('/satin-alma/onay-kuyrugu');
  auditEntries.push({ action: 'other', tableName: 'reorder_rules', summary: `Kritik stok motoru çalıştırıldı: ${result.evaluated} değerlendirildi, ${result.suggested} kritik, ${result.autoOrdered} otomatik gönderildi` });
  return { data: result, audit: auditEntries };
});
