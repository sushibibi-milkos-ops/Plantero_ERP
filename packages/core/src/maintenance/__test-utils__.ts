import type { Tx } from '@plantero/db';
import { machines, productionLines } from '@plantero/db';
import { seedBase, type Base } from '../__tests__/helpers.js';

/** `seedBase`'i bakım testleri için genişletir: hattın deposuna bağlı bir makine (`filler`, MK-TEST). */
export async function seedMaintenanceBase(tx: Tx) {
  const b = await seedBase(tx);
  const [line] = await tx
    .insert(productionLines)
    .values({ code: `HAT-${b.s}`, name: `Test Hattı ${b.s}`, warehouseId: b.wh.id, locationId: b.loc.prod.id, capacityPerHour: '10', shiftMinutes: 480 })
    .returning();

  const [machine] = await tx
    .insert(machines)
    .values({ code: `MK-${b.s}`, name: `Test Dolum Makinesi ${b.s}`, category: 'filler', lineId: line!.id, warehouseId: b.wh.id, status: 'idle' })
    .returning();

  return { ...b, line: line!, machine: machine! };
}

export type MaintenanceBase = Base & Awaited<ReturnType<typeof seedMaintenanceBase>>;
