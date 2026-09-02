import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { stockLots, stockQuants } from '@plantero/db';
import { getExpiryBuckets, scrapExpired } from './expiry.js';
import { receiveRawHelper } from './__test-utils__.js';
import { withRollback, seedBase, ctx, daysFromNow } from '../__tests__/helpers.js';

describe('stock/expiry', () => {
  it('30/60/90 kovaları doğru gruplanır; >90 gün listelenmez', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const { lot: expired } = await receiveRawHelper(tx, b, 'EXP-1', '10', '10', { expiryDate: daysFromNow(-2), toLocationId: b.loc.hamR01.id, status: 'released' });
      await receiveRawHelper(tx, b, 'EXP-2', '10', '10', { expiryDate: daysFromNow(15), toLocationId: b.loc.hamR01.id, status: 'released' });
      await receiveRawHelper(tx, b, 'EXP-3', '10', '10', { expiryDate: daysFromNow(45), toLocationId: b.loc.hamR01.id, status: 'released' });
      await receiveRawHelper(tx, b, 'EXP-4', '10', '10', { expiryDate: daysFromNow(200), toLocationId: b.loc.hamR01.id, status: 'released' });

      const buckets = await getExpiryBuckets(tx, { warehouseId: b.wh.id });
      const lotNos = buckets.rows.map((r) => r.lotNo);
      expect(lotNos).toContain('EXP-1');
      expect(lotNos).toContain('EXP-2');
      expect(lotNos).toContain('EXP-3');
      expect(lotNos).not.toContain('EXP-4'); // 200 gün > 90, panoda yok
      expect(buckets.totals.expired.count).toBe(1);
      expect(buckets.totals.critical.count).toBe(1); // 15 gün
      expect(buckets.totals.warning.count).toBe(1); // 45 gün

      const scrapped = await scrapExpired(tx, { lotId: expired.id, reason: 'SKT geçti' }, ctx);
      expect(scrapped.movedQty).toBe('10.0000');
      const [lotRow] = await tx.select().from(stockLots).where(eq(stockLots.id, expired.id));
      expect(lotRow!.status).toBe('expired');
      const q = await tx.select().from(stockQuants).where(eq(stockQuants.lotId, expired.id));
      expect(q.find((r) => r.locationId === b.loc.hamR01.id)?.qty).toBe('0.0000');
    });
  });
});
