import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { products, boms, stockQuants, stockLots } from '@plantero/db';
import { createBomVersion, activateBom, explodeBom, rollupBomCost, resolveComponentUnitCost } from './boms.js';
import { withRollback, seedBase } from '../__tests__/helpers.js';

describe('masterdata/boms — reçete versiyonlama ve maliyet toplaması', () => {
  it('createBomVersion + activateBom: aktifleştirme diğer versiyonu arşivler', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await tx.update(products).set({ averageCost: '100.0000' }).where(eq(products.id, b.raw.id));

      const v1 = await createBomVersion(tx, {
        productId: b.finished.id,
        outputQty: '1',
        expectedYieldPct: '100',
        overheadPerBatch: '0',
        overheadPerUnit: '0',
        lines: [{ productId: b.raw.id, qty: '2', uomId: b.kg.id }],
      });
      expect(v1.version).toBe(1);
      expect(v1.status).toBe('draft');

      await activateBom(tx, v1.id);

      const v2 = await createBomVersion(tx, {
        productId: b.finished.id,
        outputQty: '1',
        lines: [{ productId: b.raw.id, qty: '3', uomId: b.kg.id }],
      });
      expect(v2.version).toBe(2);
      await activateBom(tx, v2.id);

      const [reloadedV1] = await tx.select().from(boms).where(eq(boms.id, v1.id));
      expect(reloadedV1?.status).toBe('archived');
    });
  });

  it('explodeBom: qty ölçekler, fire % tüketimi artırır', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const bom = await createBomVersion(tx, {
        productId: b.finished.id,
        outputQty: '10', // 10 birim çıktı için 2 kg hammadde
        lines: [{ productId: b.raw.id, qty: '2', uomId: b.kg.id, scrapPct: '10' }],
      });
      const exploded = await explodeBom(tx, bom.id, new Decimal(20)); // 20 birim üret → 2x ölçek
      expect(exploded).toHaveLength(1);
      // 2kg * (20/10) * 1.10 fire = 4.4 kg
      expect(new Decimal(exploded[0]!.requiredQty).toFixed(4)).toBe('4.4000');
    });
  });

  it('rollupBomCost: bileşen maliyeti eldeki lot ortalamasından çözülür, verim düzeltmesi uygulanır', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      // 10 kg @ 50 TL/kg lot'u karantina lokasyonuna aç (basit quant + lot insert — ledger'a girmeden, saf maliyet testi)
      const [lot] = await tx
        .insert(stockLots)
        .values({ lotNo: `TESTLOT-${b.s}`, productId: b.raw.id, status: 'released', origin: 'receipt', unitCost: '50.0000', initialQty: '10', uomId: b.kg.id })
        .returning();
      await tx.insert(stockQuants).values({ productId: b.raw.id, locationId: b.loc.hamR01.id, lotId: lot!.id, qty: '10' });

      const resolved = await resolveComponentUnitCost(tx, b.raw.id);
      expect(resolved.source).toBe('lot_avg');
      expect(new Decimal(resolved.unitCost).toFixed(2)).toBe('50.00');

      const bom = await createBomVersion(tx, {
        productId: b.finished.id,
        outputQty: '1',
        expectedYieldPct: '80', // %20 fire — birim maliyeti artırır
        overheadPerBatch: '10',
        overheadPerUnit: '1',
        lines: [{ productId: b.raw.id, qty: '2', uomId: b.kg.id, scrapPct: '0' }],
      });

      const rollup = await rollupBomCost(tx, bom.id);
      // materialCost = 2kg * 50 = 100
      expect(new Decimal(rollup.materialCost).toFixed(2)).toBe('100.00');
      // effectiveOutputQty = 1 * 0.8 = 0.8
      expect(new Decimal(rollup.effectiveOutputQty).toFixed(2)).toBe('0.80');
      // unitCost = (100 + 10) / 0.8 + 1 = 137.5 + 1 = 138.5
      expect(new Decimal(rollup.unitCost).toFixed(2)).toBe('138.50');
    });
  });
});
