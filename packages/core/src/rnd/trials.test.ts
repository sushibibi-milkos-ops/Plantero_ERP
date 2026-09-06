import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { eq } from 'drizzle-orm';
import { boms, products, productionLines } from '@plantero/db';
import { withRollback, ctx, seedBase } from '../__tests__/helpers.js';
import { createWorkOrder } from '../production/workOrders.js';
import { createProject } from './projects.js';
import {
  createTrialRecipe, updateVersionDraft, submitForApproval, approveRecipeRelease,
  rejectRecipeRelease, releaseToBom, NoProductLinkedError,
} from './trials.js';

describe('rnd/trials — versiyon + canlı maliyet', () => {
  it('costSource=average ürünün averageCost\'unu, manual verilen değeri kullanır', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await tx.update(products).set({ averageCost: '8.5000' }).where(eq(products.id, b.raw.id));

      const project = await createProject(tx, { name: 'Test Ürün', productId: b.finished.id }, ctx);
      const { rollup } = await createTrialRecipe(tx, {
        projectId: project.id,
        name: 'v1 deneme',
        batchQty: '100',
        batchUomId: b.kg.id,
        expectedYieldPct: '95',
        overheadPerBatch: '50',
        overheadPerUnit: '0',
        lines: [
          { productId: b.raw.id, qty: '80', uomId: b.kg.id, costSource: 'average', scrapPct: '0' },
          { productId: b.pack.id, qty: '10', uomId: b.kg.id, costSource: 'manual', manualUnitCost: '3.0000', scrapPct: '0' },
        ],
      }, ctx);

      const rawLine = rollup.lines.find((l) => l.productId === b.raw.id)!;
      const packLine = rollup.lines.find((l) => l.productId === b.pack.id)!;
      expect(Number(rawLine.unitCost)).toBeCloseTo(8.5, 4);
      expect(Number(packLine.unitCost)).toBeCloseTo(3, 4);

      const expectedMaterial = new Decimal('80').mul('8.5').plus(new Decimal('10').mul('3'));
      expect(Number(rollup.materialCost)).toBeCloseTo(expectedMaterial.toNumber(), 4);
    });
  });

  it('updateVersionDraft: satır ekle/çıkar/miktar değişince birim maliyet anında yeniden hesaplanır', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await tx.update(products).set({ averageCost: '10.0000' }).where(eq(products.id, b.raw.id));
      const project = await createProject(tx, { name: 'Test', productId: b.finished.id }, ctx);
      const { recipe, rollup: v1 } = await createTrialRecipe(tx, {
        projectId: project.id, name: 'R', batchQty: '10', expectedYieldPct: '100',
        lines: [{ productId: b.raw.id, qty: '10', uomId: b.kg.id, costSource: 'average', scrapPct: '0' }],
      }, ctx);
      expect(Number(v1.unitCost)).toBeCloseTo(10, 4); // 10*10/10

      const v2 = await updateVersionDraft(tx, v1.version.id, {
        lines: [{ productId: b.raw.id, qty: '20', uomId: b.kg.id, costSource: 'average', scrapPct: '0' }],
      }, ctx);
      expect(Number(v2.unitCost)).toBeCloseTo(20, 4); // 10*20/10
      void recipe;
    });
  });

  it('onaysız versiyon üretim BOM\'una devredilemez', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const project = await createProject(tx, { name: 'Test', productId: b.finished.id }, ctx);
      const { rollup } = await createTrialRecipe(tx, {
        projectId: project.id, name: 'R', lines: [{ productId: b.raw.id, qty: '1', uomId: b.kg.id, costSource: 'average', scrapPct: '0' }],
      }, ctx);
      await expect(releaseToBom(tx, rollup.version.id, {}, ctx)).rejects.toThrow(/onaylanmış/);
    });
  });

  it('proje ürüne bağlı değilse releaseToBom NoProductLinkedError fırlatır', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const project = await createProject(tx, { name: 'Ürünsüz proje' }, ctx); // productId yok
      const { rollup } = await createTrialRecipe(tx, {
        projectId: project.id, name: 'R', lines: [{ productId: b.raw.id, qty: '1', uomId: b.kg.id, costSource: 'average', scrapPct: '0' }],
      }, ctx);
      const { approvalId } = await submitForApproval(tx, rollup.version.id, ctx);
      await approveRecipeRelease(tx, approvalId, ctx);
      await expect(releaseToBom(tx, rollup.version.id, {}, ctx)).rejects.toBeInstanceOf(NoProductLinkedError);
    });
  });

  it('onaya gönder → onayla → BOM\'a devret → devrolmuş BOM ile iş emri açılabilir', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const [line] = await tx.insert(productionLines).values({ code: `HAT-${b.s}`, name: `Hat ${b.s}`, warehouseId: b.wh.id, locationId: b.loc.mamul.id, capacityPerHour: '10', shiftMinutes: 480 }).returning();

      const project = await createProject(tx, { name: 'Fıstık Bazı', productId: b.finished.id }, ctx);
      const { recipe, rollup } = await createTrialRecipe(tx, {
        projectId: project.id, name: 'Fıstık Bazı v1', batchQty: '100', batchUomId: b.kg.id, expectedYieldPct: '95', overheadPerBatch: '20',
        lines: [{ productId: b.raw.id, qty: '100', uomId: b.kg.id, costSource: 'average', scrapPct: '2' }],
      }, ctx);

      const { approvalId } = await submitForApproval(tx, rollup.version.id, ctx);
      await approveRecipeRelease(tx, approvalId, ctx);

      const { bomId, bomCode } = await releaseToBom(tx, rollup.version.id, { activate: true }, ctx);
      const [bom] = await tx.select().from(boms).where(eq(boms.id, bomId));
      expect(bom!.status).toBe('active');
      expect(bom!.sourceTrialVersionId).toBe(rollup.version.id);
      expect(bomCode).toContain('BOM-');

      const { workOrder } = await createWorkOrder(tx, { productId: b.finished.id, plannedQty: new Decimal('50'), warehouseId: b.wh.id, lineId: line!.id }, ctx);
      expect(workOrder.bomId).toBe(bomId);
      expect(workOrder.status).toBe('planned');
      void recipe;
    });
  });

  it('releaseToBom: mevcut ürünün aktif BOM\'undan defaultLineId devralınır (iş emri hat seçmeden açılabilir)', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const [line] = await tx.insert(productionLines).values({ code: `HAT-${b.s}`, name: `Hat ${b.s}`, warehouseId: b.wh.id, locationId: b.loc.mamul.id, capacityPerHour: '10', shiftMinutes: 480 }).returning();

      const { createBomVersion, activateBom } = await import('../masterdata/boms.js');
      const existingBom = await createBomVersion(tx, {
        productId: b.finished.id, defaultLineId: line!.id,
        lines: [{ productId: b.raw.id, qty: '1', uomId: b.kg.id }],
      });
      await activateBom(tx, existingBom.id);

      const project = await createProject(tx, { name: 'Mevcut Ürün Geliştirme', productId: b.finished.id }, ctx);
      const { rollup } = await createTrialRecipe(tx, {
        projectId: project.id, name: 'v2 iyileştirme', batchQty: '1',
        lines: [{ productId: b.raw.id, qty: '1.1', uomId: b.kg.id, costSource: 'average', scrapPct: '0' }],
      }, ctx);
      const { approvalId } = await submitForApproval(tx, rollup.version.id, ctx);
      await approveRecipeRelease(tx, approvalId, ctx);
      const { bomId } = await releaseToBom(tx, rollup.version.id, { activate: true }, ctx);

      const [newBom] = await tx.select().from(boms).where(eq(boms.id, bomId));
      expect(newBom!.defaultLineId).toBe(line!.id);

      // lineId VERİLMEDEN iş emri açılabiliyor — bom.defaultLineId'den çözülüyor.
      const { workOrder } = await createWorkOrder(tx, { productId: b.finished.id, plannedQty: new Decimal('1'), warehouseId: b.wh.id }, ctx);
      expect(workOrder.bomId).toBe(bomId);
      expect(workOrder.lineId).toBe(line!.id);
    });
  });

  it('reddedilen versiyon durum rejected olur ve devredilemez', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const project = await createProject(tx, { name: 'Test', productId: b.finished.id }, ctx);
      const { rollup } = await createTrialRecipe(tx, {
        projectId: project.id, name: 'R', lines: [{ productId: b.raw.id, qty: '1', uomId: b.kg.id, costSource: 'average', scrapPct: '0' }],
      }, ctx);
      const { approvalId } = await submitForApproval(tx, rollup.version.id, ctx);
      await rejectRecipeRelease(tx, approvalId, 'Duyusal test başarısız', ctx);
      await expect(releaseToBom(tx, rollup.version.id, {}, ctx)).rejects.toThrow(/onaylanmış/);
    });
  });
});
