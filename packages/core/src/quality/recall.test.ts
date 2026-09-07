import { describe, it, expect } from 'vitest';
import { eq, inArray, and } from 'drizzle-orm';
import { schema } from '@plantero/db';
import { seedBase, withRollback, expectReject, ctx, d } from '../__tests__/helpers.js';
import { createLot, postStockMove, reserve } from '../stock/ledger.js';
import { simulate, initiate, closeRecall, recordRecallAction, buildDraftMessage } from './recall.js';
import type { RecallImpact } from '../lots/trace.js';

const { stockLots, recallItems, deliveries, deliveryLines } = schema;

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

  it('initiate(): eldeki stoğun bir kısmı rezerveliyken bile lotu bloklar (tur 2 P0 kalite-geri-cagirma)', async () => {
    await withRollback(async (tx) => {
      const base = await seedBase(tx);
      const lot = await createLot(tx, { productId: base.raw.id, lotNo: `RC4-${base.s}`, origin: 'receipt', unitCost: d(50), status: 'released' }, ctx);
      await postStockMove(tx, { kind: 'receipt', productId: base.raw.id, lotId: lot.id, fromLocationId: base.loc.sup.id, toLocationId: base.loc.hamR01.id, qty: d(40), uomId: base.kg.id, unitCost: d(50), refType: 'receipt', refId: lot.id }, ctx);
      // Eldeki 40 kg'ın 30'u bekleyen bir siparişe rezerve — önceki davranışta bu, initiate()'in
      // postStockMove(qty=40, useReserved verilmeden) çağırmasıyla INSUFFICIENT_STOCK (mevcut
      // kullanılabilir 10) fırlatıp tüm transaction'ı sessizce rollback ediyordu.
      await reserve(tx, { productId: base.raw.id, lotId: lot.id, locationId: base.loc.hamR01.id, qty: d(30) });

      const { recall } = await simulate(tx, { rootLotId: lot.id, direction: 'both', reason: 'Aflatoksin şüphesi' }, ctx);
      const initRes = await initiate(tx, recall.id, ctx);
      expect(initRes.blockedLots).toBeGreaterThanOrEqual(1);
      expect(initRes.recall.status).toBe('open');

      const [blocked] = await tx.select().from(stockLots).where(eq(stockLots.id, lot.id));
      expect(blocked!.status).toBe('recalled');

      // Tüm 40 kg karantinaya taşınmış olmalı (rezervasyon dahil) — kaynak lokasyonda eldeki miktar 0.
      const { stockQuants } = schema;
      const remaining = await tx.select().from(stockQuants).where(eq(stockQuants.lotId, lot.id));
      const remainingAtSource = remaining.find((q) => q.locationId === base.loc.hamR01.id);
      expect(remainingAtSource ? Number(remainingAtSource.qty) : 0).toBe(0);

      const item = await tx.select().from(recallItems).where(eq(recallItems.recallId, recall.id));
      const blockItem = item.find((i) => i.action === 'block');
      expect(Number(blockItem!.qtyInStock)).toBeCloseTo(40, 4);

      // destroy() aynı desenle rezerveli-eldeki miktarı da imha edebilmeli.
      const destroyed = await recordRecallAction(tx, blockItem!.id, 'destroy', 'İmha edildi', ctx);
      expect(destroyed.actionStatus).toBe('done');
    });
  });

  it('initiate(): henüz sevk edilmemiş bir irsaliyeyi de iptal eder (I43 kök neden düzeltmesi, tur 3)', async () => {
    await withRollback(async (tx) => {
      const base = await seedBase(tx);
      const lot = await createLot(tx, { productId: base.raw.id, lotNo: `RC5-${base.s}`, origin: 'receipt', unitCost: d(50), status: 'released' }, ctx);
      await postStockMove(tx, { kind: 'receipt', productId: base.raw.id, lotId: lot.id, fromLocationId: base.loc.sup.id, toLocationId: base.loc.hamR01.id, qty: d(40), uomId: base.kg.id, unitCost: d(50), refType: 'receipt', refId: lot.id }, ctx);
      // Lotun 15 kg'ı HENÜZ SEVK EDİLMEMİŞ (status='reserved') bir irsaliyeye rezerve/atanmış —
      // önceki davranışta initiate() bu irsaliyeye hiç dokunmuyordu (I43: open_delivery_line_blocked_lot).
      await reserve(tx, { productId: base.raw.id, lotId: lot.id, locationId: base.loc.hamR01.id, qty: d(15) });
      const [delivery] = await tx
        .insert(deliveries)
        .values({ docNo: `DN-TEST-${base.s}`, status: 'reserved', partnerId: base.customer.id, warehouseId: base.wh.id, origin: 'chain' })
        .returning();
      await tx.insert(deliveryLines).values({
        deliveryId: delivery!.id, productId: base.raw.id, qty: '15.0000', uomId: base.kg.id,
        lotId: lot.id, fromLocationId: base.loc.hamR01.id,
      });

      const { recall } = await simulate(tx, { rootLotId: lot.id, direction: 'both', reason: 'Aflatoksin şüphesi' }, ctx);
      const initRes = await initiate(tx, recall.id, ctx);
      expect(initRes.cancelledDeliveries).toBe(1);
      expect(initRes.cancelledDeliveryDocNos).toContain(delivery!.docNo);

      const [updatedDelivery] = await tx.select().from(deliveries).where(eq(deliveries.id, delivery!.id));
      expect(updatedDelivery!.status).toBe('cancelled');

      // I43: açık (draft/reserved/picking/picked) hiçbir irsaliye satırı artık bloklanan lota bağlı kalmamalı.
      const openBlockedLines = await tx
        .select({ id: deliveryLines.id })
        .from(deliveryLines)
        .innerJoin(deliveries, eq(deliveries.id, deliveryLines.deliveryId))
        .where(and(eq(deliveryLines.lotId, lot.id), inArray(deliveries.status, ['draft', 'reserved', 'picking', 'picked'])));
      expect(openBlockedLines.length).toBe(0);
    });
  });

  it("recordRecallAction('return'): müşteriden fiziksel iadeyi karantinaya postStockMove(kind='recall_return') ile taşır (Tur 7 P0 I57 kök neden düzeltmesi)", async () => {
    await withRollback(async (tx) => {
      const base = await seedBase(tx);
      const lot = await createLot(tx, { productId: base.raw.id, lotNo: `RC6-${base.s}`, origin: 'receipt', unitCost: d(50), status: 'released' }, ctx);
      await postStockMove(tx, { kind: 'receipt', productId: base.raw.id, lotId: lot.id, fromLocationId: base.loc.sup.id, toLocationId: base.loc.hamR01.id, qty: d(40), uomId: base.kg.id, unitCost: d(50), refType: 'receipt', refId: lot.id }, ctx);

      // 25 kg zaten müşteriye sevk edilmiş (irsaliye 'delivered' — initiate()'in irsaliye iptal
      // bloğu yalnızca draft/reserved/picking/picked'ı iptal eder, delivered'a dokunmaz).
      const [delivery] = await tx
        .insert(deliveries)
        .values({ docNo: `DN-RETURN-${base.s}`, status: 'delivered', partnerId: base.customer.id, warehouseId: base.wh.id, origin: 'chain' })
        .returning();
      await tx.insert(deliveryLines).values({
        deliveryId: delivery!.id, productId: base.raw.id, qty: '25.0000', pickedQty: '25.0000', uomId: base.kg.id,
        lotId: lot.id, fromLocationId: base.loc.hamR01.id,
      });
      await postStockMove(tx, { kind: 'delivery', productId: base.raw.id, lotId: lot.id, fromLocationId: base.loc.hamR01.id, toLocationId: base.loc.cust.id, qty: d(25), uomId: base.kg.id, refType: 'delivery', refId: delivery!.id, refLineId: undefined, refNo: delivery!.docNo }, ctx);

      const { recall } = await simulate(tx, { rootLotId: lot.id, direction: 'both', reason: 'Aflatoksin şüphesi' }, ctx);
      await initiate(tx, recall.id, ctx);

      const items = await tx.select().from(recallItems).where(and(eq(recallItems.recallId, recall.id), eq(recallItems.hop, 'delivered')));
      const deliveredItem = items.find((i) => i.deliveryId === delivery!.id);
      expect(deliveredItem).toBeTruthy();
      expect(Number(deliveredItem!.qtyDelivered)).toBeCloseTo(25, 4);

      const { stockQuants, stockMoves } = schema;
      const before = await tx.select().from(stockQuants).where(and(eq(stockQuants.lotId, lot.id), eq(stockQuants.locationId, base.loc.kar.id)));
      const beforeQty = before.reduce((acc, q) => acc + Number(q.qty), 0);

      const updated = await recordRecallAction(tx, deliveredItem!.id, 'return', 'Müşteriden iade alındı', ctx);
      expect(updated.actionStatus).toBe('done');
      expect(updated.action).toBe('return');

      // Fiziksel iade: karantina lokasyonunda 25 kg artmış olmalı.
      const after = await tx.select().from(stockQuants).where(and(eq(stockQuants.lotId, lot.id), eq(stockQuants.locationId, base.loc.kar.id)));
      const afterQty = after.reduce((acc, q) => acc + Number(q.qty), 0);
      expect(afterQty - beforeQty).toBeCloseTo(25, 4);

      // TEK stok yazma noktası: kind='recall_return', refType='recall_item', refId=item.id.
      const moves = await tx.select().from(stockMoves).where(and(eq(stockMoves.kind, 'recall_return'), eq(stockMoves.refType, 'recall_item'), eq(stockMoves.refId, deliveredItem!.id)));
      expect(moves.length).toBe(1);
      expect(Number(moves[0]!.qty)).toBeCloseTo(25, 4);

      // Tur 9 P0 düzeltmesi (I58): aynı itemId için ikinci bir 'return' çağrısı (çift tık/ağ
      // gecikmesi/yeniden-deneme) artık RECALL_ITEM_ALREADY_ACTIONED ile reddedilir — hayali/phantom
      // ikinci bir postStockMove ÜRETİLMEZ.
      await expect(recordRecallAction(tx, deliveredItem!.id, 'return', 'İkinci deneme', ctx)).rejects.toMatchObject({ code: 'RECALL_ITEM_ALREADY_ACTIONED' });

      const movesAfterRetry = await tx.select().from(stockMoves).where(and(eq(stockMoves.kind, 'recall_return'), eq(stockMoves.refType, 'recall_item'), eq(stockMoves.refId, deliveredItem!.id)));
      expect(movesAfterRetry.length).toBe(1);
      const afterRetry = await tx.select().from(stockQuants).where(and(eq(stockQuants.lotId, lot.id), eq(stockQuants.locationId, base.loc.kar.id)));
      const afterRetryQty = afterRetry.reduce((acc, q) => acc + Number(q.qty), 0);
      expect(afterRetryQty - beforeQty).toBeCloseTo(25, 4);
    });
  });

  it('buildDraftMessage(): müşteriye giden taslak ham Decimal string basmaz (tur 1 P1 core-recall-01)', () => {
    const impact: RecallImpact = {
      lots: [], workOrders: [], deliveries: [], customers: [],
      qtyInStock: '5.2620', qtyDelivered: '38.0000',
      qtyInStockByUom: [{ uom: 'KG', qty: '5.2620' }], qtyDeliveredByUom: [{ uom: 'KG', qty: '38.0000' }],
      counts: { lots: 4, workOrders: 1, deliveries: 3, customers: 2 },
    };
    const msg = buildDraftMessage('Aflatoksin şüphesi', impact);
    expect(msg).toContain('Sevk edilen miktar: 38');
    expect(msg).not.toMatch(/\d+\.\d{2,4}\b/); // "38.0000" gibi ham numeric(18,4) string kalmamalı
  });
});
