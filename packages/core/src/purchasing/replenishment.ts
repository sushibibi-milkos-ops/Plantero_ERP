import { and, eq, gte, inArray } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { reorderRules, stockMoves, locations, products, warehouses, type DbOrTx } from '@plantero/db';
import { D, toDb, round4, ZERO } from '../money.js';
import { getOnHand } from '../stock/ledger.js';
import { getOpenPoQtyByProduct } from './orders.js';
import { NotFoundError, ValidationError } from '../auth/errors.js';
import type { ActorCtx } from '../types.js';

/**
 * Kritik stok motoru — `docs/modules/tedarik.md` §1 ("kritik stok motoru" panosu).
 * Yalnızca DB/domain hesapları burada yaşar (sözleşme §1: core → `packages/ai`/`packages/integrations`
 * bağımlılığı yasak — döngüsel olurdu, `packages/ai` zaten `@plantero/core`'a bağımlı). AI destekli
 * tedarikçi gruplama (`draftPurchaseOrders`) ve gönderim orkestrasyonu
 * `apps/web/src/modules/purchasing/actions.ts` → `runReplenishmentAction`'da yapılır; o katman hem
 * `@plantero/core` (bu dosya + `orders.ts`) hem `@plantero/ai`'yi import edebilir.
 */

export type ConsumptionPoint = { productId: string; warehouseId: string; avgDailyQty: Decimal };

/** Son `sinceDays` gündeki tüketim (`consumption`) + sevkiyat (`delivery`) hareketlerinden ürün×depo bazlı günlük ortalama. */
export async function computeConsumptionRates(tx: DbOrTx, opts: { sinceDays?: number } = {}): Promise<ConsumptionPoint[]> {
  const sinceDays = opts.sinceDays ?? 30;
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const rows = await tx
    .select({ productId: stockMoves.productId, warehouseId: locations.warehouseId, qty: stockMoves.qty })
    .from(stockMoves)
    .innerJoin(locations, eq(locations.id, stockMoves.fromLocationId))
    .where(and(inArray(stockMoves.kind, ['consumption', 'delivery']), gte(stockMoves.movedAt, since)));

  const totals = new Map<string, Decimal>();
  for (const r of rows) {
    const key = `${r.productId}::${r.warehouseId}`;
    totals.set(key, (totals.get(key) ?? ZERO).plus(D(r.qty)));
  }
  return Array.from(totals.entries()).map(([key, total]) => {
    const [productId, warehouseId] = key.split('::') as [string, string];
    return { productId, warehouseId, avgDailyQty: round4(total.div(sinceDays)) };
  });
}

export type ReplenishRisk = 'none' | 'warning' | 'critical';

export type RuleEvaluation = {
  ruleId: string;
  productId: string;
  productName: string;
  productSku: string;
  warehouseId: string;
  warehouseCode: string;
  onHand: Decimal;
  reserved: Decimal;
  available: Decimal;
  openPoQty: Decimal;
  dailyConsumption: Decimal;
  /** null = tüketim verisi yok (motor yeni çalıştı) — süre hesaplanamaz. */
  daysOfCover: Decimal | null;
  leadTimeDays: number;
  safetyDays: number;
  minQty: Decimal;
  maxQty: Decimal;
  suggestedQty: Decimal;
  risk: ReplenishRisk;
  preferredSupplierId: string | null;
  isAutoOrderWhitelisted: boolean;
  autoOrderMaxAmount: Decimal | null;
};

/**
 * Tüm aktif kritik stok kurallarını değerlendirir: eldeki/kullanılabilir stok + açık PO + tüketim hızından
 * kapsama günü ve önerilen sipariş miktarını hesaplar, `reorder_rules.last*` alanlarını günceller.
 * Risk: kapsama < lead time → kritik; < lead+güvenlik → uyarı; aksi none (docs/modules/tedarik.md §1).
 */
export async function evaluateRules(tx: DbOrTx, ctx: ActorCtx, opts: { warehouseId?: string } = {}): Promise<RuleEvaluation[]> {
  const consumption = await computeConsumptionRates(tx);
  const consumptionByKey = new Map(consumption.map((c) => [`${c.productId}::${c.warehouseId}`, c.avgDailyQty]));

  const conds = [eq(reorderRules.isActive, true)];
  if (opts.warehouseId) conds.push(eq(reorderRules.warehouseId, opts.warehouseId));

  const rules = await tx
    .select({ rule: reorderRules, productName: products.name, productSku: products.sku, warehouseCode: warehouses.code })
    .from(reorderRules)
    .innerJoin(products, eq(products.id, reorderRules.productId))
    .innerJoin(warehouses, eq(warehouses.id, reorderRules.warehouseId))
    .where(and(...conds));

  const evaluated: RuleEvaluation[] = [];
  for (const { rule, productName, productSku, warehouseCode } of rules) {
    const dailyConsumption = consumptionByKey.get(`${rule.productId}::${rule.warehouseId}`) ?? D(rule.dailyConsumption);
    const { qty: onHand, reserved, available } = await getOnHand(tx, { productId: rule.productId, warehouseId: rule.warehouseId, includeQuarantine: false });
    const openPoQty = await getOpenPoQtyByProduct(tx, rule.productId, rule.warehouseId);
    const minQty = D(rule.minQty);
    const maxQty = D(rule.maxQty).gt(0) ? D(rule.maxQty) : minQty;
    const leadTimeDays = rule.leadTimeDays;
    const safetyDays = rule.safetyDays;

    const projectedAvailable = available.plus(openPoQty);
    const daysOfCover = dailyConsumption.gt(0) ? round4(projectedAvailable.div(dailyConsumption)) : null;

    let risk: ReplenishRisk = 'none';
    if (daysOfCover !== null) {
      if (daysOfCover.lt(leadTimeDays)) risk = 'critical';
      else if (daysOfCover.lt(leadTimeDays + safetyDays)) risk = 'warning';
    } else if (projectedAvailable.lte(minQty) && minQty.gt(0)) {
      risk = 'critical';
    }

    // Önerilen miktar: max seviyesine tamamlama VEYA lead+güvenlik süresince tüketimi karşılama —
    // hangisi büyükse (docs/modules/tedarik.md §1: "max − kullanılabilir − açık PO (+ tüketim × (lead+güvenlik))").
    const fillToMax = maxQty.minus(projectedAvailable);
    const coverLeadSafety = dailyConsumption.mul(leadTimeDays + safetyDays).minus(projectedAvailable);
    const suggestedQty = risk === 'none' ? ZERO : round4(Decimal.max(ZERO, Decimal.max(fillToMax, coverLeadSafety)));

    await tx
      .update(reorderRules)
      .set({
        dailyConsumption: toDb(dailyConsumption), lastOnHand: toDb(onHand), lastDaysOfCover: daysOfCover ? toDb(daysOfCover) : null,
        lastSuggestedQty: toDb(suggestedQty), lastEvaluatedAt: new Date(), updatedBy: ctx.userId ?? null,
      })
      .where(eq(reorderRules.id, rule.id));

    evaluated.push({
      ruleId: rule.id, productId: rule.productId, productName, productSku, warehouseId: rule.warehouseId, warehouseCode,
      onHand, reserved, available, openPoQty, dailyConsumption, daysOfCover, leadTimeDays, safetyDays, minQty, maxQty,
      suggestedQty, risk, preferredSupplierId: rule.preferredSupplierId, isAutoOrderWhitelisted: rule.isAutoOrderWhitelisted,
      autoOrderMaxAmount: rule.autoOrderMaxAmount ? D(rule.autoOrderMaxAmount) : null,
    });
  }

  return evaluated.sort((a, b) => (a.daysOfCover?.toNumber() ?? -1) - (b.daysOfCover?.toNumber() ?? -1));
}

export type UpdateReorderRuleInput = {
  minQty?: Decimal;
  maxQty?: Decimal;
  leadTimeDays?: number;
  safetyDays?: number;
  preferredSupplierId?: string | null;
  isAutoOrderWhitelisted?: boolean;
  /** `undefined` = değiştirme, `null` = sınırı kaldır (tutar sınırsız otomatik onay — yalnızca beyaz liste kontrol eder). */
  autoOrderMaxAmount?: Decimal | null;
  isActive?: boolean;
};

/**
 * Kritik stok kuralı düzenleme drawer'ı — `docs/modules/tedarik.md` §1 "Kural düzenleme drawer
 * (min/max/lead/güvenlik/beyaz liste/tedarikçi)". Motorun kendi ürettiği alanlara (`daily_consumption`,
 * `last*`) dokunmaz — yalnızca kullanıcı tanımlı politika alanlarını değiştirir. `maxQty < minQty`
 * (motorun "max'a tamamlama" bileşenini anlamsız kılar — bkz. `evaluateRules` yorumları) reddedilir.
 */
export async function updateReorderRule(tx: DbOrTx, id: string, input: UpdateReorderRuleInput, ctx: ActorCtx) {
  const [rule] = await tx.select().from(reorderRules).where(eq(reorderRules.id, id)).limit(1);
  if (!rule) throw new NotFoundError('Kritik stok kuralı', id);

  const minQty = input.minQty !== undefined ? round4(input.minQty) : D(rule.minQty);
  const maxQty = input.maxQty !== undefined ? round4(input.maxQty) : D(rule.maxQty);
  if (minQty.lt(0) || maxQty.lt(0)) throw new ValidationError('Min/Max stok negatif olamaz');
  if (maxQty.gt(0) && maxQty.lt(minQty)) throw new ValidationError('Maks. stok, min. stoktan küçük olamaz');
  if (input.leadTimeDays !== undefined && input.leadTimeDays < 0) throw new ValidationError('Lead time negatif olamaz');
  if (input.safetyDays !== undefined && input.safetyDays < 0) throw new ValidationError('Güvenlik günü negatif olamaz');

  const [updated] = await tx
    .update(reorderRules)
    .set({
      minQty: toDb(minQty), maxQty: toDb(maxQty),
      leadTimeDays: input.leadTimeDays ?? rule.leadTimeDays, safetyDays: input.safetyDays ?? rule.safetyDays,
      preferredSupplierId: input.preferredSupplierId === undefined ? rule.preferredSupplierId : input.preferredSupplierId,
      isAutoOrderWhitelisted: input.isAutoOrderWhitelisted ?? rule.isAutoOrderWhitelisted,
      autoOrderMaxAmount: input.autoOrderMaxAmount === undefined ? rule.autoOrderMaxAmount : input.autoOrderMaxAmount === null ? null : toDb(input.autoOrderMaxAmount),
      isActive: input.isActive ?? rule.isActive,
      updatedBy: ctx.userId ?? null,
    })
    .where(eq(reorderRules.id, id))
    .returning();
  return updated!;
}
