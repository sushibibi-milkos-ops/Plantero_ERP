import type Decimal from 'decimal.js';
import { D, ZERO, sum } from '../money.js';

/**
 * Saf maliyet formülü — DB bağımlılığı YOK (yalnızca decimal.js + money.ts). Bilinçli olarak
 * `trials.ts`ten ayrı tutulur: bu dosya web tarafında `'use client'` bileşenlerden DOĞRUDAN
 * import edilir (canlı simülasyon — satır değişince sunucuya gitmeden anında birim maliyet, bkz.
 * `apps/web/src/modules/rnd/components/cost-simulator.tsx`); `trials.ts` `@plantero/db` içe
 * aktardığından client bundle'a sızması derlemeyi kırar (node-only sürücüler). `rollupBomCost`
 * (`masterdata/boms.ts`) ile BİREBİR aynı formül — Ar-Ge simülasyonu BOM'a devrolduğunda maliyet
 * aniden değişmesin diye bilinçli tutarlılık.
 */

export type CostSource = 'average' | 'last_purchase' | 'manual';

export type TrialCostComputation = {
  materialCost: Decimal;
  effectiveOutputQty: Decimal;
  unitCost: Decimal;
  lineCosts: Decimal[];
};

/** Σ miktar×(1+fire%)×maliyet ÷ (parti × verim%) + genel gider(parti+birim). */
export function computeTrialCost(input: {
  batchQty: Decimal;
  expectedYieldPct: Decimal;
  overheadPerBatch: Decimal;
  overheadPerUnit: Decimal;
  lines: Array<{ qty: Decimal; unitCost: Decimal; scrapPct: Decimal }>;
}): TrialCostComputation {
  const lineCosts = input.lines.map((l) => l.qty.mul(D(1).plus(l.scrapPct.div(100))).mul(l.unitCost));
  const materialCost = sum(lineCosts);
  const yieldRatio = input.expectedYieldPct.div(100);
  const effectiveOutputQty = input.batchQty.mul(yieldRatio.isZero() ? D(1) : yieldRatio);
  const unitCost = effectiveOutputQty.isZero() ? ZERO : materialCost.plus(input.overheadPerBatch).div(effectiveOutputQty).plus(input.overheadPerUnit);
  return { materialCost, effectiveOutputQty, unitCost, lineCosts };
}
