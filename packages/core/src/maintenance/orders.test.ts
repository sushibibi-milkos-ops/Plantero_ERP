import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { machines, downtimes, attachments } from '@plantero/db';
import { reportBreakdown, startOrder, completeOrder, cancelOrder, markWaitingParts } from './orders.js';
import { createPlan, generateOrderNow } from './plans.js';
import { seedMaintenanceBase } from './__test-utils__.js';
import { withRollback, ctx } from '../__tests__/helpers.js';

describe('maintenance/orders', () => {
  it('reportBreakdown: makine down olur, downtime açılır, fotoğraf attachments\'a yazılır', async () => {
    await withRollback(async (tx) => {
      const b = await seedMaintenanceBase(tx);
      const order = await reportBreakdown(tx, {
        machineId: b.machine.id, title: 'Dolum başlığı sızdırıyor', priority: 'high',
        photos: [{ fileName: 'ariza1.jpg', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AAAA' }],
      }, ctx);

      expect(order.docNo).toMatch(/^MO-\d{4}-\d{6}$/);
      expect(order.kind).toBe('corrective');
      expect(order.status).toBe('reported');
      expect(order.photoCount).toBe(1);

      const [machine] = await tx.select().from(machines).where(eq(machines.id, b.machine.id)).limit(1);
      expect(machine!.status).toBe('down');

      const dts = await tx.select().from(downtimes).where(eq(downtimes.maintenanceOrderId, order.id));
      expect(dts).toHaveLength(1);
      expect(dts[0]!.reason).toBe('breakdown');
      expect(dts[0]!.endedAt).toBeNull();

      const atts = await tx.select().from(attachments).where(eq(attachments.recordId, order.id));
      expect(atts).toHaveLength(1);
      expect(atts[0]!.tableName).toBe('maintenance_orders');
      expect(atts[0]!.sizeBytes).toBeGreaterThan(0);
    });
  });

  it('start → complete: downtime kapanır, makine idle döner, downtimeMinutes hesaplanır', async () => {
    await withRollback(async (tx) => {
      const b = await seedMaintenanceBase(tx);
      const reportedAt = new Date(Date.now() - 90 * 60_000);
      const order = await reportBreakdown(tx, { machineId: b.machine.id, title: 'Arıza', workOrderId: null }, ctx);
      // reportedAt/downtime.startedAt `now()` ile yazıldı; tamamlama 90 dk sonrasına simüle edilir.
      await startOrder(tx, order.id, ctx, { asOf: new Date(reportedAt.getTime() + 5 * 60_000) });
      const completed = await completeOrder(tx, order.id, { rootCause: 'Conta aşınmış', resolution: 'Conta değiştirildi' }, ctx);

      expect(completed.status).toBe('done');
      expect(completed.finishedAt).not.toBeNull();

      const [machine] = await tx.select().from(machines).where(eq(machines.id, b.machine.id)).limit(1);
      expect(machine!.status).toBe('idle');

      const [dt] = await tx.select().from(downtimes).where(eq(downtimes.maintenanceOrderId, order.id));
      expect(dt!.endedAt).not.toBeNull();
      expect(dt!.minutes).toBeGreaterThanOrEqual(0);
      expect(completed.downtimeMinutes).toBe(dt!.minutes);
    });
  });

  it('planlı iş emri tamamlanınca plan lastDoneAt/nextDueAt ilerler', async () => {
    await withRollback(async (tx) => {
      const b = await seedMaintenanceBase(tx);
      const plan = await createPlan(tx, { machineId: b.machine.id, name: 'Haftalık yağlama', intervalValue: 7, intervalUnit: 'day' }, ctx);
      const { order } = await generateOrderNow(tx, plan.id, ctx);
      await startOrder(tx, order.id, ctx);
      await completeOrder(tx, order.id, {}, ctx);

      const { maintenancePlans } = await import('@plantero/db');
      const [updatedPlan] = await tx.select().from(maintenancePlans).where(eq(maintenancePlans.id, plan.id)).limit(1);
      // Plan bugün oluşturulup bugün tamamlandığı için nextDueAt (bugün+7) değişmez — ilerleyen alan
      // `lastDoneAt`'tır (yaratılışta null, tamamlanınca bugüne yazılır).
      expect(plan.lastDoneAt).toBeNull();
      expect(updatedPlan!.lastDoneAt).not.toBeNull();
      expect(updatedPlan!.nextDueAt).toBe(plan.nextDueAt);
    });
  });

  it('waiting_parts akışı ve iptal: reported iş emri doğrudan iptal edilebilir, makine idle döner', async () => {
    await withRollback(async (tx) => {
      const b = await seedMaintenanceBase(tx);
      const order = await reportBreakdown(tx, { machineId: b.machine.id, title: 'Sensör arızası' }, ctx);
      await startOrder(tx, order.id, ctx);
      const waiting = await markWaitingParts(tx, order.id, { note: 'Yedek parça bekleniyor' }, ctx);
      expect(waiting.status).toBe('waiting_parts');

      const cancelled = await cancelOrder(tx, order.id, { reason: 'Yanlış bildirim' }, ctx);
      expect(cancelled.status).toBe('cancelled');
      const [machine] = await tx.select().from(machines).where(eq(machines.id, b.machine.id)).limit(1);
      expect(machine!.status).toBe('idle');
    });
  });

  it('zaten kapalı iş emri tekrar tamamlanamaz', async () => {
    await withRollback(async (tx) => {
      const b = await seedMaintenanceBase(tx);
      const order = await reportBreakdown(tx, { machineId: b.machine.id, title: 'Arıza' }, ctx);
      await completeOrder(tx, order.id, {}, ctx);
      await expect(completeOrder(tx, order.id, {}, ctx)).rejects.toThrow(/zaten kapalı/);
    });
  });
});
