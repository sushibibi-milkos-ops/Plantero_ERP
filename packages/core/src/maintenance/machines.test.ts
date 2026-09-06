import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { downtimes } from '@plantero/db';
import { parseMachineScanCode, findMachineByScan, computeMtbfMttr } from './machines.js';
import { reportBreakdown, completeOrder } from './orders.js';
import { seedMaintenanceBase } from './__test-utils__.js';
import { withRollback, ctx } from '../__tests__/helpers.js';

describe('maintenance/machines', () => {
  it('parseMachineScanCode: MCH: önekini kırpar, düz kodu olduğu gibi bırakır', () => {
    expect(parseMachineScanCode('MCH:MK-008')).toBe('MK-008');
    expect(parseMachineScanCode('mch:mk-008')).toBe('mk-008');
    expect(parseMachineScanCode('MK-008')).toBe('MK-008');
    expect(parseMachineScanCode('  MCH:MK-008  ')).toBe('MK-008');
  });

  it('findMachineByScan: MCH: önekiyle ya da önekiz kodla makineyi bulur, yoksa hata verir', async () => {
    await withRollback(async (tx) => {
      const b = await seedMaintenanceBase(tx);
      const found = await findMachineByScan(tx, `MCH:${b.machine.code}`);
      expect(found.id).toBe(b.machine.id);
      const found2 = await findMachineByScan(tx, b.machine.code.toLowerCase());
      expect(found2.id).toBe(b.machine.id);
      await expect(findMachineByScan(tx, 'MCH:YOK-999')).rejects.toThrow(/bulunamadı/);
    });
  });

  it('computeMtbfMttr: tek arızada MTBF null, tamamlanan arızadan MTTR hesaplanır', async () => {
    await withRollback(async (tx) => {
      const b = await seedMaintenanceBase(tx);
      const single = await computeMtbfMttr(tx, b.machine.id);
      expect(single.failureCount).toBe(0);
      expect(single.mtbfHours).toBeNull();

      const order = await reportBreakdown(tx, { machineId: b.machine.id, title: 'Arıza 1' }, ctx);
      // Duruş süresi 0 dk çıkmasın diye (aynı milisaniyede bildirim+tamamlama) başlangıcı geriye çek.
      await tx.update(downtimes).set({ startedAt: new Date(Date.now() - 45 * 60_000) }).where(eq(downtimes.maintenanceOrderId, order.id));
      await completeOrder(tx, order.id, {}, ctx);

      const after = await computeMtbfMttr(tx, b.machine.id);
      expect(after.failureCount).toBe(1);
      expect(after.mtbfHours).toBeNull(); // tek arıza — ardışık fark yok
      expect(after.mttrHours).not.toBeNull();
      expect(after.mttrHours!).toBeGreaterThanOrEqual(0);
    });
  });
});
