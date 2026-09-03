import { describe, it, expect } from 'vitest';
import { eq, and, inArray, or } from 'drizzle-orm';
import { workOrders, workOrderOutputs, workOrderConsumptions, workOrderScraps, stockLots, stockQuants, stockMoves, journalLines, journalEntries } from '@plantero/db';
import { createWorkOrder, releaseWorkOrder, startWorkOrder } from './workOrders.js';
import { autoConsumeRemaining } from './consume.js';
import { recordScrap, finishWorkOrder, closeWorkOrder } from './finish.js';
import { receiveRawHelper } from '../stock/__test-utils__.js';
import { seedProductionBase } from './__test-utils__.js';
import { withRollback, ctx, d } from '../__tests__/helpers.js';
import { D, sum } from '../money.js';

describe('production/finish', () => {
  it('uçtan uca: tüket → fire → bitir → kapat; I14/I15 formülleri tutarlı', async () => {
    await withRollback(async (tx) => {
      const b = await seedProductionBase(tx);
      await receiveRawHelper(tx, b, 'FIN-1', '100', '20', { toLocationId: b.loc.hamR01.id, status: 'released' });

      const { workOrder } = await createWorkOrder(tx, { productId: b.finished.id, warehouseId: b.wh.id, plannedQty: d(80) }, ctx);
      await releaseWorkOrder(tx, workOrder.id, ctx);
      await startWorkOrder(tx, workOrder.id, ctx);
      await autoConsumeRemaining(tx, workOrder.id, ctx); // 80 kg × 20 = 1600 materialCost

      const scrap = await recordScrap(tx, { workOrderId: workOrder.id, qty: d(2), reason: 'spill', stage: 'proses' }, ctx);
      expect(D(scrap.value).gte(0)).toBe(true);

      const { workOrder: finished, output, lot } = await finishWorkOrder(tx, { workOrderId: workOrder.id, producedQty: d(75) }, ctx);
      expect(finished.status).toBe('finished');
      expect(lot).not.toBeNull();
      expect(lot!.originWorkOrderId).toBe(workOrder.id);
      expect(lot!.status).toBe('released'); // finished ürün requiresIncomingQc=false

      // I14(a): total = material + overhead
      expect(D(finished.totalCost).toFixed(4)).toBe(D(finished.materialCost).plus(D(finished.overheadCost)).toFixed(4));
      // I14(b): materialCost = Σ consumptions.value
      const cons = await tx.select().from(workOrderConsumptions).where(eq(workOrderConsumptions.workOrderId, workOrder.id));
      expect(D(finished.materialCost).toFixed(4)).toBe(sum(cons.map((c) => c.value)).toFixed(4));
      // overhead = 20 (batch) + 0.5 × 75 (unit) = 57.5
      expect(D(finished.overheadCost).toFixed(4)).toBe('57.5000');
      // birim maliyet tutarlı
      expect(D(output.unitCost).mul(D(output.qty)).toFixed(4)).toBe(D(output.value).toFixed(4));

      const closed = await closeWorkOrder(tx, workOrder.id, ctx);
      expect(closed.status).toBe('closed');

      // I14(c) (yalnızca kapalı WO): Σ outputs.value = total_cost
      const outs = await tx.select().from(workOrderOutputs).where(eq(workOrderOutputs.workOrderId, workOrder.id));
      expect(sum(outs.map((o) => o.value)).toFixed(4)).toBe(D(closed.totalCost).toFixed(4));
      for (const o of outs) {
        expect(D(o.unitCost).mul(D(o.qty)).toFixed(4)).toBe(D(o.value).toFixed(4));
      }

      // Kapalı WO: 151.01 WIP hesabına net katkısı sıfır (material − output malzeme payı − fire = 0'a yakın).
      // Paylaşılan/eşzamanlı test ortamında `getAccountBalance` genel (WO'ya özgü olmayan) bir bakiye
      // döneceğinden, yalnızca BU iş emrine ait fişlerle sınırlı sorgu kullanılır: iş emrinin kendi
      // stock_moves'ları (refType='stock_move', refId=move.id) + kapanış WIP düzeltme fişi (refType='work_order').
      const woMoves = await tx.select({ id: stockMoves.id }).from(stockMoves).where(and(eq(stockMoves.refType, 'work_order'), eq(stockMoves.refId, workOrder.id)));
      const moveIds = woMoves.map((m) => m.id);
      const refCond = or(and(eq(journalEntries.refType, 'stock_move'), inArray(journalEntries.refId, moveIds.length ? moveIds : ['00000000-0000-0000-0000-000000000000'])), and(eq(journalEntries.refType, 'work_order'), eq(journalEntries.refId, workOrder.id)));
      const woWipLines = await tx
        .select({ debit: journalLines.debit, credit: journalLines.credit })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
        .where(and(refCond, eq(journalLines.ledger, 'VUK'), eq(journalLines.accountCode, '151.01')));
      const wipBefore = sum(woWipLines.map((l) => l.debit)).minus(sum(woWipLines.map((l) => l.credit)));
      expect(wipBefore.abs().lte(D('0.01'))).toBe(true);

      // Lot geri izleme: mamul lotu → iş emri → tüketim lotu → mal kabul yok (opening) ama origin_work_order_id dolu (I5)
      const [outputLot] = await tx.select().from(stockLots).where(eq(stockLots.id, lot!.id));
      expect(outputLot!.originWorkOrderId).toBe(workOrder.id);
    });
  });

  it('recordScrap: hat lokasyonundan (production) hurdaya WIP fire hareketi (quant değişmez)', async () => {
    await withRollback(async (tx) => {
      const b = await seedProductionBase(tx);
      await receiveRawHelper(tx, b, 'SCR-1', '50', '10', { toLocationId: b.loc.hamR01.id, status: 'released' });
      const { workOrder } = await createWorkOrder(tx, { productId: b.finished.id, warehouseId: b.wh.id, plannedQty: d(40) }, ctx);
      await releaseWorkOrder(tx, workOrder.id, ctx);
      await startWorkOrder(tx, workOrder.id, ctx);
      await autoConsumeRemaining(tx, workOrder.id, ctx);

      const before = await tx.select().from(stockQuants).where(eq(stockQuants.locationId, b.loc.prod.id));
      await recordScrap(tx, { workOrderId: workOrder.id, qty: d(3), reason: 'burnt', stage: 'proses' }, ctx);
      const after = await tx.select().from(stockQuants).where(eq(stockQuants.locationId, b.loc.prod.id));
      expect(after.length).toBe(before.length); // sanal lokasyon: quant tutulmaz

      const scraps = await tx.select().from(workOrderScraps).where(eq(workOrderScraps.workOrderId, workOrder.id));
      expect(scraps).toHaveLength(1);
      expect(D(scraps[0]!.qty).toFixed(4)).toBe('3.0000');

      const [wo] = await tx.select().from(workOrders).where(eq(workOrders.id, workOrder.id));
      expect(D(wo!.scrapQty).toFixed(4)).toBe('3.0000');
    });
  });

  it('kapalı olmayan bir iş emri kapatılamaz', async () => {
    await withRollback(async (tx) => {
      const b = await seedProductionBase(tx);
      const { workOrder } = await createWorkOrder(tx, { productId: b.finished.id, warehouseId: b.wh.id, plannedQty: d(10) }, ctx);
      await expect(closeWorkOrder(tx, workOrder.id, ctx)).rejects.toThrow(/önce bitirilmeli/);
    });
  });
});
