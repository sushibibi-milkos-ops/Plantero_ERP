import type { Tx } from '@plantero/db';
import { productionLines } from '@plantero/db';
import { createBomVersion, activateBom } from '../masterdata/boms.js';
import { seedBase, type Base } from '../__tests__/helpers.js';

/**
 * `seedBase`'i üretim testleri için genişletir: 1 hat (lokasyonu `b.loc.prod`, mevcut sanal üretim
 * lokasyonu) + `raw` hammaddesinden `finished` mamule 1:1 aktif reçete (BOM), genel gider payı dahil.
 */
export async function seedProductionBase(tx: Tx) {
  const b = await seedBase(tx);
  const [line] = await tx
    .insert(productionLines)
    .values({ code: `HAT-${b.s}`, name: `Test Hattı ${b.s}`, warehouseId: b.wh.id, locationId: b.loc.prod.id, capacityPerHour: '10', shiftMinutes: 480 })
    .returning();

  const draft = await createBomVersion(tx, {
    productId: b.finished.id, outputQty: '1', outputUomId: b.kg.id, expectedYieldPct: '95', defaultLineId: line!.id,
    overheadPerBatch: '20', overheadPerUnit: '0.5',
    lines: [{ productId: b.raw.id, qty: '1', uomId: b.kg.id, scrapPct: '0' }],
  });
  const bom = await activateBom(tx, draft.id);

  return { ...b, line: line!, bom };
}

export type ProductionBase = Base & Awaited<ReturnType<typeof seedProductionBase>>;
