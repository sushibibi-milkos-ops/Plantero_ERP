import { describe, it, expect } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { oeeRecords, downtimes } from '@plantero/db';
import { recomputeOeeForDay } from './oee.js';
import { reportBreakdown, completeOrder } from './orders.js';
import { seedMaintenanceBase } from './__test-utils__.js';
import { withRollback, ctx, today } from '../__tests__/helpers.js';
import { D } from '../money.js';

describe('maintenance/oee', () => {
  it('recomputeOeeForDay: duruş olmadan kullanılabilirlik %100, tekrar çağrılınca satır çoğalmaz', async () => {
    await withRollback(async (tx) => {
      const b = await seedMaintenanceBase(tx);
      const day = today();

      const first = await recomputeOeeForDay(tx, day);
      const row = first.find((r) => r.lineId === b.line.id);
      expect(row).toBeDefined();
      expect(D(row!.availabilityPct).toFixed(2)).toBe('100.00');

      await recomputeOeeForDay(tx, day);
      const rows = await tx.select().from(oeeRecords).where(and(eq(oeeRecords.lineId, b.line.id), eq(oeeRecords.day, day)));
      expect(rows).toHaveLength(1);
    });
  });

  it('arıza bildirimi → tamamlama sonrası o günün kullanılabilirliği düşer (kabul kriteri)', async () => {
    await withRollback(async (tx) => {
      const b = await seedMaintenanceBase(tx);
      const day = today();

      const before = await recomputeOeeForDay(tx, day);
      const beforeAvail = D(before.find((r) => r.lineId === b.line.id)!.availabilityPct);

      const startedAt = new Date(Date.now() - 60 * 60_000); // 1 saat önce başlamış gibi (aynı iş günü)
      const order = await reportBreakdown(tx, { machineId: b.machine.id, title: 'Bant kopması' }, ctx);
      await tx.update(downtimes).set({ startedAt }).where(eq(downtimes.maintenanceOrderId, order.id));
      await completeOrder(tx, order.id, {}, ctx);

      const after = await recomputeOeeForDay(tx, day);
      const afterAvail = D(after.find((r) => r.lineId === b.line.id)!.availabilityPct);

      expect(afterAvail.lt(beforeAvail)).toBe(true);
    });
  });
});
