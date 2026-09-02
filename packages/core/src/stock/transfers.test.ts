import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { warehouses, locations, stockQuants } from '@plantero/db';
import { createTransfer, completeTransfer, receiveTransfer } from './transfers.js';
import { receiveRawHelper } from './__test-utils__.js';
import { withRollback, seedBase, ctx, d } from '../__tests__/helpers.js';

describe('stock/transfers', () => {
  it('aynı depo içi transfer tek hareketle tamamlanır (done)', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const { lot } = await receiveRawHelper(tx, b, 'TR-SRC-1', '50', '10', { toLocationId: b.loc.hamR01.id, status: 'released' });

      const { transfer, lines } = await createTransfer(tx, {
        fromWarehouseId: b.wh.id, toWarehouseId: b.wh.id,
        lines: [{ productId: b.raw.id, lotId: lot.id, qty: d(20), uomId: b.kg.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.hamR02.id }],
      }, ctx);
      expect(transfer.status).toBe('draft');
      expect(lines).toHaveLength(1);

      const done = await completeTransfer(tx, transfer.id, ctx);
      expect(done.transfer.status).toBe('done');

      const src = await tx.select().from(stockQuants).where(eq(stockQuants.locationId, b.loc.hamR01.id));
      const dst = await tx.select().from(stockQuants).where(eq(stockQuants.locationId, b.loc.hamR02.id));
      expect(src.find((q) => q.lotId === lot.id)?.qty).toBe('30.0000');
      expect(dst.find((q) => q.lotId === lot.id)?.qty).toBe('20.0000');
    });
  });

  it('depolar arası transfer: transit ara durak (in_transit) → teslim al (done)', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const { lot } = await receiveRawHelper(tx, b, 'TR-SRC-2', '40', '10', { toLocationId: b.loc.hamR01.id, status: 'released' });

      // İkinci (Buca benzeri) depo + transit/hedef lokasyonu
      const [wh2] = await tx.insert(warehouses).values({ code: `B${b.s}`, name: `Buca ${b.s}` }).returning();
      const [transit] = await tx.insert(locations).values({ warehouseId: b.wh.id, code: `${b.s}/SEVK`, name: 'Sevkiyat', path: `${b.s}/SEVK`, usage: 'transit', isPickable: true }).returning();
      const [dest] = await tx.insert(locations).values({ warehouseId: wh2!.id, code: `B${b.s}/MAMUL`, name: 'Mamul', path: `B${b.s}/MAMUL`, usage: 'internal', isPickable: true }).returning();

      const { transfer } = await createTransfer(tx, {
        fromWarehouseId: b.wh.id, toWarehouseId: wh2!.id,
        lines: [{ productId: b.raw.id, lotId: lot.id, qty: d(15), uomId: b.kg.id, fromLocationId: b.loc.hamR01.id, toLocationId: dest!.id }],
      }, ctx);

      const started = await completeTransfer(tx, transfer.id, ctx);
      expect(started.transfer.status).toBe('in_transit');
      const inTransit = await tx.select().from(stockQuants).where(eq(stockQuants.locationId, transit!.id));
      expect(inTransit.find((q) => q.lotId === lot.id)?.qty).toBe('15.0000');

      const received = await receiveTransfer(tx, transfer.id, ctx);
      expect(received.transfer.status).toBe('done');
      const atDest = await tx.select().from(stockQuants).where(eq(stockQuants.locationId, dest!.id));
      expect(atDest.find((q) => q.lotId === lot.id)?.qty).toBe('15.0000');
      const transitAfter = await tx.select().from(stockQuants).where(eq(stockQuants.locationId, transit!.id));
      expect(transitAfter.find((q) => q.lotId === lot.id)?.qty).toBe('0.0000');
    });
  });
});
