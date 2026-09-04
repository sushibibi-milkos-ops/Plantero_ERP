import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@plantero/db';
import { seedBase, withRollback, expectReject, ctx, d } from '../__tests__/helpers.js';
import { createLot, postStockMove } from '../stock/ledger.js';
import { simulate, initiate, closeRecall, recordRecallAction } from './recall.js';

const { stockLots, recallItems } = schema;

describe('quality/recall', () => {
  it('simulate(): etkiyi hesaplar ve bir simülasyon kaydı açar, stoğa dokunmaz', async () => {
    await withRollback(async (tx) => {
      const base = await seedBase(tx);
      const lot = await createLot(tx, { productId: base.raw.id, lotNo: `RC-${base.s}`, origin: 'receipt', unitCost: d(50), status: 'released' }, ctx);
      await postStockMove(tx, { kind: 'receipt', productId: base.raw.id, lotId: lot.id, fromLocationId: base.loc.sup.id, toLocationId: base.loc.hamR01.id, qty: d(40), uomId: base.kg.id, unitCost: d(50), refType: 'receipt', refId: lot.id }, ctx);

      const res = await simulate(tx, { rootLotId: lot.id, direction: 'both', reason: 'Aflatoksin şüphesi' }, ctx);
      expect(res.recall.status).toBe('simulation');
      expect(res.impact.counts.lots).toBeGreaterThanOrEqual(1);

      const [unchanged] = await tx.select().from(stockLots).where(eq(stockLots.id, lot.id));
      expect(unchanged!.status).toBe('released'); // simülasyon lotu bloklamaz
    });
  });

  it('initiate(): lotları recalled yapıp bloklar, recall_items yazar, tekrar başlatılamaz', async () => {
    await withRollback(async (tx) => {
      const base = await seedBase(tx);
      const lot = await createLot(tx, { productId: base.raw.id, lotNo: `RC2-${base.s}`, origin: 'receipt', unitCost: d(50), status: 'released' }, ctx);
      await postStockMove(tx, { kind: 'receipt', productId: base.raw.id, lotId: lot.id, fromLocationId: base.loc.sup.id, toLocationId: base.loc.hamR01.id, qty: d(40), uomId: base.kg.id, unitCost: d(50), refType: 'receipt', refId: lot.id }, ctx);
      const { recall } = await simulate(tx, { rootLotId: lot.id, direction: 'both', reason: 'Aflatoksin şüphesi' }, ctx);

      const initRes = await initiate(tx, recall.id, ctx);
      expect(initRes.blockedLots).toBeGreaterThanOrEqual(1);
      expect(initRes.recall.status).toBe('open');

      const [blocked] = await tx.select().from(stockLots).where(eq(stockLots.id, lot.id));
      expect(blocked!.status).toBe('recalled');
      expect(blocked!.recallId).toBe(recall.id);

      // Bloklanmış lot artık üretime/sevke giremez.
      const err = await expectReject(tx, (sp) =>
        postStockMove(sp, { kind: 'consumption', productId: base.raw.id, lotId: lot.id, fromLocationId: base.loc.hamR01.id, toLocationId: base.loc.prod.id, qty: d(5), uomId: base.kg.id, refType: 'work_order', refId: lot.id }, ctx),
      );
      expect(String((err as Error).message)).toMatch(/serbest|released/i);

      const items = await tx.select().from(recallItems).where(eq(recallItems.recallId, recall.id));
      expect(items.length).toBeGreaterThanOrEqual(1);

      const err2 = await expectReject(tx, (sp) => initiate(sp, recall.id, ctx));
      expect(String((err2 as Error).message)).toMatch(/başlatılmış/);
    });
  });

  it('aksiyon kaydı → in_progress, kapatma → closed', async () => {
    await withRollback(async (tx) => {
      const base = await seedBase(tx);
      const lot = await createLot(tx, { productId: base.raw.id, lotNo: `RC3-${base.s}`, origin: 'receipt', unitCost: d(50), status: 'released' }, ctx);
      await postStockMove(tx, { kind: 'receipt', productId: base.raw.id, lotId: lot.id, fromLocationId: base.loc.sup.id, toLocationId: base.loc.hamR01.id, qty: d(10), uomId: base.kg.id, unitCost: d(50), refType: 'receipt', refId: lot.id }, ctx);
      const { recall } = await simulate(tx, { rootLotId: lot.id, direction: 'both', reason: 'Test' }, ctx);
      await initiate(tx, recall.id, ctx);
      const [item] = await tx.select().from(recallItems).where(eq(recallItems.recallId, recall.id)).limit(1);

      const updated = await recordRecallAction(tx, item!.id, 'destroy', 'İmha edildi', ctx);
      expect(updated.actionStatus).toBe('done');

      const closed = await closeRecall(tx, recall.id, ctx);
      expect(closed.status).toBe('closed');
      expect(closed.closedAt).not.toBeNull();
    });
  });
});
