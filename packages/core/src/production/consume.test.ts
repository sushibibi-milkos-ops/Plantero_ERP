import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { workOrderMaterials, stockLots } from '@plantero/db';
import { createWorkOrder, releaseWorkOrder, startWorkOrder } from './workOrders.js';
import { consumeLot, scanConsume, autoConsumeRemaining } from './consume.js';
import { receiveRawHelper } from '../stock/__test-utils__.js';
import { seedProductionBase } from './__test-utils__.js';
import { withRollback, ctx, d, daysFromNow } from '../__tests__/helpers.js';
import { D } from '../money.js';

describe('production/consume', () => {
  it('consumeLot: FEFO dışı lot okutulunca uyarı döner, forceOverride ile tüketilir', async () => {
    await withRollback(async (tx) => {
      const b = await seedProductionBase(tx);
      // A: yakın SKT (FEFO'da önce çıkması gereken), B: uzak SKT
      await receiveRawHelper(tx, b, 'FEFO-A', '30', '10', { toLocationId: b.loc.hamR01.id, status: 'released', expiryDate: daysFromNow(10) });
      const { lot: lotB } = await receiveRawHelper(tx, b, 'FEFO-B', '30', '10', { toLocationId: b.loc.hamR01.id, status: 'released', expiryDate: daysFromNow(90) });

      const { workOrder } = await createWorkOrder(tx, { productId: b.finished.id, warehouseId: b.wh.id, plannedQty: d(20) }, ctx);
      await releaseWorkOrder(tx, workOrder.id, ctx);
      await startWorkOrder(tx, workOrder.id, ctx);

      const warned = await consumeLot(tx, { workOrderId: workOrder.id, lotId: lotB.id, qty: d(5) }, ctx);
      expect(warned.fefoWarning).toBe(true);
      expect(warned.expectedLotNo).toBe('FEFO-A');
      expect(warned.consumption).toBeNull();

      const forced = await consumeLot(tx, { workOrderId: workOrder.id, lotId: lotB.id, qty: d(5), forceOverride: true }, ctx);
      expect(forced.fefoWarning).toBe(false);
      expect(forced.consumption).not.toBeNull();
      expect(D(forced.consumption!.value).toFixed(4)).toBe('50.0000'); // 5 × 10

      const [mat] = await tx.select().from(workOrderMaterials).where(eq(workOrderMaterials.id, forced.material.id));
      expect(D(mat!.consumedQty).toFixed(4)).toBe('5.0000');

      const [woAfter] = await tx.select().from(workOrderMaterials); // sanity: satır var
      expect(woAfter).toBeTruthy();
    });
  });

  it('scanConsume: lot no okutma doğrudan tüketir, ürün BOM dışıysa hata', async () => {
    await withRollback(async (tx) => {
      const b = await seedProductionBase(tx);
      const { lot } = await receiveRawHelper(tx, b, 'SCAN-1', '40', '8', { toLocationId: b.loc.hamR01.id, status: 'released' });
      const { workOrder } = await createWorkOrder(tx, { productId: b.finished.id, warehouseId: b.wh.id, plannedQty: d(15) }, ctx);
      await releaseWorkOrder(tx, workOrder.id, ctx);
      await startWorkOrder(tx, workOrder.id, ctx);

      const res = await scanConsume(tx, { workOrderId: workOrder.id, code: `LOT:${lot.lotNo}` }, ctx);
      expect(res.fefoWarning).toBe(false);
      expect(D(res.consumption!.qty).toFixed(4)).toBe('15.0000'); // önerilen = kalan planlanan

      // Reçetede olmayan ürünü okutunca hata
      await expect(scanConsume(tx, { workOrderId: workOrder.id, code: b.pack.barcode ?? 'yok' }, ctx)).rejects.toThrow();
    });
  });

  it('karantinadaki lot tüketilemez', async () => {
    await withRollback(async (tx) => {
      const b = await seedProductionBase(tx);
      const { lot } = await receiveRawHelper(tx, b, 'KAR-1', '20', '9'); // varsayılan: karantina
      const { workOrder } = await createWorkOrder(tx, { productId: b.finished.id, warehouseId: b.wh.id, plannedQty: d(10) }, ctx);
      await releaseWorkOrder(tx, workOrder.id, ctx);
      await startWorkOrder(tx, workOrder.id, ctx);

      await expect(consumeLot(tx, { workOrderId: workOrder.id, lotId: lot.id, qty: d(5) }, ctx)).rejects.toThrow(/serbest değil/);
    });
  });

  it('autoConsumeRemaining: reçeteye göre kalan miktarı FEFO ile otomatik tüketir', async () => {
    await withRollback(async (tx) => {
      const b = await seedProductionBase(tx);
      // Lot tam olarak ihtiyaç kadar (60): tüketim sonrası eldeki 0 → lot 'consumed'
      await receiveRawHelper(tx, b, 'AUTO-1', '60', '5', { toLocationId: b.loc.hamR01.id, status: 'released' });
      const { workOrder } = await createWorkOrder(tx, { productId: b.finished.id, warehouseId: b.wh.id, plannedQty: d(60) }, ctx);
      await releaseWorkOrder(tx, workOrder.id, ctx);
      await startWorkOrder(tx, workOrder.id, ctx);

      const results = await autoConsumeRemaining(tx, workOrder.id, ctx);
      expect(results).toHaveLength(1);
      const [mat] = await tx.select().from(workOrderMaterials).where(eq(workOrderMaterials.workOrderId, workOrder.id));
      expect(D(mat!.consumedQty).toFixed(4)).toBe('60.0000');

      const [lot] = await tx.select().from(stockLots).where(eq(stockLots.lotNo, 'AUTO-1'));
      expect(lot!.status).toBe('consumed');
    });
  });
});
