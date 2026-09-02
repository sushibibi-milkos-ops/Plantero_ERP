import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { stockLots, stockQuants, qcChecks, purchaseOrders, purchaseOrderLines } from '@plantero/db';
import { createReceipt, receiveGoods, createAndReceive } from './receipts.js';
import { getOnHand } from './ledger.js';
import { withRollback, seedBase, ctx, d } from '../__tests__/helpers.js';
import { D } from '../money.js';

describe('stock/receipts', () => {
  it('QC gerektiren üründe karantinaya kabul + qc_checks bekleyen kaydı', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const res = await createAndReceive(tx, {
        warehouseId: b.wh.id, partnerId: b.supplier.id, supplierDeliveryNo: 'IRS-001',
        lines: [{ productId: b.raw.id, qty: d(100), uomId: b.kg.id, unitCost: d(12.5), supplierLotNo: 'TED-LOT-1' }],
      }, ctx);

      expect(res.receipt.status).toBe('qc_pending');
      expect(res.createdLotIds).toHaveLength(1);
      const [lot] = await tx.select().from(stockLots).where(eq(stockLots.id, res.createdLotIds[0]!));
      expect(lot!.status).toBe('quarantine');
      expect(lot!.lotNo).toBe('TED-LOT-1');
      expect(lot!.unitCost).toBe('12.5000');

      const qcs = await tx.select().from(qcChecks).where(eq(qcChecks.lotId, lot!.id));
      expect(qcs).toHaveLength(1);
      expect(qcs[0]!.result).toBe('pending');

      const oh = await getOnHand(tx, { productId: b.raw.id, lotId: lot!.id });
      expect(oh.qty.toFixed(4)).toBe('100.0000');
      expect(oh.value.toFixed(4)).toBe('1250.0000');
    });
  });

  it('kısmi red: kabul edilen ve red edilen ayrı lotlara düşer, red lotu RED lokasyonunda ve rejected', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const res = await createAndReceive(tx, {
        warehouseId: b.wh.id, partnerId: b.supplier.id,
        lines: [{ productId: b.raw.id, qty: d(100), uomId: b.kg.id, unitCost: d(10), supplierLotNo: 'PARTIAL-1', rejectedQty: d(15), rejectReason: 'nem yüksek', disposition: 'released' }],
      }, ctx);

      expect(res.createdLotIds).toHaveLength(2);
      const lots = await tx.select().from(stockLots).where(eq(stockLots.productId, b.raw.id));
      const accepted = lots.find((l) => l.lotNo === 'PARTIAL-1')!;
      const rejected = lots.find((l) => l.lotNo === 'PARTIAL-1-RED')!;
      expect(accepted.status).toBe('released');
      expect(D(accepted.initialQty).toFixed(4)).toBe('85.0000');
      expect(rejected.status).toBe('rejected');
      expect(rejected.rejectReason).toBe('nem yüksek');
      expect(D(rejected.initialQty).toFixed(4)).toBe('15.0000');

      const rejQuant = await tx.select().from(stockQuants).where(eq(stockQuants.lotId, rejected.id));
      expect(rejQuant[0]!.locationId).toBe(b.loc.red.id);
    });
  });

  it('PO satırından mal kabul: receivedQty artar ve document_links(purchase_order→receipt) kurulur', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const [po] = await tx.insert(purchaseOrders).values({ docNo: `PO-TEST-${b.s}`, partnerId: b.supplier.id, warehouseId: b.wh.id, orderDate: new Date().toISOString().slice(0, 10) }).returning();
      const [poLine] = await tx.insert(purchaseOrderLines).values({ orderId: po!.id, productId: b.raw.id, qty: d(100).toFixed(4), uomId: b.kg.id, unitPrice: d(12).toFixed(4) }).returning();

      const { receipt } = await createReceipt(tx, { warehouseId: b.wh.id, partnerId: b.supplier.id, purchaseOrderId: po!.id, lines: [{ purchaseOrderLineId: poLine!.id, productId: b.raw.id, qty: d(60), uomId: b.kg.id, unitCost: d(12) }] }, ctx);
      await receiveGoods(tx, receipt.id, ctx);

      const [updatedLine] = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.id, poLine!.id));
      expect(D(updatedLine!.receivedQty).toFixed(4)).toBe('60.0000');
      const [updatedPo] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, po!.id));
      expect(updatedPo!.status).toBe('partially_received');
    });
  });
});
