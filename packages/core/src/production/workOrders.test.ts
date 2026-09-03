import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { workOrderMaterials } from '@plantero/db';
import { createWorkOrder, releaseWorkOrder, startWorkOrder, pauseWorkOrder, resumeWorkOrder, cancelWorkOrder, rescheduleWorkOrder } from './workOrders.js';
import { seedProductionBase } from './__test-utils__.js';
import { withRollback, ctx, d } from '../__tests__/helpers.js';
import { D } from '../money.js';

describe('production/workOrders', () => {
  it('createWorkOrder: BOM açılır, work_order_materials planlanan miktarı ölçekler', async () => {
    await withRollback(async (tx) => {
      const b = await seedProductionBase(tx);
      const { workOrder, materials } = await createWorkOrder(tx, { productId: b.finished.id, warehouseId: b.wh.id, plannedQty: d(50) }, ctx);

      expect(workOrder.status).toBe('planned');
      expect(workOrder.docNo).toMatch(/^WO-\d{4}-\d{6}$/);
      expect(workOrder.lineId).toBe(b.line.id);
      expect(D(workOrder.plannedQty).toFixed(4)).toBe('50.0000');
      expect(materials).toHaveLength(1);
      expect(materials[0]!.productId).toBe(b.raw.id);
      expect(D(materials[0]!.plannedQty).toFixed(4)).toBe('50.0000'); // 1:1 reçete, fire %0

      const rows = await tx.select().from(workOrderMaterials).where(eq(workOrderMaterials.workOrderId, workOrder.id));
      expect(rows).toHaveLength(1);
    });
  });

  it("aktif reçetesi olmayan ürün için hata verir", async () => {
    await withRollback(async (tx) => {
      const b = await seedProductionBase(tx);
      await expect(createWorkOrder(tx, { productId: b.raw.id, warehouseId: b.wh.id, plannedQty: d(10) }, ctx)).rejects.toThrow(/üretilebilir/);
    });
  });

  it('durum akışı: planned → released → in_progress → paused → in_progress; iptal yalnızca açılışta', async () => {
    await withRollback(async (tx) => {
      const b = await seedProductionBase(tx);
      const { workOrder } = await createWorkOrder(tx, { productId: b.finished.id, warehouseId: b.wh.id, plannedQty: d(10) }, ctx);

      const released = await releaseWorkOrder(tx, workOrder.id, ctx);
      expect(released.status).toBe('released');

      const started = await startWorkOrder(tx, workOrder.id, ctx);
      expect(started.status).toBe('in_progress');
      expect(started.startedAt).not.toBeNull();

      const paused = await pauseWorkOrder(tx, workOrder.id, { reason: 'machine_failure', note: 'Motor arızası' }, ctx);
      expect(paused.status).toBe('paused');

      const resumed = await resumeWorkOrder(tx, workOrder.id, ctx);
      expect(resumed.status).toBe('in_progress');
      expect(resumed.pauseMinutes).toBeGreaterThanOrEqual(0);

      // Tüketim/çıktı başladıktan sonra iptal edilemez
      await expect(cancelWorkOrder(tx, workOrder.id, {}, ctx)).rejects.toThrow(/iptal edilemez/);
    });
  });

  it('planned bir iş emri iptal edilebilir', async () => {
    await withRollback(async (tx) => {
      const b = await seedProductionBase(tx);
      const { workOrder } = await createWorkOrder(tx, { productId: b.finished.id, warehouseId: b.wh.id, plannedQty: d(10) }, ctx);
      const cancelled = await cancelWorkOrder(tx, workOrder.id, { reason: 'test' }, ctx);
      expect(cancelled.status).toBe('cancelled');
    });
  });

  it('rescheduleWorkOrder: planlanan tarih ve hat değişir', async () => {
    await withRollback(async (tx) => {
      const b = await seedProductionBase(tx);
      const { workOrder } = await createWorkOrder(tx, { productId: b.finished.id, warehouseId: b.wh.id, plannedQty: d(10) }, ctx);
      const newDate = new Date('2026-08-15T08:00:00Z');
      const updated = await rescheduleWorkOrder(tx, workOrder.id, { plannedStart: newDate }, ctx);
      expect(updated.plannedStart?.toISOString()).toBe(newDate.toISOString());
    });
  });
});
