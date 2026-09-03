import { eq, sql } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import {
  receipts, receiptLines, products, qcChecks, purchaseOrders, purchaseOrderLines, stockLots, type DbOrTx,
} from '@plantero/db';
import { D, toDb, round4, ZERO } from '../money.js';
import { businessDate } from '../dates.js';
import { nextDocNo } from '../sequences.js';
import { linkDocuments, indexDocument } from '../documents/chain.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import { writeAudit } from '../audit/index.js';
import { createLot, postStockMove } from './ledger.js';
import { getSuppliersLocation, getQuarantineLocation, getRejectedLocation, resolveDefaultPutawayLocation } from './locations.js';
import { createPurchaseInvoiceFromReceipt } from '../purchasing/invoicing.js';
import type { ActorCtx, DocumentOrigin } from '../types.js';

/**
 * Mal kabul — `packages/db/src/schema/stock.ts` (`receipts`/`receipt_lines`) üzerinde çalışır.
 * Stok yazımı yalnızca `stock/ledger.postStockMove` ile yapılır (sözleşme #3).
 */

export type ReceiptLineInput = {
  purchaseOrderLineId?: string | null;
  productId: string;
  qty: Decimal;
  uomId: string;
  unitCost: Decimal;
  supplierLotNo?: string | null;
  expiryDate?: string | Date | null;
  productionDate?: string | Date | null;
  /** Kabul kararı: verilmezse ürünün requiresIncomingQc alanına göre (karantina/serbest) */
  disposition?: 'quarantine' | 'released' | 'rejected';
  /** Hedef lokasyon (verilmezse dispozisyona göre varsayılan) */
  toLocationId?: string | null;
  /** Kısmi red miktarı (qty içinden düşer; kalan kabul edilen miktardır) */
  rejectedQty?: Decimal;
  rejectReason?: string | null;
  note?: string | null;
};

export type CreateReceiptInput = {
  warehouseId: string;
  partnerId?: string | null;
  purchaseOrderId?: string | null;
  supplierDeliveryNo?: string | null;
  supplierDeliveryDate?: string | Date | null;
  origin?: DocumentOrigin;
  note?: string | null;
  lines: ReceiptLineInput[];
};

export type ReceiptWithLines = { receipt: typeof receipts.$inferSelect; lines: Array<typeof receiptLines.$inferSelect> };

/** Taslak mal kabul belgesi oluşturur — henüz hiçbir stok hareketi yapılmaz (bkz. `receiveGoods`). */
export async function createReceipt(tx: DbOrTx, input: CreateReceiptInput, ctx: ActorCtx): Promise<ReceiptWithLines> {
  if (!input.lines.length) throw new ValidationError('En az bir satır gerekli');
  const docNo = await nextDocNo(tx, 'GR');
  const [receipt] = await tx
    .insert(receipts)
    .values({
      docNo,
      status: 'draft',
      partnerId: input.partnerId ?? null,
      warehouseId: input.warehouseId,
      purchaseOrderId: input.purchaseOrderId ?? null,
      supplierDeliveryNo: input.supplierDeliveryNo ?? null,
      supplierDeliveryDate: input.supplierDeliveryDate ? businessDate(input.supplierDeliveryDate) : null,
      origin: input.origin ?? (input.purchaseOrderId ? 'chain' : 'manual'),
      note: input.note ?? null,
      createdBy: ctx.userId ?? null,
    })
    .returning();

  const lines: Array<typeof receiptLines.$inferSelect> = [];
  let seq = 10;
  for (const l of input.lines) {
    const qty = round4(D(l.qty));
    if (qty.lte(0)) throw new ValidationError('Satır miktarı sıfırdan büyük olmalı');
    const rejectedQty = round4(D(l.rejectedQty ?? 0));
    if (rejectedQty.gt(qty)) throw new ValidationError('Red miktarı satır miktarını aşamaz');
    const [row] = await tx
      .insert(receiptLines)
      .values({
        receiptId: receipt!.id,
        purchaseOrderLineId: l.purchaseOrderLineId ?? null,
        productId: l.productId,
        qty: toDb(qty),
        uomId: l.uomId,
        unitCost: toDb(D(l.unitCost)),
        supplierLotNo: l.supplierLotNo ?? null,
        expiryDate: l.expiryDate ? businessDate(l.expiryDate) : null,
        productionDate: l.productionDate ? businessDate(l.productionDate) : null,
        disposition: l.disposition ?? 'quarantine',
        toLocationId: l.toLocationId ?? null,
        rejectedQty: toDb(rejectedQty),
        rejectReason: l.rejectReason ?? null,
        sequence: seq,
        note: l.note ?? null,
      })
      .returning();
    lines.push(row!);
    seq += 10;
  }

  await indexDocument(tx, {
    type: 'receipt', recordId: receipt!.id, docNo, partnerId: receipt!.partnerId, status: 'draft', origin: receipt!.origin,
    title: `Mal Kabul ${docNo}`, docDate: new Date(),
  });

  return { receipt: receipt!, lines };
}

export type ReceiveGoodsResult = ReceiptWithLines & { createdLotIds: string[] };

/**
 * Mal kabulü işler: her satır için (kabul edilen kısım + red kısmı ayrı lot) `createLot` + `postStockMove(kind:'receipt')`.
 * QC gerektiren ürün karantinaya giderse `qc_checks` bekleyen kaydı açılır. PO satırı varsa `receivedQty` günceller
 * ve `document_links(purchase_order→receipt)` kurar.
 */
export async function receiveGoods(tx: DbOrTx, receiptId: string, ctx: ActorCtx): Promise<ReceiveGoodsResult> {
  const [receipt] = await tx.select().from(receipts).where(eq(receipts.id, receiptId)).for('update');
  if (!receipt) throw new NotFoundError('Mal kabul', receiptId);
  if (receipt.status !== 'draft') throw new DomainError('RECEIPT_ALREADY_PROCESSED', `Mal kabul ${receipt.docNo} zaten işlenmiş`, { status: receipt.status });

  const lines = await tx.select().from(receiptLines).where(eq(receiptLines.receiptId, receiptId));
  if (!lines.length) throw new ValidationError('Mal kabulde satır yok');

  const suppliersLoc = await getSuppliersLocation(tx);
  const quarantineLoc = await getQuarantineLocation(tx, receipt.warehouseId);
  const rejectedLoc = await getRejectedLocation(tx, receipt.warehouseId);
  const receivedAt = new Date();

  const createdLotIds: string[] = [];
  let anyPendingQc = false;
  let totalValue = ZERO;

  for (const line of lines) {
    const [product] = await tx.select().from(products).where(eq(products.id, line.productId)).limit(1);
    if (!product) throw new NotFoundError('Ürün', line.productId);

    const qty = D(line.qty);
    const rejectedQty = D(line.rejectedQty);
    const wholeRejected = line.disposition === 'rejected';
    const acceptedQty = wholeRejected ? ZERO : qty.minus(rejectedQty);
    const finalRejectedQty = wholeRejected ? qty : rejectedQty;
    const disposition: 'quarantine' | 'released' = line.disposition === 'released' ? 'released' : 'quarantine';

    const baseLotNo = (line.supplierLotNo?.trim() || `${receipt.docNo}-${line.sequence}`);
    let acceptedLotId: string | null = null;

    if (acceptedQty.gt(0)) {
      let toLocationId: string = line.toLocationId ?? '';
      if (!toLocationId) {
        toLocationId = disposition === 'quarantine' ? quarantineLoc.id : (await resolveDefaultPutawayLocation(tx, receipt.warehouseId, product.type)).id;
      }
      let lotId: string | null = null;
      if (product.isLotTracked) {
        const lot = await createLot(tx, {
          productId: product.id, lotNo: baseLotNo, origin: 'receipt', supplierId: receipt.partnerId,
          supplierLotNo: line.supplierLotNo, productionDate: line.productionDate, expiryDate: line.expiryDate,
          unitCost: D(line.unitCost), originReceiptId: receipt.id, originReceiptLineId: line.id,
          status: disposition, note: line.note,
        }, ctx);
        lotId = lot.id;
        acceptedLotId = lot.id;
        createdLotIds.push(lot.id);
        await writeAudit(tx, { action: 'create', tableName: 'stock_lots', recordId: lot.id, summary: `Mal kabul lotu ${lot.lotNo} oluşturuldu (Mal kabul ${receipt.docNo})`, after: lot }, ctx);
      }
      const res = await postStockMove(tx, {
        kind: 'receipt', productId: product.id, lotId, fromLocationId: suppliersLoc.id, toLocationId,
        qty: acceptedQty, uomId: line.uomId, unitCost: D(line.unitCost), refType: 'receipt', refId: receipt.id,
        refLineId: line.id, refNo: receipt.docNo, partnerId: receipt.partnerId, origin: receipt.origin, movedAt: receivedAt,
      }, ctx);
      totalValue = totalValue.plus(res.value);

      if (product.requiresIncomingQc && disposition === 'quarantine' && lotId) {
        anyPendingQc = true;
        const qcNo = await nextDocNo(tx, 'QC', receivedAt);
        await tx.insert(qcChecks).values({
          docNo: qcNo, kind: 'incoming', productId: product.id, lotId, receiptId: receipt.id, receiptLineId: line.id,
          supplierId: receipt.partnerId, result: 'pending', sampledQty: null, checkedAt: null,
        });
      }
      await tx.update(receiptLines).set({ toLocationId, lotId }).where(eq(receiptLines.id, line.id));
    }

    if (finalRejectedQty.gt(0)) {
      let rejLotId: string | null = null;
      if (product.isLotTracked) {
        const rejLotNo = acceptedLotId ? `${baseLotNo}-RED` : baseLotNo;
        const rejLot = await createLot(tx, {
          productId: product.id, lotNo: rejLotNo, origin: 'receipt', supplierId: receipt.partnerId,
          supplierLotNo: line.supplierLotNo, productionDate: line.productionDate, expiryDate: line.expiryDate,
          unitCost: D(line.unitCost), originReceiptId: receipt.id, originReceiptLineId: line.id,
          status: 'quarantine', note: line.rejectReason ?? line.note,
        }, ctx);
        rejLotId = rejLot.id;
        createdLotIds.push(rejLot.id);
        await writeAudit(tx, { action: 'create', tableName: 'stock_lots', recordId: rejLot.id, summary: `Red lotu ${rejLot.lotNo} oluşturuldu (Mal kabul ${receipt.docNo})`, after: rejLot }, ctx);
      }
      const res = await postStockMove(tx, {
        kind: 'receipt', productId: product.id, lotId: rejLotId, fromLocationId: suppliersLoc.id, toLocationId: rejectedLoc.id,
        qty: finalRejectedQty, uomId: line.uomId, unitCost: D(line.unitCost), refType: 'receipt', refId: receipt.id,
        refLineId: line.id, refNo: receipt.docNo, partnerId: receipt.partnerId, origin: receipt.origin, movedAt: receivedAt,
      }, ctx);
      totalValue = totalValue.plus(res.value);
      if (rejLotId) {
        await tx.update(stockLots).set({ status: 'rejected', rejectReason: line.rejectReason ?? null, updatedBy: ctx.userId ?? null }).where(eq(stockLots.id, rejLotId));
      }
      if (!acceptedLotId) await tx.update(receiptLines).set({ toLocationId: rejectedLoc.id, lotId: rejLotId }).where(eq(receiptLines.id, line.id));
    }

    if (line.purchaseOrderLineId) {
      const totalLineQty = acceptedQty.plus(finalRejectedQty);
      await tx.update(purchaseOrderLines).set({ receivedQty: sql`${purchaseOrderLines.receivedQty} + ${toDb(totalLineQty)}::numeric` }).where(eq(purchaseOrderLines.id, line.purchaseOrderLineId));
      if (receipt.purchaseOrderId) {
        await linkDocuments(tx, {
          sourceType: 'purchase_order', sourceId: receipt.purchaseOrderId, sourceLineId: line.purchaseOrderLineId,
          targetType: 'receipt', targetId: receipt.id, targetLineId: line.id, qty: totalLineQty,
        }, ctx);
      }
    }
  }

  let wasOnTime: boolean | null = null;
  if (receipt.purchaseOrderId) {
    const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, receipt.purchaseOrderId)).limit(1);
    if (po?.expectedDate) wasOnTime = businessDate(receivedAt) <= po.expectedDate;
    if (po) {
      const poLines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.orderId, po.id));
      const allReceived = poLines.every((l) => D(l.receivedQty).gte(D(l.qty)));
      const anyReceived = poLines.some((l) => D(l.receivedQty).gt(0));
      const nextStatus = allReceived ? 'received' : anyReceived ? 'partially_received' : po.status;
      if (nextStatus !== po.status && !['closed', 'cancelled', 'rejected'].includes(po.status)) {
        await tx.update(purchaseOrders).set({ status: nextStatus }).where(eq(purchaseOrders.id, po.id));
      }
    }
  }

  const status = anyPendingQc ? 'qc_pending' : 'done';
  const [updated] = await tx
    .update(receipts)
    .set({ status, receivedAt, receivedBy: ctx.userId ?? null, wasOnTime, updatedBy: ctx.userId ?? null })
    .where(eq(receipts.id, receiptId))
    .returning();

  await indexDocument(tx, {
    type: 'receipt', recordId: receipt.id, docNo: receipt.docNo, partnerId: receipt.partnerId, status,
    origin: receipt.origin, title: `Mal Kabul ${receipt.docNo}`, amount: totalValue, docDate: receivedAt,
  });

  /**
   * Otomatik alış faturalama (P0 düzeltme — docs/INVARIANTS.md I23/I25): `postStockMove` her değerli
   * 'receipt' hareketinde 320.999'a (Faturası Gelmemiş Alımlar) alacak yazar; bu ara hesap yalnızca
   * `createPurchaseInvoiceFromReceipt` çalıştığında 320.<tedarikçi>'ye devredilir ve 191 (İndirilecek
   * KDV) doğar. Önceden bu yalnızca `packages/db/src/seed/purchasing.ts`'te geriye dönük bir
   * seed-workaround'uydu — canlı `/depo/mal-kabul/yeni` akışında hiç tetiklenmiyordu. Artık mal kabul
   * her tamamlandığında (kalite beklese de — I23 kontrolü `receipt.status`'a değil, değerli hareketin
   * varlığına bakar) tedarikçisi olan ve değerli hareket üreten her mal kabul aynı transaction içinde
   * otomatik faturalanır (SAP B1'deki "based on" faturaya karşılık gelir; gerçek tedarikçi faturası
   * geldiğinde `supplierInvoiceNo` muhasebe tarafından güncellenebilir — şema bunu destekler).
   */
  if (receipt.partnerId && totalValue.gt(0)) {
    const { invoice } = await createPurchaseInvoiceFromReceipt(tx, receipt.id, ctx);
    await writeAudit(tx, {
      action: 'create', tableName: 'invoices', recordId: invoice.id,
      summary: `Alış faturası ${invoice.docNo} mal kabul ${receipt.docNo} kabulünde otomatik oluşturuldu`, after: invoice,
    }, ctx);
  }

  const finalLines = await tx.select().from(receiptLines).where(eq(receiptLines.receiptId, receiptId));
  return { receipt: updated!, lines: finalLines, createdLotIds };
}

/** Tek adımda taslak oluşturup işler — web formu tek "Kabul et" gönderimiyle çağırır. */
export async function createAndReceive(tx: DbOrTx, input: CreateReceiptInput, ctx: ActorCtx): Promise<ReceiveGoodsResult> {
  const { receipt } = await createReceipt(tx, input, ctx);
  return receiveGoods(tx, receipt.id, ctx);
}
