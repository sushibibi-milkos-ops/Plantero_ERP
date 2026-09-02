import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { salesChannels, salesOrders, salesOrderLines, stockLots, stockQuants, type Tx } from '@plantero/db';
import { createDeliveryFromOrder, reserveFefo, confirmPick, shipDelivery, markDelivered } from './deliveries.js';
import { createLot, postStockMove } from './ledger.js';
import { withRollback, seedBase, ctx, d, daysFromNow, type Base } from '../__tests__/helpers.js';
import { D } from '../money.js';

async function seedSalesOrder(tx: Tx, b: Base, qty = 30) {
  const [channel] = await tx.insert(salesChannels).values({ code: `CH-${b.s}`, name: `Kanal ${b.s}`, kind: 'wholesale' }).returning();
  const [order] = await tx
    .insert(salesOrders)
    .values({ docNo: `SO-TEST-${b.s}`, partnerId: b.customer.id, channelId: channel!.id, warehouseId: b.wh.id, orderDate: new Date().toISOString().slice(0, 10) })
    .returning();
  const [line] = await tx
    .insert(salesOrderLines)
    .values({ orderId: order!.id, productId: b.finished.id, qty: d(qty).toFixed(4), uomId: b.kg.id, unitPrice: d(100).toFixed(4) })
    .returning();
  return { order: order!, line: line! };
}

async function stockFinished(tx: Tx, b: Base, lotNo: string, qty: string, expiryDays: number) {
  const lot = await createLot(tx, { productId: b.finished.id, lotNo, origin: 'production', expiryDate: daysFromNow(expiryDays), unitCost: d(50), status: 'released' }, ctx);
  await postStockMove(tx, { kind: 'production', productId: b.finished.id, lotId: lot.id, fromLocationId: b.loc.prod.id, toLocationId: b.loc.mamul.id, qty: d(qty), uomId: b.kg.id, unitCost: d(50), refType: 'work_order', refId: '00000000-0000-4000-8000-000000000099' }, ctx);
  return lot;
}

describe('stock/deliveries', () => {
  it('sipariş → rezerve (FEFO) → topla → sevk → teslim', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const early = await stockFinished(tx, b, 'PL-EARLY', '20', 10);
      await stockFinished(tx, b, 'PL-LATE', '20', 60);
      const { order } = await seedSalesOrder(tx, b, 30);

      const { delivery } = await createDeliveryFromOrder(tx, order.id, {}, ctx);
      expect(delivery.status).toBe('draft');

      const reserved = await reserveFefo(tx, delivery.id, ctx);
      expect(reserved.delivery.status).toBe('reserved');
      // FEFO: önce erken SKT'li 20, sonra geç SKT'liden 10 — iki satıra bölünmeli
      expect(reserved.lines).toHaveLength(2);
      const firstLine = reserved.lines.find((l) => l.lotId === early.id)!;
      expect(D(firstLine.qty).toFixed(4)).toBe('20.0000');

      // Yanlış lot okutulursa FEFO_MISMATCH
      const otherLine = reserved.lines.find((l) => l.id !== firstLine.id)!;
      await expect(confirmPick(tx, { deliveryId: delivery.id, lineId: firstLine.id, scannedLotId: otherLine.lotId }, ctx)).rejects.toMatchObject({ code: 'FEFO_MISMATCH' });

      await confirmPick(tx, { deliveryId: delivery.id, lineId: firstLine.id, scannedLotId: firstLine.lotId }, ctx);
      const picked = await confirmPick(tx, { deliveryId: delivery.id, lineId: otherLine.id, scannedLotId: otherLine.lotId }, ctx);
      expect(picked.delivery.status).toBe('picked');

      const shipped = await shipDelivery(tx, delivery.id, ctx);
      expect(shipped.delivery.status).toBe('shipped');

      const [soLine] = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, order.id));
      expect(D(soLine!.deliveredQty).toFixed(4)).toBe('30.0000');
      const [orderRow] = await tx.select().from(salesOrders).where(eq(salesOrders.id, order.id));
      expect(orderRow!.status).toBe('delivered');

      const [lotRow] = await tx.select().from(stockLots).where(eq(stockLots.id, early.id));
      expect(lotRow!.status).toBe('released'); // yalnızca 'consumption' hareketi lotu 'consumed' yapar; sevkiyat sonrası quant 0'a düşer
      const remaining = await tx.select().from(stockQuants).where(eq(stockQuants.lotId, early.id));
      expect(remaining[0]!.qty).toBe('0.0000');

      const delivered = await markDelivered(tx, delivery.id, ctx);
      expect(delivered.status).toBe('delivered');
      expect(delivered.deliveredAt).toBeTruthy();
    });
  });

  it('rezerve edilmeden sevk edilemez; karantinadaki lot toplama ekranında engellenir', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await stockFinished(tx, b, 'PL-X', '10', 40);
      const { order } = await seedSalesOrder(tx, b, 10);
      const { delivery } = await createDeliveryFromOrder(tx, order.id, {}, ctx);
      await expect(shipDelivery(tx, delivery.id, ctx)).rejects.toMatchObject({ code: 'NOT_RESERVED' });

      const reserved = await reserveFefo(tx, delivery.id, ctx);
      const line = reserved.lines[0]!;
      // Lotu karantinaya al, sonra okutmayı dene
      await tx.update(stockLots).set({ status: 'quarantine' }).where(eq(stockLots.id, line.lotId!));
      await expect(confirmPick(tx, { deliveryId: delivery.id, lineId: line.id, scannedLotId: line.lotId }, ctx)).rejects.toMatchObject({ code: 'LOT_NOT_RELEASED' });
    });
  });
});
