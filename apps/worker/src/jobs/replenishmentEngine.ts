import { eq } from 'drizzle-orm';
import { db, schema } from '@plantero/db';
import {
  D, toDb, SYSTEM_ACTOR, writeAudit,
  evaluateRules, computeConsumptionRates, evaluateAutoOrderEligibility, isSupplierWhitelisted,
  createPurchaseOrder, approvePurchaseOrder, markPurchaseOrderSent,
} from '@plantero/core';
import { draftPurchaseOrders, type ReplenishRule, type ConsumptionPoint, type SupplierProductOption } from '@plantero/ai';
import { email } from '@plantero/integrations';

const { purchaseOrders, approvals, replenishmentRuns, warehouses, supplierProducts, products, partners } = schema;

/**
 * Kritik stok motoru (worker cron `replenishment-engine`, 06:00) — `docs/modules/tedarik.md` §1.
 * "Motoru çalıştır" web aksiyonuyla (`apps/web/src/modules/purchasing/actions.ts` →
 * `runReplenishmentAction`) AYNI gerçek core akışını izler: `evaluateRules` (reorder_rules'a göre
 * kapsama günü/risk), `@plantero/ai` `draftPurchaseOrders` (tedarikçi bazlı gruplama, `ANTHROPIC_API_KEY`
 * yoksa kural tabanlı fallback), beyaz liste kontrolü (`whitelist.ts`) ile gerçek `purchase_orders`
 * kaydı üretir — eski sürüm yalnızca `products.minQty/maxQty`'den taslak hesaplayıp `replenishment_runs`e
 * yazıyor, hiçbir PO/onay/gönderim üretmiyordu (bkz. git geçmişi); artık gece 06:00 çalıştığında da gündüz
 * "Motoru çalıştır" düğmesiyle bire bir aynı sonucu (gerçek taslak/otomatik PO) üretir.
 * Gönderim (e-posta, sandbox) — katman kuralı gereği (core → integrations bağımlılığı yok) transaction
 * dışında yapılır; worker hem `@plantero/core` hem `@plantero/ai` hem `@plantero/integrations`'ı
 * içe aktarabilir (ARCHITECTURE §1: `apps/worker ──► packages/integrations / packages/ai ──► packages/core`).
 */
export async function runReplenishmentEngine(): Promise<Record<string, unknown>> {
  const toSend: Array<{ orderId: string; docNo: string; partnerEmail: string | null; partnerName: string }> = [];

  const result = await db.transaction(async (tx) => {
    const rules = await evaluateRules(tx, SYSTEM_ACTOR);
    const critical = rules.filter((r) => r.risk !== 'none' && r.suggestedQty.gt(0));

    if (!critical.length) {
      await tx.insert(replenishmentRuns).values({ trigger: 'scheduled', evaluated: rules.length, suggested: 0, autoOrdered: 0, items: [], purchaseOrderIds: [] });
      return { evaluated: rules.length, suggested: 0, draftedOrders: 0, autoOrdered: 0, purchaseOrderIds: [] as string[] };
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
      }, SYSTEM_ACTOR);
      purchaseOrderIds.push(order.id);
      await writeAudit(tx, { action: 'create', tableName: 'purchase_orders', recordId: order.id, summary: `Satın alma taslağı ${order.docNo} kritik stok motoru (gece 06:00) tarafından oluşturuldu (${draft.rationale})`, after: order }, SYSTEM_ACTOR);

      const rulesForOrder = draft.lines.map((l) => ruleByProduct.get(l.productId)).filter((r): r is NonNullable<typeof r> => Boolean(r));
      const ruleWhitelisted = rulesForOrder.length > 0 && rulesForOrder.every((r) => r.isAutoOrderWhitelisted);
      const amounts = rulesForOrder.map((r) => r.autoOrderMaxAmount).filter((a): a is NonNullable<typeof a> => a !== null);
      const autoOrderMaxAmount = amounts.length === rulesForOrder.length && amounts.length > 0 ? amounts.reduce((a, b) => (a.lt(b) ? a : b)) : null;
      const supplierWhitelisted = await isSupplierWhitelisted(tx, draft.partnerId);
      const eligibility = evaluateAutoOrderEligibility({ supplierWhitelisted, ruleWhitelisted, autoOrderMaxAmount, orderAmount: D(order.grandTotal) });

      const [partner] = await tx.select().from(partners).where(eq(partners.id, draft.partnerId)).limit(1);
      if (eligibility.eligible) {
        await approvePurchaseOrder(tx, order.id, SYSTEM_ACTOR);
        await tx.update(purchaseOrders).set({ isAutoApproved: true }).where(eq(purchaseOrders.id, order.id));
        toSend.push({ orderId: order.id, docNo: order.docNo, partnerEmail: partner?.email ?? null, partnerName: partner?.name ?? draft.partnerName });
        autoOrdered += 1;
      } else {
        await tx.update(purchaseOrders).set({ status: 'pending_approval' }).where(eq(purchaseOrders.id, order.id));
        await tx.insert(approvals).values({
          kind: 'purchase_draft', refTable: 'purchase_orders', refId: order.id, title: `Satın alma taslağı ${order.docNo}`,
          summary: `${partner?.name ?? draft.partnerName} — ₺${D(order.grandTotal).toFixed(2)} — ${eligibility.reason}`,
          confidence: String(draft.confidence), status: 'pending', requestedBy: null,
        });
      }
    }

    await tx.insert(replenishmentRuns).values({
      trigger: 'scheduled', evaluated: rules.length, suggested: critical.length, autoOrdered,
      items: critical.map((r) => ({ productId: r.productId, productName: r.productName, suggestedQty: toDb(r.suggestedQty), risk: r.risk })),
      purchaseOrderIds,
    });

    return { evaluated: rules.length, suggested: critical.length, draftedOrders: purchaseOrderIds.length, autoOrdered, purchaseOrderIds };
  });

  // Otomatik onaylanıp gönderilenler için e-posta (sandbox) + durum kalıcılaştırma — transaction dışında.
  for (const s of toSend) {
    const sendResult = await email.sendEmail({ to: s.partnerEmail ?? 'siparis@tedarikci.local', subject: 'Satın Alma Siparişi (otomatik)', body: `Sayın ${s.partnerName}, kritik stok motoru tarafından otomatik oluşturulan siparişimiz ekte/sistemde görüntülenebilir.` });
    const sent = await db.transaction((tx) => markPurchaseOrderSent(tx, s.orderId, { sentVia: 'email', sentTo: s.partnerEmail, isAutoApproved: true, pdfPath: sendResult.providerId }, SYSTEM_ACTOR));
    await db.transaction((tx) => writeAudit(tx, { action: 'post', tableName: 'purchase_orders', recordId: sent.id, summary: `Satın alma siparişi ${sent.docNo}: beyaz liste + tutar sınırı içinde otomatik onaylanıp gönderildi (gece motoru)` }, SYSTEM_ACTOR));
  }

  return {
    evaluated: result.evaluated,
    suggested: result.suggested,
    draftedOrders: result.draftedOrders,
    autoOrdered: result.autoOrdered,
    purchaseOrderIds: result.purchaseOrderIds,
    note: result.draftedOrders > 0 ? `${result.draftedOrders} taslak PO oluşturuldu (${result.autoOrdered} otomatik gönderildi)` : 'Kritik kalem yok',
  };
}
