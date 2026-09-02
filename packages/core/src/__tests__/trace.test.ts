import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  receipts, receiptLines, boms, productionLines, workOrders, workOrderConsumptions, workOrderOutputs, deliveries, deliveryLines, stockLots,
} from '@plantero/db';
import { postStockMove, createLot } from '../stock/ledger.js';
import { traceBackward, traceForward, simulateRecall } from '../lots/trace.js';
import { withRollback, seedBase, ctx, d, today } from './helpers.js';

describe('lot trace', () => {
  it('mal kabul → iş emri → mamul lot → sevkiyat zinciri iki yönde', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);

      // Mal kabul + hammadde lotu (gerçek servisle stok girişi)
      const [rc] = await tx.insert(receipts).values({ docNo: `GR-T-${b.s}`, status: 'done', partnerId: b.supplier.id, warehouseId: b.wh.id, receivedAt: new Date() }).returning();
      const rawLot = await createLot(tx, { productId: b.raw.id, lotNo: `SUP-${b.s}`, origin: 'receipt', supplierId: b.supplier.id, status: 'released' }, ctx);
      const [rl] = await tx.insert(receiptLines).values({ receiptId: rc!.id, productId: b.raw.id, qty: '100', uomId: b.kg.id, unitCost: '10', lotId: rawLot.id, disposition: 'released', toLocationId: b.loc.hamR01.id }).returning();
      await postStockMove(tx, { kind: 'receipt', productId: b.raw.id, lotId: rawLot.id, fromLocationId: b.loc.sup.id, toLocationId: b.loc.hamR01.id, qty: d(100), uomId: b.kg.id, unitCost: d(10), refType: 'receipt', refId: rc!.id, refLineId: rl!.id, refNo: rc!.docNo, partnerId: b.supplier.id }, ctx);
      const [rawRow] = await tx.select().from(stockLots).where(eq(stockLots.id, rawLot.id));
      expect(rawRow!.originReceiptId).toBe(rc!.id);

      // İş emri
      const [bom] = await tx.insert(boms).values({ code: `BOM-${b.s}`, productId: b.finished.id, version: 1, status: 'active', outputQty: '20', outputUomId: b.kg.id }).returning();
      const [line] = await tx.insert(productionLines).values({ code: `HAT-${b.s}`, name: 'Hat', warehouseId: b.wh.id, locationId: b.loc.prod.id }).returning();
      const [wo] = await tx.insert(workOrders).values({
        docNo: `WO-T-${b.s}`, status: 'closed', productId: b.finished.id, bomId: bom!.id, lineId: line!.id, warehouseId: b.wh.id,
        sourceLocationId: b.loc.ham.id, destLocationId: b.loc.mamul.id, plannedQty: '20', producedQty: '20', uomId: b.kg.id,
      }).returning();
      const cons = await postStockMove(tx, { kind: 'consumption', productId: b.raw.id, lotId: rawLot.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.prod.id, qty: d(40), uomId: b.kg.id, refType: 'work_order', refId: wo!.id }, ctx);
      await tx.insert(workOrderConsumptions).values({ workOrderId: wo!.id, productId: b.raw.id, lotId: rawLot.id, fromLocationId: b.loc.hamR01.id, qty: '40', uomId: b.kg.id, unitCost: '10', value: '400', stockMoveId: cons.moveId });

      const outLot = await createLot(tx, { productId: b.finished.id, lotNo: `PL-${b.s}-H1-01`, origin: 'production', originWorkOrderId: wo!.id, productionDate: today() }, ctx);
      const prod = await postStockMove(tx, { kind: 'production', productId: b.finished.id, lotId: outLot.id, fromLocationId: b.loc.prod.id, toLocationId: b.loc.mamul.id, qty: d(20), uomId: b.kg.id, unitCost: d('22.5'), overheadValue: d(50), refType: 'work_order', refId: wo!.id }, ctx);
      await tx.insert(workOrderOutputs).values({ workOrderId: wo!.id, productId: b.finished.id, lotId: outLot.id, toLocationId: b.loc.mamul.id, qty: '20', uomId: b.kg.id, unitCost: '22.5', value: '450', stockMoveId: prod.moveId });
      await tx.update(workOrders).set({ outputLotId: outLot.id }).where(eq(workOrders.id, wo!.id));

      // Sevkiyat: 12 kg müşteriye, 8 kg elde
      const [dn] = await tx.insert(deliveries).values({ docNo: `DN-T-${b.s}`, status: 'shipped', partnerId: b.customer.id, warehouseId: b.wh.id, shippedAt: new Date() }).returning();
      await tx.insert(deliveryLines).values({ deliveryId: dn!.id, productId: b.finished.id, qty: '12', pickedQty: '12', uomId: b.kg.id, lotId: outLot.id, fromLocationId: b.loc.mamul.id, unitCost: '22.5' });
      await postStockMove(tx, { kind: 'delivery', productId: b.finished.id, lotId: outLot.id, fromLocationId: b.loc.mamul.id, toLocationId: b.loc.cust.id, qty: d(12), uomId: b.kg.id, refType: 'delivery', refId: dn!.id, partnerId: b.customer.id }, ctx);

      // Geri izleme: mamul lot → WO → hammadde lot → mal kabul → tedarikçi
      const back = await traceBackward(tx, outLot.id);
      const kinds = (r: { nodes: Array<{ kind: string; id: string }> }) => r.nodes.map((n) => n.kind);
      expect(kinds(back)).toEqual(expect.arrayContaining(['lot', 'work_order', 'receipt', 'partner']));
      expect(back.nodes.find((n) => n.id === `work_order:${wo!.id}`)?.label).toBe(wo!.docNo);
      expect(back.nodes.find((n) => n.id === `lot:${rawLot.id}`)?.depth).toBe(2);
      expect(back.nodes.find((n) => n.id === `receipt:${rc!.id}`)).toBeTruthy();
      expect(back.nodes.find((n) => n.id === `partner:${b.supplier.id}`)?.sub).toContain('Tedarikçi');
      expect(back.edges).toEqual(expect.arrayContaining([
        expect.objectContaining({ from: `work_order:${wo!.id}`, to: `lot:${outLot.id}` }),
        expect.objectContaining({ from: `lot:${rawLot.id}`, to: `work_order:${wo!.id}`, qty: '40.0000' }),
        expect.objectContaining({ from: `receipt:${rc!.id}`, to: `lot:${rawLot.id}` }),
        expect.objectContaining({ from: `partner:${b.supplier.id}`, to: `receipt:${rc!.id}` }),
      ]));

      // İleri izleme: hammadde lot → WO → mamul lot → sevkiyat → müşteri; eldeki stok (quant)
      const fwd = await traceForward(tx, rawLot.id);
      expect(kinds(fwd)).toEqual(expect.arrayContaining(['lot', 'work_order', 'delivery', 'partner', 'quant']));
      expect(fwd.nodes.find((n) => n.id === `lot:${outLot.id}`)?.depth).toBe(2);
      expect(fwd.nodes.find((n) => n.id === `delivery:${dn!.id}`)?.qty).toBe('12.0000');
      expect(fwd.nodes.find((n) => n.id === `partner:${b.customer.id}`)?.sub).toContain('Müşteri');
      const quants = fwd.nodes.filter((n) => n.kind === 'quant');
      // Hammadde kalan 60 + mamul kalan 8
      expect(quants.map((q) => q.qty).sort()).toEqual(['60.0000', '8.0000']);
      expect(fwd.edges).toEqual(expect.arrayContaining([
        expect.objectContaining({ from: `lot:${rawLot.id}`, to: `work_order:${wo!.id}` }),
        expect.objectContaining({ from: `work_order:${wo!.id}`, to: `lot:${outLot.id}` }),
        expect.objectContaining({ from: `lot:${outLot.id}`, to: `delivery:${dn!.id}`, qty: '12.0000' }),
        expect.objectContaining({ from: `delivery:${dn!.id}`, to: `partner:${b.customer.id}` }),
      ]));
      for (const n of fwd.nodes) expect(n.href).toMatch(/^\//);

      // Geri çağırma simülasyonu
      const impact = await simulateRecall(tx, rawLot.id, 'forward');
      expect(impact.counts).toEqual({ lots: 2, workOrders: 1, deliveries: 1, customers: 1 });
      expect(impact.customers[0]!.id).toBe(b.customer.id);
      expect(impact.qtyDelivered).toBe('12.0000');
      expect(impact.qtyInStock).toBe('68.0000');

      const both = await simulateRecall(tx, outLot.id, 'both');
      expect(both.counts.lots).toBe(2);
      expect(both.workOrders[0]!.docNo).toBe(wo!.docNo);
    });
  });
});
