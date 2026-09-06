import { describe, it, expect } from 'vitest';
import { createPlan, generateDueOrders, generateOrderNow, computeNextDueDate } from './plans.js';
import { seedMaintenanceBase } from './__test-utils__.js';
import { withRollback, ctx, today, daysFromNow } from '../__tests__/helpers.js';

describe('maintenance/plans', () => {
  it('computeNextDueDate: day/week/month ileri sayar, runtime_hours null döner', () => {
    expect(computeNextDueDate('2026-09-01', 7, 'day')).toBe('2026-09-08');
    expect(computeNextDueDate('2026-09-01', 2, 'week')).toBe('2026-09-15');
    expect(computeNextDueDate('2026-09-01', 1, 'month')).toBe('2026-10-01');
    expect(computeNextDueDate('2026-09-01', 500, 'runtime_hours')).toBeNull();
  });

  it('createPlan: nextDueAt aralığa göre bugünden hesaplanır', async () => {
    await withRollback(async (tx) => {
      const b = await seedMaintenanceBase(tx);
      const plan = await createPlan(tx, { machineId: b.machine.id, name: 'Haftalık yağlama', intervalValue: 7, intervalUnit: 'day' }, ctx);
      expect(plan.nextDueAt).toBe(daysFromNow(7));
    });
  });

  it('generateDueOrders: vadesi bugün+3 içinde olan plan için preventive iş emri açar, tekrar çağrılınca çift üretmez', async () => {
    await withRollback(async (tx) => {
      const b = await seedMaintenanceBase(tx);
      const plan = await createPlan(tx, { machineId: b.machine.id, name: 'Aylık kontrol', intervalValue: 1, intervalUnit: 'day', checklist: ['Yağ seviyesi', 'Conta'] }, ctx);

      const res1 = await generateDueOrders(tx, ctx);
      expect(res1.ordersCreated).toBe(1);
      expect(res1.ordersSkipped).toBe(0);

      const res2 = await generateDueOrders(tx, ctx);
      expect(res2.ordersCreated).toBe(0);
      expect(res2.ordersSkipped).toBe(1);

      const { order } = await generateOrderNow(tx, plan.id, ctx);
      expect(order.kind).toBe('preventive');
      expect(order.status).toBe('planned');
      expect(order.checklistResults).toEqual([{ item: 'Yağ seviyesi', done: false }, { item: 'Conta', done: false }]);
    });
  });

  it('vadesi uzak bir plan için sipariş üretmez', async () => {
    await withRollback(async (tx) => {
      const b = await seedMaintenanceBase(tx);
      await createPlan(tx, { machineId: b.machine.id, name: 'Yıllık kalibrasyon', intervalValue: 365, intervalUnit: 'day' }, ctx);
      const res = await generateDueOrders(tx, ctx);
      expect(res.ordersCreated).toBe(0);
      expect(res.plansChecked).toBe(0);
    });
  });

  it('generateOrderNow vade beklemeden bugün için üretir', async () => {
    await withRollback(async (tx) => {
      const b = await seedMaintenanceBase(tx);
      const plan = await createPlan(tx, { machineId: b.machine.id, name: 'Yıllık kalibrasyon', intervalValue: 365, intervalUnit: 'day' }, ctx);
      const { order, created } = await generateOrderNow(tx, plan.id, ctx);
      expect(created).toBe(true);
      expect(order.scheduledFor).toBe(today());
    });
  });
});
