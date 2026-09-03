import { eq } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import { partners, reorderRules, type DbOrTx } from '@plantero/db';
import { D } from '../money.js';
import { NotFoundError } from '../auth/errors.js';
import type { ActorCtx } from '../types.js';

/**
 * Satın alma beyaz listesi — `docs/modules/tedarik.md`: "beyaz liste dışı hiçbir PO otomatik
 * gönderilmez". İki bağımsız kapı vardır ve ikisi de açık olmalı:
 *   1) Tedarikçi genelde satın almaya açık mı (`partners.isPurchaseWhitelisted`).
 *   2) Bu ürün/depo kuralı tam otomatik siparişe (AI taslağı → onaysız gönderim) açık mı
 *      (`reorder_rules.isAutoOrderWhitelisted`) ve tutar `autoOrderMaxAmount` sınırının altında mı.
 * İkisinden biri eksikse taslak `pending_approval` kalır ve `approvals` kuyruğuna düşer
 * (bkz. `apps/web/src/modules/purchasing/actions.ts` → `runReplenishmentAction`).
 */

export type AutoOrderEligibility = { eligible: boolean; reason: string };

export function evaluateAutoOrderEligibility(opts: {
  supplierWhitelisted: boolean;
  ruleWhitelisted: boolean;
  autoOrderMaxAmount: Decimal | null;
  orderAmount: Decimal;
}): AutoOrderEligibility {
  if (!opts.supplierWhitelisted) return { eligible: false, reason: 'Tedarikçi genel satın alma beyaz listesinde değil' };
  if (!opts.ruleWhitelisted) return { eligible: false, reason: 'Kritik stok kuralı otomatik siparişe açık değil (isAutoOrderWhitelisted=false)' };
  if (opts.autoOrderMaxAmount && opts.orderAmount.gt(opts.autoOrderMaxAmount)) {
    return {
      eligible: false,
      reason: `Sipariş tutarı (₺${opts.orderAmount.toFixed(2)}) otomatik onay sınırını (₺${opts.autoOrderMaxAmount.toFixed(2)}) aşıyor`,
    };
  }
  return { eligible: true, reason: 'Beyaz liste + tutar sınırı içinde — otomatik onay ve gönderim' };
}

export async function isSupplierWhitelisted(tx: DbOrTx, supplierId: string): Promise<boolean> {
  const [row] = await tx.select({ v: partners.isPurchaseWhitelisted }).from(partners).where(eq(partners.id, supplierId)).limit(1);
  return row?.v ?? false;
}

export async function setSupplierWhitelist(tx: DbOrTx, supplierId: string, whitelisted: boolean, ctx: ActorCtx) {
  const [row] = await tx
    .update(partners)
    .set({ isPurchaseWhitelisted: whitelisted, updatedBy: ctx.userId ?? null })
    .where(eq(partners.id, supplierId))
    .returning();
  if (!row) throw new NotFoundError('Tedarikçi', supplierId);
  return row;
}

export async function setRuleAutoOrder(
  tx: DbOrTx,
  ruleId: string,
  opts: { isAutoOrderWhitelisted: boolean; autoOrderMaxAmount?: Decimal | null },
  ctx: ActorCtx,
) {
  const [row] = await tx
    .update(reorderRules)
    .set({
      isAutoOrderWhitelisted: opts.isAutoOrderWhitelisted,
      autoOrderMaxAmount: opts.autoOrderMaxAmount === undefined ? undefined : opts.autoOrderMaxAmount ? D(opts.autoOrderMaxAmount).toFixed(4) : null,
      updatedBy: ctx.userId ?? null,
    })
    .where(eq(reorderRules.id, ruleId))
    .returning();
  if (!row) throw new NotFoundError('Kritik stok kuralı', ruleId);
  return row;
}
