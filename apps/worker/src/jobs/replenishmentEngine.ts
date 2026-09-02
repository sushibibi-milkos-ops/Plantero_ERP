import { and, eq, isNotNull } from 'drizzle-orm';
import { db, partners, products, replenishmentRuns, supplierProducts, warehouses } from '@plantero/db';
import { getOnHand } from '@plantero/core';
import { draftPurchaseOrders, type ReplenishRule, type SupplierProductOption } from '@plantero/ai';

/**
 * Kritik stok motoru: satın alınabilir + min/max tanımlı ürünler için her aktif depoda
 * eldeki stoğu hesaplar, AI'a (yoksa order-up-to-max kural motoruna) tedarikçi bazlı PO
 * taslakları çıkarttırır. Taslaklar `replenishment_runs`'a yazılır; gerçek `purchase_orders`
 * kaydına dönüştürme satın alma modülünün onay kuyruğunda yapılır.
 */
export async function runReplenishmentEngine(): Promise<Record<string, unknown>> {
  const eligibleProducts = await db
    .select()
    .from(products)
    .where(and(eq(products.isPurchasable, true), eq(products.status, 'active'), isNotNull(products.minQty)));
  const activeWarehouses = await db.select().from(warehouses).where(eq(warehouses.isActive, true));

  if (eligibleProducts.length === 0 || activeWarehouses.length === 0) {
    await db.insert(replenishmentRuns).values({ trigger: 'scheduled', evaluated: 0, suggested: 0, autoOrdered: 0, items: [], purchaseOrderIds: [] });
    return { evaluated: 0, suggested: 0 };
  }

  const rules: ReplenishRule[] = [];
  for (const p of eligibleProducts) {
    for (const wh of activeWarehouses) {
      const onHand = await getOnHand(db, { productId: p.id, warehouseId: wh.id, includeQuarantine: false });
      rules.push({ productId: p.id, productName: p.name, warehouseId: wh.id, minQty: p.minQty ?? '0', maxQty: p.maxQty ?? p.minQty ?? '0', onHandQty: onHand.qty.toFixed(4) });
    }
  }

  const supplierRows = await db
    .select({
      productId: supplierProducts.productId,
      partnerId: supplierProducts.partnerId,
      partnerName: partners.name,
      price: supplierProducts.price,
      currency: supplierProducts.currency,
      leadTimeDays: supplierProducts.leadTimeDays,
      minOrderQty: supplierProducts.minOrderQty,
      isPreferred: supplierProducts.isPreferred,
    })
    .from(supplierProducts)
    .innerJoin(partners, eq(partners.id, supplierProducts.partnerId));

  const supplierOptions: SupplierProductOption[] = supplierRows;

  const drafts = await draftPurchaseOrders(rules, [], supplierOptions);
  const suggestedCount = drafts.reduce((acc, d) => acc + d.lines.length, 0);

  const [run] = await db
    .insert(replenishmentRuns)
    .values({
      trigger: 'scheduled',
      evaluated: rules.length,
      suggested: suggestedCount,
      autoOrdered: 0,
      items: drafts.map((d) => ({ partnerId: d.partnerId, partnerName: d.partnerName, currency: d.currency, rationale: d.rationale, confidence: d.confidence, lines: d.lines })),
      purchaseOrderIds: [],
    })
    .returning({ id: replenishmentRuns.id });

  return {
    evaluated: rules.length,
    suggestedLines: suggestedCount,
    draftOrders: drafts.length,
    runId: run!.id,
    note: 'PO taslakları replenishment_runs.items içinde; satın alma modülünün onay kuyruğunda gerçek purchase_orders kaydına dönüştürülecek.',
  };
}
