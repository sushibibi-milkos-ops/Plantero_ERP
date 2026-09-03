import { describe, it, expect } from 'vitest';
import { reorderRules } from '@plantero/db';
import { evaluateRules, computeConsumptionRates } from './replenishment.js';
import { postStockMove } from '../stock/ledger.js';
import { receiveRawHelper } from '../stock/__test-utils__.js';
import { withRollback, seedBase, ctx, d } from '../__tests__/helpers.js';

describe('purchasing/replenishment', () => {
  it('eldeki stok min altındaysa kritik risk + önerilen sipariş miktarı üretir', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await receiveRawHelper(tx, b, 'LOT-A', '20', '200', { toLocationId: b.loc.hamR01.id, status: 'released' });
      const [rule] = await tx
        .insert(reorderRules)
        .values({ productId: b.raw.id, warehouseId: b.wh.id, minQty: '50', maxQty: '150', leadTimeDays: 10, safetyDays: 3 })
        .returning();

      const evaluated = await evaluateRules(tx, ctx);
      const row = evaluated.find((r) => r.ruleId === rule!.id)!;
      expect(row.risk).toBe('critical');
      expect(row.available.toFixed(4)).toBe('20.0000');
      expect(row.suggestedQty.gt(0)).toBe(true);
      // maxQty(150) - available(20) = 130 (tüketim verisi yok → sadece "max'a tamamlama" bileşeni)
      expect(row.suggestedQty.toFixed(4)).toBe('130.0000');
    });
  });

  it('kritik altında değilse (yeterli stok) risk none, önerilen sipariş sıfır', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await receiveRawHelper(tx, b, 'LOT-B', '200', '200', { toLocationId: b.loc.hamR01.id, status: 'released' });
      const [rule] = await tx
        .insert(reorderRules)
        .values({ productId: b.raw.id, warehouseId: b.wh.id, minQty: '50', maxQty: '150', leadTimeDays: 10, safetyDays: 3 })
        .returning();
      const evaluated = await evaluateRules(tx, ctx);
      const row = evaluated.find((r) => r.ruleId === rule!.id)!;
      expect(row.risk).toBe('none');
      expect(row.suggestedQty.toFixed(4)).toBe('0.0000');
    });
  });

  it('tüketim hareketlerinden günlük ortalama ve kapsama günü hesaplar', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const { lot } = await receiveRawHelper(tx, b, 'LOT-C', '300', '200', { toLocationId: b.loc.hamR01.id, status: 'released' });
      await postStockMove(tx, {
        kind: 'consumption', productId: b.raw.id, lotId: lot.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.prod.id,
        qty: d(30), uomId: b.kg.id, refType: 'work_order', refId: '00000000-0000-4000-8000-000000000001', refNo: 'WO-TEST',
      }, ctx);

      const rates = await computeConsumptionRates(tx, { sinceDays: 30 });
      const point = rates.find((r) => r.productId === b.raw.id && r.warehouseId === b.wh.id);
      expect(point).toBeDefined();
      expect(point!.avgDailyQty.toFixed(4)).toBe(d(30).div(30).toFixed(4));

      await tx.insert(reorderRules).values({ productId: b.raw.id, warehouseId: b.wh.id, minQty: '50', maxQty: '400', leadTimeDays: 10, safetyDays: 3 });
      const evaluated = await evaluateRules(tx, ctx);
      const row = evaluated.find((r) => r.productId === b.raw.id)!;
      expect(row.dailyConsumption.gt(0)).toBe(true);
      expect(row.daysOfCover).not.toBeNull();
    });
  });
});
