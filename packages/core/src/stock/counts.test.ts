import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { stockQuants, approvals } from '@plantero/db';
import { createCount, snapshotCount, recordCount, submitReview, approveCount, postCount } from './counts.js';
import { receiveRawHelper } from './__test-utils__.js';
import { withRollback, seedBase, ctx, d } from '../__tests__/helpers.js';

describe('stock/counts', () => {
  it('küçük fark: doğrudan onaylanır ve count_gain/count_loss hareketleri atılır', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const { lot } = await receiveRawHelper(tx, b, 'CNT-1', '100', '10', { toLocationId: b.loc.hamR01.id, status: 'released' });

      const count = await createCount(tx, { warehouseId: b.wh.id, scopeLocationId: b.loc.ham.id, countDate: new Date() }, ctx);
      const snap = await snapshotCount(tx, count.id, ctx);
      expect(snap.count.status).toBe('counting');
      expect(snap.lines).toHaveLength(1);
      expect(snap.lines[0]!.systemQty).toBe('100.0000');

      await recordCount(tx, { countId: count.id, lineId: snap.lines[0]!.id, countedQty: d(97) }, ctx);
      const reviewed = await submitReview(tx, count.id, ctx);
      expect(reviewed.status).toBe('review');

      const approved = await approveCount(tx, count.id, ctx);
      expect(approved.status).toBe('approved');

      const posted = await postCount(tx, count.id, ctx);
      expect(posted.count.status).toBe('posted');

      const q = await tx.select().from(stockQuants).where(eq(stockQuants.locationId, b.loc.hamR01.id));
      expect(q.find((r) => r.lotId === lot.id)?.qty).toBe('97.0000');
    });
  });

  it('büyük fark (>5.000 TL): approvals kuyruğuna düşer, GM onaylayana kadar kaydedilemez', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await receiveRawHelper(tx, b, 'CNT-2', '1000', '10', { toLocationId: b.loc.hamR01.id, status: 'released' });

      const count = await createCount(tx, { warehouseId: b.wh.id, scopeLocationId: b.loc.ham.id, countDate: new Date() }, ctx);
      const snap = await snapshotCount(tx, count.id, ctx);
      // Fark: 1000 → 400, |Δ|=600 birim × 10 TL = 6.000 TL (> eşik)
      await recordCount(tx, { countId: count.id, lineId: snap.lines[0]!.id, countedQty: d(400) }, ctx);
      await submitReview(tx, count.id, ctx);

      const first = await approveCount(tx, count.id, ctx);
      expect(first.status).toBe('pending_approval');
      if (first.status !== 'pending_approval') throw new Error('unreachable');
      const [approval] = await tx.select().from(approvals).where(eq(approvals.id, first.approvalId));
      expect(approval!.status).toBe('pending');
      expect(approval!.kind).toBe('count_variance');

      // GM henüz onaylamadı — tekrar çağrı hâlâ bekliyor döner
      const second = await approveCount(tx, count.id, ctx);
      expect(second.status).toBe('pending_approval');

      // GM onaylar
      await tx.update(approvals).set({ status: 'approved', decidedBy: ctx.userId, decidedAt: new Date() }).where(eq(approvals.id, first.approvalId));
      const third = await approveCount(tx, count.id, ctx);
      expect(third.status).toBe('approved');

      const posted = await postCount(tx, count.id, ctx);
      expect(posted.count.status).toBe('posted');
    });
  });
});
