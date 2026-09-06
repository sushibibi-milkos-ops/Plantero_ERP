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

      // Kök neden (Tur 5 P1): `Date.now() - 1h` gerçek duvar saati Europe/Istanbul gece yarısına
      // yakınken (00:00-01:00 arası) bir önceki iş gününe düşebiliyor VE `completeOrder`'ın
      // varsayılan `asOf` (`new Date()`, gerçek "şimdi") duruşun bitişini `startedAt`'tan ÖNCEYE
      // düşürüp negatif/sıfır dakika üretebiliyordu — test gerçek duvar saatine bağımlı, flaky
      // hâle geliyordu. Artık hem başlangıç hem bitiş `day` iş gününün İÇİNE, birbirine göre sabit
      // bir sırayla (10:00 → 11:00, gerçek "şimdi"den bağımsız) yerleştiriliyor: test hangi saatte
      // çalışırsa çalışsın her zaman aynı iş gününde, her zaman 60 dakikalık bir duruş üretir
      // (computeLineOeeForDay artık `day`'i Europe/Istanbul takvim gününe göre doğru pencereliyor —
      // bkz. production/yield.ts).
      const startedAt = new Date(`${day}T10:00:00+03:00`);
      const completedAt = new Date(`${day}T11:00:00+03:00`);
      const order = await reportBreakdown(tx, { machineId: b.machine.id, title: 'Bant kopması' }, ctx);
      await tx.update(downtimes).set({ startedAt }).where(eq(downtimes.maintenanceOrderId, order.id));
      await completeOrder(tx, order.id, { asOf: completedAt }, ctx);

      const after = await recomputeOeeForDay(tx, day);
      const afterAvail = D(after.find((r) => r.lineId === b.line.id)!.availabilityPct);

      expect(afterAvail.lt(beforeAvail)).toBe(true);
    });
  });
});
