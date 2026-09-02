import { eq, and, sql } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import { deliveries, deliveryLines, salesOrders, salesOrderLines, products, stockLots, type DbOrTx } from '@plantero/db';
import { D, toDb, round4, ZERO } from '../money.js';
import { businessDate } from '../dates.js';
import { nextDocNo } from '../sequences.js';
import { linkDocuments, indexDocument } from '../documents/chain.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import { postStockMove, pickFefo, reserve } from './ledger.js';
import { getCustomersLocation, resolveWarehouseRoot } from './locations.js';
import type { ActorCtx } from '../types.js';

/**
 * SATIŞ MODÜLÜ SÖZLEŞMESİ — bu dosyadaki fonksiyonlar depo dışında satış modülü tarafından da
 * çağrılır (`docs/modules/depo.md` ve `docs/modules/satis.md`). İmzaları değiştirmeden önce satış
 * modülüyle uyumluluğu gözetin; geriye dönük uyumsuz bir değişiklik yapmayın, yeni alan eklerken
 * opsiyonel bırakın.
 *
 * - `createDeliveryFromOrder(tx, salesOrderId, opts, ctx)` → satış siparişinin henüz sevk edilmemiş
 *   miktarlarından ('qty' − 'deliveredQty') taslak bir irsaliye ('deliveries', status='draft') oluşturur.
 *   `opts.lineIds` verilirse yalnızca o sipariş satırları dahil edilir (kısmi sevkiyat); verilmezse
 *   teslim edilmemiş tüm satırlar. `deliveries.salesOrderId` doldurulur, satır bazlı
 *   `document_links(sales_order→delivery)` kurulur. Hiçbir stok hareketi yapılmaz.
 * - `reserveFefo(tx, deliveryId, ctx)` → her irsaliye satırı için `stock/ledger.pickFefo` ile
 *   lot/lokasyon atar ve `stock/ledger.reserve` ile rezerve eder. FEFO birden çok lota düşerse satır
 *   bölünür (aynı `salesOrderLineId`, farklı `lotId`/`fromLocationId` — yeni `delivery_lines` satırı).
 *   `delivery.status` → 'reserved'. Yetersiz stokta `DomainError('INSUFFICIENT_STOCK', …)` fırlatır.
 * - `confirmPick(tx, { deliveryId, lineId, scannedLotId }, ctx)` → toplama ekranı: okutulan lotun
 *   FEFO atamasıyla eşleştiğini doğrular (`DomainError('FEFO_MISMATCH', …)` / `LOT_NOT_RELEASED`),
 *   satırı toplandı işaretler (`pickedQty = qty`). Tüm satırlar toplanınca `delivery.status` → 'picked'.
 * - `shipDelivery(tx, deliveryId, ctx)` → rezerve edilmiş (`fromLocationId` dolu) her satır için
 *   `stock/ledger.postStockMove(kind:'delivery', useReserved:true, …)` çağırır (SMM fişi ledger'da
 *   atılır ve rezervasyon aynı çağrıda düşer), `salesOrderLines.deliveredQty` artırır,
 *   `delivery.status` → 'shipped', `document_links` miktarını günceller ve siparişi
 *   'partially_delivered'/'delivered' yapar. Rezerve edilmemiş satır varsa hata fırlatır — önce
 *   `reserveFefo` çağrılmalıdır.
 * - `markDelivered(tx, deliveryId, ctx)` → status → 'delivered', `deliveredAt` damgalanır (yalnızca
 *   durum; stok/muhasebe etkisi yok — sevkiyat anında zaten kayda geçmiştir).
 */

export type CreateDeliveryOpts = {
  warehouseId?: string;
  scheduledDate?: string | Date | null;
  lineIds?: string[];
  shippingAddressId?: string | null;
  carrier?: string | null;
};

export type DeliveryWithLines = { delivery: typeof deliveries.$inferSelect; lines: Array<typeof deliveryLines.$inferSelect> };

export async function createDeliveryFromOrder(tx: DbOrTx, salesOrderId: string, opts: CreateDeliveryOpts, ctx: ActorCtx): Promise<DeliveryWithLines> {
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, salesOrderId)).limit(1);
  if (!order) throw new NotFoundError('Satış siparişi', salesOrderId);
  const allLines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, salesOrderId));
  const candidates = opts.lineIds?.length ? allLines.filter((l) => opts.lineIds!.includes(l.id)) : allLines;
  const toShip = candidates
    .map((l) => ({ line: l, remaining: round4(D(l.qty).minus(D(l.deliveredQty))) }))
    .filter((x) => x.remaining.gt(0));
  if (!toShip.length) throw new DomainError('NOTHING_TO_DELIVER', 'Bu siparişte sevk edilecek miktar kalmadı');

  const docNo = await nextDocNo(tx, 'DN');
  const [delivery] = await tx
    .insert(deliveries)
    .values({
      docNo, status: 'draft', partnerId: order.partnerId, salesOrderId: order.id,
      warehouseId: opts.warehouseId ?? order.warehouseId, shippingAddressId: opts.shippingAddressId ?? order.shippingAddressId ?? null,
      channelId: order.channelId, scheduledDate: opts.scheduledDate ? businessDate(opts.scheduledDate) : order.requestedDeliveryDate,
      carrier: opts.carrier ?? null, origin: 'chain', createdBy: ctx.userId ?? null,
    })
    .returning();

  const lines: Array<typeof deliveryLines.$inferSelect> = [];
  let seq = 10;
  for (const { line, remaining } of toShip) {
    const [row] = await tx
      .insert(deliveryLines)
      .values({ deliveryId: delivery!.id, salesOrderLineId: line.id, productId: line.productId, qty: toDb(remaining), uomId: line.uomId, sequence: seq })
      .returning();
    lines.push(row!);
    await linkDocuments(tx, { sourceType: 'sales_order', sourceId: order.id, sourceLineId: line.id, targetType: 'delivery', targetId: delivery!.id, targetLineId: row!.id, qty: remaining }, ctx);
    seq += 10;
  }

  await indexDocument(tx, { type: 'delivery', recordId: delivery!.id, docNo, partnerId: delivery!.partnerId, status: 'draft', origin: 'chain', title: `İrsaliye ${docNo}`, docDate: new Date() });
  return { delivery: delivery!, lines };
}

export async function reserveFefo(tx: DbOrTx, deliveryId: string, ctx: ActorCtx): Promise<DeliveryWithLines> {
  const [delivery] = await tx.select().from(deliveries).where(eq(deliveries.id, deliveryId)).for('update');
  if (!delivery) throw new NotFoundError('Sevkiyat', deliveryId);
  if (!['draft', 'reserved'].includes(delivery.status)) throw new DomainError('DELIVERY_NOT_DRAFT', `Sevkiyat ${delivery.docNo} rezerve edilemez (durum: ${delivery.status})`);

  const pending = await tx.select().from(deliveryLines).where(and(eq(deliveryLines.deliveryId, deliveryId), sql`${deliveryLines.fromLocationId} is null`));
  for (const line of pending) {
    const [product] = await tx.select().from(products).where(eq(products.id, line.productId)).limit(1);
    if (!product) throw new NotFoundError('Ürün', line.productId);
    const root = await resolveWarehouseRoot(tx, delivery.warehouseId, product.type);
    const picks = await pickFefo(tx, { productId: line.productId, qty: D(line.qty), rootLocationId: root.id, allowStatuses: ['released'] });

    for (let i = 0; i < picks.length; i++) {
      const pick = picks[i]!;
      await reserve(tx, { productId: line.productId, lotId: pick.lotId, locationId: pick.locationId, qty: pick.qty });
      if (i === 0) {
        await tx.update(deliveryLines).set({ qty: toDb(pick.qty), lotId: pick.lotId, fromLocationId: pick.locationId, unitCost: toDb(pick.unitCost) }).where(eq(deliveryLines.id, line.id));
      } else {
        await tx.insert(deliveryLines).values({
          deliveryId, salesOrderLineId: line.salesOrderLineId, productId: line.productId, qty: toDb(pick.qty), uomId: line.uomId,
          lotId: pick.lotId, fromLocationId: pick.locationId, unitCost: toDb(pick.unitCost), sequence: line.sequence,
        });
      }
    }
  }

  const [updated] = await tx.update(deliveries).set({ status: 'reserved', updatedBy: ctx.userId ?? null }).where(eq(deliveries.id, deliveryId)).returning();
  const lines = await tx.select().from(deliveryLines).where(eq(deliveryLines.deliveryId, deliveryId));
  await indexDocument(tx, { type: 'delivery', recordId: deliveryId, docNo: delivery.docNo, partnerId: delivery.partnerId, status: 'reserved', origin: 'chain', title: `İrsaliye ${delivery.docNo}` });
  return { delivery: updated!, lines };
}

export type ConfirmPickInput = { deliveryId: string; lineId: string; scannedLotId?: string | null };

/** Toplama ekranı: okutulan lot FEFO atamasıyla eşleşmezse ya da serbest değilse hata fırlatır. */
export async function confirmPick(tx: DbOrTx, input: ConfirmPickInput, ctx: ActorCtx): Promise<DeliveryWithLines> {
  const [line] = await tx.select().from(deliveryLines).where(eq(deliveryLines.id, input.lineId)).limit(1);
  if (!line || line.deliveryId !== input.deliveryId) throw new NotFoundError('Sevkiyat satırı', input.lineId);

  if (line.lotId) {
    if (!input.scannedLotId) throw new ValidationError('Lot okutulmalı');
    if (input.scannedLotId !== line.lotId) {
      const [assigned] = await tx.select().from(stockLots).where(eq(stockLots.id, line.lotId)).limit(1);
      throw new DomainError('FEFO_MISMATCH', `Bu lot sırada değil; FEFO'ya göre önce ${assigned?.lotNo ?? line.lotId} lotu çıkmalı`, { expectedLotId: line.lotId, scannedLotId: input.scannedLotId });
    }
    const [lot] = await tx.select().from(stockLots).where(eq(stockLots.id, input.scannedLotId)).limit(1);
    if (!lot) throw new NotFoundError('Lot', input.scannedLotId);
    if (lot.status !== 'released') throw new DomainError('LOT_NOT_RELEASED', `Lot ${lot.lotNo} serbest değil (${lot.status}); sevk edilemez`, { lotId: lot.id, status: lot.status });
  }

  await tx.update(deliveryLines).set({ pickedQty: line.qty }).where(eq(deliveryLines.id, line.id));

  const allLines = await tx.select().from(deliveryLines).where(eq(deliveryLines.deliveryId, input.deliveryId));
  const allPicked = allLines.every((l) => D(l.id === line.id ? line.qty : l.pickedQty).gte(D(l.qty)));
  const [delivery] = await tx.select().from(deliveries).where(eq(deliveries.id, input.deliveryId)).limit(1);
  if (!delivery) throw new NotFoundError('Sevkiyat', input.deliveryId);
  if (allPicked) {
    await tx.update(deliveries).set({ status: 'picked', pickedBy: ctx.userId ?? null }).where(eq(deliveries.id, input.deliveryId));
  } else if (delivery.status === 'reserved') {
    await tx.update(deliveries).set({ status: 'picking' }).where(eq(deliveries.id, input.deliveryId));
  }

  const [updated] = await tx.select().from(deliveries).where(eq(deliveries.id, input.deliveryId)).limit(1);
  const lines = await tx.select().from(deliveryLines).where(eq(deliveryLines.deliveryId, input.deliveryId));
  return { delivery: updated!, lines };
}

/** Sevk eder: rezerve edilmiş satırlar için `postStockMove(kind:'delivery')` (SMM fişi), rezervasyon aynı çağrıda düşer. */
export async function shipDelivery(tx: DbOrTx, deliveryId: string, ctx: ActorCtx): Promise<DeliveryWithLines> {
  const [delivery] = await tx.select().from(deliveries).where(eq(deliveries.id, deliveryId)).for('update');
  if (!delivery) throw new NotFoundError('Sevkiyat', deliveryId);
  if (['shipped', 'delivered'].includes(delivery.status)) throw new DomainError('DELIVERY_ALREADY_SHIPPED', `Sevkiyat ${delivery.docNo} zaten sevk edilmiş`);
  const lines = await tx.select().from(deliveryLines).where(eq(deliveryLines.deliveryId, deliveryId));
  if (!lines.length) throw new ValidationError('Sevkiyatta satır yok');
  if (lines.some((l) => !l.fromLocationId)) throw new DomainError('NOT_RESERVED', 'Sevkiyat henüz rezerve edilmedi — önce FEFO ile rezerve edin');

  const customersLoc = await getCustomersLocation(tx);
  const shippedAt = new Date();
  const deliveredBySoLine = new Map<string, Decimal>();

  for (const line of lines) {
    const shipQty = D(line.pickedQty).gt(0) ? D(line.pickedQty) : D(line.qty);
    if (shipQty.lte(0)) continue;
    const res = await postStockMove(tx, {
      kind: 'delivery', productId: line.productId, lotId: line.lotId, fromLocationId: line.fromLocationId!, toLocationId: customersLoc.id,
      qty: shipQty, uomId: line.uomId, unitCost: line.unitCost ? D(line.unitCost) : undefined, refType: 'delivery', refId: deliveryId,
      refLineId: line.id, refNo: delivery.docNo, partnerId: delivery.partnerId, origin: delivery.origin, movedAt: shippedAt, useReserved: true,
    }, ctx);
    await tx.update(deliveryLines).set({ pickedQty: toDb(shipQty), unitCost: toDb(res.unitCost) }).where(eq(deliveryLines.id, line.id));
    if (line.salesOrderLineId) deliveredBySoLine.set(line.salesOrderLineId, (deliveredBySoLine.get(line.salesOrderLineId) ?? ZERO).plus(shipQty));
  }

  for (const [soLineId, qty] of deliveredBySoLine) {
    await tx.update(salesOrderLines).set({ deliveredQty: sql`${salesOrderLines.deliveredQty} + ${toDb(qty)}::numeric` }).where(eq(salesOrderLines.id, soLineId));
    if (delivery.salesOrderId) {
      await linkDocuments(tx, { sourceType: 'sales_order', sourceId: delivery.salesOrderId, sourceLineId: soLineId, targetType: 'delivery', targetId: deliveryId, targetLineId: lines.find((l) => l.salesOrderLineId === soLineId)?.id ?? null, qty }, ctx);
    }
  }

  if (delivery.salesOrderId) {
    const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, delivery.salesOrderId)).limit(1);
    if (order && !['closed', 'cancelled', 'lost', 'invoiced'].includes(order.status)) {
      const orderLines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, order.id));
      const allDelivered = orderLines.every((l) => D(l.deliveredQty).gte(D(l.qty)));
      await tx.update(salesOrders).set({ status: allDelivered ? 'delivered' : 'partially_delivered' }).where(eq(salesOrders.id, order.id));
    }
  }

  const [updated] = await tx.update(deliveries).set({ status: 'shipped', shippedAt, updatedBy: ctx.userId ?? null }).where(eq(deliveries.id, deliveryId)).returning();
  await indexDocument(tx, { type: 'delivery', recordId: deliveryId, docNo: delivery.docNo, partnerId: delivery.partnerId, status: 'shipped', origin: delivery.origin, title: `İrsaliye ${delivery.docNo}`, docDate: shippedAt });

  const finalLines = await tx.select().from(deliveryLines).where(eq(deliveryLines.deliveryId, deliveryId));
  return { delivery: updated!, lines: finalLines };
}

export async function markDelivered(tx: DbOrTx, deliveryId: string, ctx: ActorCtx): Promise<typeof deliveries.$inferSelect> {
  const [delivery] = await tx.select().from(deliveries).where(eq(deliveries.id, deliveryId)).limit(1);
  if (!delivery) throw new NotFoundError('Sevkiyat', deliveryId);
  if (delivery.status !== 'shipped') throw new DomainError('DELIVERY_NOT_SHIPPED', `Sevkiyat ${delivery.docNo} önce sevk edilmeli (durum: ${delivery.status})`);
  const [updated] = await tx.update(deliveries).set({ status: 'delivered', deliveredAt: new Date(), updatedBy: ctx.userId ?? null }).where(eq(deliveries.id, deliveryId)).returning();
  await indexDocument(tx, { type: 'delivery', recordId: deliveryId, docNo: delivery.docNo, partnerId: delivery.partnerId, status: 'delivered', origin: delivery.origin, title: `İrsaliye ${delivery.docNo}` });
  return updated!;
}
