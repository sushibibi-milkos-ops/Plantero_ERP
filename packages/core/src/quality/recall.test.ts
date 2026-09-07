import { describe, it, expect } from 'vitest';
import { eq, inArray, and } from 'drizzle-orm';
import { schema } from '@plantero/db';
import { seedBase, withRollback, expectReject, ctx, d } from '../__tests__/helpers.js';
import { seedProductionBase } from '../production/__test-utils__.js';
import { receiveRawHelper } from '../stock/__test-utils__.js';
import { createWorkOrder, releaseWorkOrder, startWorkOrder } from '../production/workOrders.js';
import { autoConsumeRemaining } from '../production/consume.js';
import { finishWorkOrder } from '../production/finish.js';
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

  it("initiate(): 'delivered' recall_items satırının lotId'si GERÇEKTEN sevk edilen lotla eşleşir — tek hammadde lotundan 2 farklı iş emriyle üretilen 2 farklı mamul lotu 2 ayrı irsaliyeyle sevk edildiğinde kök hammadde lotuyla karıştırılmaz (I59 kök neden düzeltmesi, checks/59_recall_delivered_lot_identity.sql)", async () => {
    await withRollback(async (tx) => {
      const base = await seedProductionBase(tx);
      const { lot: rootLot } = await receiveRawHelper(tx, base, `RC59-${base.s}`, '100', '10', { toLocationId: base.loc.hamR01.id, status: 'released' });

      async function produceLot(qty: string) {
        const { workOrder } = await createWorkOrder(tx, { productId: base.finished.id, warehouseId: base.wh.id, plannedQty: d(qty) }, ctx);
        await releaseWorkOrder(tx, workOrder.id, ctx);
        await startWorkOrder(tx, workOrder.id, ctx);
        await autoConsumeRemaining(tx, workOrder.id, ctx); // rootLot'tan FEFO ile tüketir (stokta tek hammadde lotu)
        const { lot } = await finishWorkOrder(tx, { workOrderId: workOrder.id, producedQty: d(qty) }, ctx);
        if (!lot) throw new Error('Mamul lot oluşmadı');
        // Bitirme anında bu lot için tek bir quant satırı vardır (henüz hiç sevk edilmedi) — üretimin
        // fiilen yazdığı hedef lokasyonu (`wo.destLocationId`) varsayım yerine doğrudan sorgudan alır.
        const [quant] = await tx.select({ locationId: schema.stockQuants.locationId }).from(schema.stockQuants).where(eq(schema.stockQuants.lotId, lot.id)).limit(1);
        return { lot, locationId: quant!.locationId };
      }

      async function ship(tag: string, lot: typeof rootLot, fromLocationId: string, qty: string) {
        const [delivery] = await tx
          .insert(deliveries)
          .values({ docNo: `DN59-${tag}-${base.s}`, status: 'delivered', partnerId: base.customer.id, warehouseId: base.wh.id, origin: 'chain' })
          .returning();
        await tx.insert(deliveryLines).values({
          deliveryId: delivery!.id, productId: base.finished.id, qty: `${qty}.0000`, pickedQty: `${qty}.0000`, uomId: base.kg.id,
          lotId: lot.id, fromLocationId,
        });
        await postStockMove(tx, { kind: 'delivery', productId: base.finished.id, lotId: lot.id, fromLocationId, toLocationId: base.loc.cust.id, qty: d(qty), uomId: base.kg.id, refType: 'delivery', refId: delivery!.id, refNo: delivery!.docNo }, ctx);
        return delivery!;
      }

      // Aynı hammadde lotundan (rootLot) iki AYRI iş emriyle iki farklı mamul lotu üretilir.
      const a = await produceLot('30');
      const b = await produceLot('30');
      expect(a.lot.id).not.toBe(b.lot.id);

      // İki farklı mamul lotu iki AYRI irsaliyeyle sevk edilir.
      const deliveryA = await ship('A', a.lot, a.locationId, '30');
      const deliveryB = await ship('B', b.lot, b.locationId, '30');

      const { recall } = await simulate(tx, { rootLotId: rootLot.id, direction: 'forward', reason: 'I59 regresyon' }, ctx);
      await initiate(tx, recall.id, ctx);

      const delivered = await tx.select().from(recallItems).where(and(eq(recallItems.recallId, recall.id), eq(recallItems.hop, 'delivered')));
      expect(delivered.length).toBe(2);

      const itemA = delivered.find((i) => i.deliveryId === deliveryA.id);
      const itemB = delivered.find((i) => i.deliveryId === deliveryB.id);
      expect(itemA).toBeTruthy();
      expect(itemB).toBeTruthy();
      // Kök neden düzeltmesi: her satır GERÇEKTEN kendi irsaliyesinin taşıdığı mamul lotunu taşımalı.
      expect(itemA!.lotId).toBe(a.lot.id);
      expect(itemB!.lotId).toBe(b.lot.id);
      // Eski (P0) davranış: HER İKİ satır da kök hammadde lotunun id'siyle yazılırdı — bu artık YANLIŞ.
      expect(itemA!.lotId).not.toBe(rootLot.id);
      expect(itemB!.lotId).not.toBe(rootLot.id);

      // I59 SQL kontrolüyle birebir aynı doğrulama: recall_items.lot_id, delivery_lines'taki gerçek
      // sevk edilen lotla eşleşmeli.
      for (const item of delivered) {
        const [dl] = await tx.select().from(deliveryLines).where(and(eq(deliveryLines.deliveryId, item.deliveryId!), eq(deliveryLines.lotId, item.lotId!)));
        expect(dl).toBeTruthy();
      }
    });
  });

  it("initiate(): AYNI fiziksel irsaliyeye FEFO'nun böldüğü İKİ farklı mamul lotunun HER İKİSİ için de ayrı 'delivered' recall_items satırı üretir (I60 kök neden düzeltmesi, checks/60_recall_delivered_item_completeness.sql)", async () => {
    await withRollback(async (tx) => {
      const base = await seedProductionBase(tx);
      const { lot: rootLot } = await receiveRawHelper(tx, base, `RC60-${base.s}`, '100', '10', { toLocationId: base.loc.hamR01.id, status: 'released' });

      async function produceLot(qty: string) {
        const { workOrder } = await createWorkOrder(tx, { productId: base.finished.id, warehouseId: base.wh.id, plannedQty: d(qty) }, ctx);
        await releaseWorkOrder(tx, workOrder.id, ctx);
        await startWorkOrder(tx, workOrder.id, ctx);
        await autoConsumeRemaining(tx, workOrder.id, ctx); // rootLot'tan FEFO ile tüketir (stokta tek hammadde lotu)
        const { lot } = await finishWorkOrder(tx, { workOrderId: workOrder.id, producedQty: d(qty) }, ctx);
        if (!lot) throw new Error('Mamul lot oluşmadı');
        const [quant] = await tx.select({ locationId: schema.stockQuants.locationId }).from(schema.stockQuants).where(eq(schema.stockQuants.lotId, lot.id)).limit(1);
        return { lot, locationId: quant!.locationId };
      }

      // Aynı hammadde lotundan (rootLot) iki AYRI iş emriyle iki farklı mamul lotu üretilir.
      const a = await produceLot('30');
      const b = await produceLot('30');
      expect(a.lot.id).not.toBe(b.lot.id);

      // FEFO'nun tek sipariş satırını böldüğü tipik senaryo: İKİ mamul lotu TEK bir fiziksel irsaliyeye
      // (aynı deliveries.id) iki AYRI delivery_lines satırı olarak sevk edilir.
      const [delivery] = await tx
        .insert(deliveries)
        .values({ docNo: `DN60-${base.s}`, status: 'delivered', partnerId: base.customer.id, warehouseId: base.wh.id, origin: 'chain' })
        .returning();
      await tx.insert(deliveryLines).values([
        { deliveryId: delivery!.id, productId: base.finished.id, qty: '30.0000', pickedQty: '30.0000', uomId: base.kg.id, lotId: a.lot.id, fromLocationId: a.locationId },
        { deliveryId: delivery!.id, productId: base.finished.id, qty: '30.0000', pickedQty: '30.0000', uomId: base.kg.id, lotId: b.lot.id, fromLocationId: b.locationId },
      ]);
      await postStockMove(tx, { kind: 'delivery', productId: base.finished.id, lotId: a.lot.id, fromLocationId: a.locationId, toLocationId: base.loc.cust.id, qty: d('30'), uomId: base.kg.id, refType: 'delivery', refId: delivery!.id, refNo: delivery!.docNo }, ctx);
      await postStockMove(tx, { kind: 'delivery', productId: base.finished.id, lotId: b.lot.id, fromLocationId: b.locationId, toLocationId: base.loc.cust.id, qty: d('30'), uomId: base.kg.id, refType: 'delivery', refId: delivery!.id, refNo: delivery!.docNo }, ctx);

      const { recall } = await simulate(tx, { rootLotId: rootLot.id, direction: 'forward', reason: 'I60 regresyon' }, ctx);
      await initiate(tx, recall.id, ctx);

      const delivered = await tx.select().from(recallItems).where(and(eq(recallItems.recallId, recall.id), eq(recallItems.hop, 'delivered')));
      // Kök neden düzeltmesinden ÖNCE: bu irsaliye TEK satır (yalnızca ilk ziyaret edilen lot) üretirdi.
      expect(delivered.length).toBe(2);
      expect(new Set(delivered.map((i) => i.deliveryId))).toEqual(new Set([delivery!.id]));

      const itemA = delivered.find((i) => i.lotId === a.lot.id);
      const itemB = delivered.find((i) => i.lotId === b.lot.id);
      expect(itemA).toBeTruthy();
      expect(itemB).toBeTruthy();
      expect(itemA!.qtyDelivered).toBe('30.0000');
      expect(itemB!.qtyDelivered).toBe('30.0000');

      // I60 SQL kontrolüyle birebir aynı doğrulama: zincir üyesi her lotun GERÇEKTEN sevk edildiği
      // her (delivery, lot) çifti için mutlaka bir 'delivered' satırı olmalı — hiçbiri kayıp değil.
      const shippedPairs = await tx
        .select({ deliveryId: deliveryLines.deliveryId, lotId: deliveryLines.lotId })
        .from(deliveryLines)
        .where(inArray(deliveryLines.lotId, [a.lot.id, b.lot.id]));
      for (const pair of shippedPairs) {
        const match = delivered.find((i) => i.deliveryId === pair.deliveryId && i.lotId === pair.lotId);
        expect(match, `(${pair.deliveryId}/${pair.lotId}) için kayıp recall_items satırı`).toBeTruthy();
      }
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
