import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@plantero/db';
import { seedBase, withRollback, ctx, d, today } from '../__tests__/helpers.js';
import { computeSupplierScores } from './supplierScore.js';

const { receipts, receiptLines, partners } = schema;

describe('quality/supplierScore computeSupplierScores()', () => {
  it('kalite %50 + zamanında %30 + miktar doğruluğu %20 ağırlıklı skor hesaplar ve partners.supplierQualityScore günceller', async () => {
    await withRollback(async (tx) => {
      const base = await seedBase(tx);
      const period = today().slice(0, 7);
      const now = new Date();

      // İki mal kabul: biri zamanında + tam kabul, biri geç + %10 red.
      const [r1] = await tx.insert(receipts).values({ docNo: `GR-TEST-${base.s}-1`, status: 'done', partnerId: base.supplier.id, warehouseId: base.wh.id, receivedAt: now, wasOnTime: true }).returning();
      await tx.insert(receiptLines).values({ receiptId: r1!.id, productId: base.raw.id, qty: d(100).toFixed(4), uomId: base.kg.id, unitCost: d(10).toFixed(4), disposition: 'released', rejectedQty: d(0).toFixed(4), sequence: 10 });

      const [r2] = await tx.insert(receipts).values({ docNo: `GR-TEST-${base.s}-2`, status: 'done', partnerId: base.supplier.id, warehouseId: base.wh.id, receivedAt: now, wasOnTime: false }).returning();
      await tx.insert(receiptLines).values({ receiptId: r2!.id, productId: base.raw.id, qty: d(100).toFixed(4), uomId: base.kg.id, unitCost: d(10).toFixed(4), disposition: 'released', rejectedQty: d(10).toFixed(4), sequence: 10 });

      const rows = await computeSupplierScores(tx, period, ctx);
      const row = rows.find((r) => r.partnerId === base.supplier.id);
      expect(row).toBeDefined();
      expect(row!.receipts).toBe(2);
      expect(row!.onTimeReceipts).toBe(1);
      // QC kontrolü yok → kalite oranı tam puan (50), zamanında 1/2*30=15, miktar doğruluğu (1-10/200)*20=19
      expect(Number(row!.score)).toBeCloseTo(50 + 15 + 19, 1);

      const [partner] = await tx.select().from(partners).where(eq(partners.id, base.supplier.id)).limit(1);
      expect(Number(partner!.supplierQualityScore)).toBeCloseTo(Number(row!.score), 4);
    });
  });

  it('bu dönemde mal kabulü olmayan tedarikçi için skor üretmez', async () => {
    await withRollback(async (tx) => {
      const base = await seedBase(tx);
      const rows = await computeSupplierScores(tx, '2020-01', ctx);
      expect(rows.find((r) => r.partnerId === base.supplier.id)).toBeUndefined();
    });
  });
});
