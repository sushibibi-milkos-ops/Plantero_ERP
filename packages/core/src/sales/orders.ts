import { eq } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import {
  salesOrders, salesOrderLines, salesChannels, partners, products, warehouses,
  type DbOrTx,
} from '@plantero/db';
import { D, toDb, round4, sum, ZERO } from '../money.js';
import { businessDate } from '../dates.js';
import { nextDocNo } from '../sequences.js';
import { linkDocuments, indexDocument } from '../documents/chain.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import { createDeliveryFromOrder, type CreateDeliveryOpts, type DeliveryWithLines } from '../stock/deliveries.js';
import { getOnHand } from '../stock/ledger.js';
import { resolvePrice, computeLineTotals, computeChannelDeductions, getExchangeRate, type PriceSource } from './pricing.js';
import type { ActorCtx, DocumentOrigin } from '../types.js';

/**
 * Teklif/sipariş — tek tablo (`sales_orders`), `docType` ile ayrışır (SAP B1 mantığı).
 * Yalnızca `order` docType'ında kanal kesintileri hesaplanır; `quotation` satış belgesi değildir.
 */

export type SalesLineInput = {
  productId: string;
  qty: Decimal;
  uomId?: string | null;
  /** Verilirse fiyat çözümlemesi atlanır, kaynak 'manual' olur (ör. pazaryeri senkronu) */
  unitPrice?: Decimal | null;
  discountPct?: Decimal | null;
  description?: string | null;
  /**
   * Elle 0 birim fiyatlı satır yalnızca bu bayrakla kabul edilir (ör. ücretsiz numune) — aksi halde
   * fiyat çözümlemesi tamamlanmadan kaydedilen satırlar (istemci hâlâ asenkron `resolvePrice`
   * bekliyorken) sessizce 0 ₺ olarak kaydolup faturalandırmada "Fiş tutarı sıfır olamaz" ile
   * patlıyordu. `priceSource` bu durumda 'free' olur.
   */
  isFree?: boolean;
};

export type CreateSalesDocInput = {
  docType: 'quotation' | 'order';
  partnerId: string;
  channelId: string;
  warehouseId: string;
  priceListId?: string | null;
  opportunityId?: string | null;
  billingAddressId?: string | null;
  shippingAddressId?: string | null;
  externalOrderNo?: string | null;
  customerRef?: string | null;
  orderDate?: string | Date;
  validUntil?: string | Date | null;
  requestedDeliveryDate?: string | Date | null;
  currency?: string | null;
  paymentTermDays?: number | null;
  isExport?: boolean;
  incoterm?: string | null;
  salespersonId?: string | null;
  origin?: DocumentOrigin;
  note?: string | null;
  lines: SalesLineInput[];
};

export type SalesDocWithLines = { order: typeof salesOrders.$inferSelect; lines: Array<typeof salesOrderLines.$inferSelect> };

const isEditable = (doc: typeof salesOrders.$inferSelect): boolean => (doc.docType === 'quotation' ? doc.status !== 'accepted' && doc.status !== 'lost' : doc.status === 'draft');

/** Aynı depoda ürün tipi ayrımı yapmadan varsayılan satış deposu (üretim tesisi öncelikli) — kanal senkronu / fırsat dönüşümü için */
export async function resolveDefaultSalesWarehouse(tx: DbOrTx): Promise<typeof warehouses.$inferSelect> {
  const rows = await tx.select().from(warehouses).where(eq(warehouses.isActive, true)).orderBy(warehouses.code);
  const production = rows.find((w) => w.isProduction);
  const picked = production ?? rows[0];
  if (!picked) throw new DomainError('WAREHOUSE_MISSING', 'Aktif depo bulunamadı — masterdata seed çalıştırılmalı');
  return picked;
}

/** Bir satırın toplamlarını hesaplar (fiyat çözümlemesi dahil) */
async function buildLine(
  tx: DbOrTx,
  input: SalesLineInput,
  ctx: { partnerId: string; priceListId: string | null; orderDate: string; isExport?: boolean },
): Promise<{ productId: string; uomId: string; qty: Decimal; unitPrice: Decimal; discountPct: Decimal; vatRate: Decimal; priceSource: PriceSource } & ReturnType<typeof computeLineTotals>> {
  const qty = round4(D(input.qty));
  if (qty.lte(0)) throw new ValidationError('Satır miktarı sıfırdan büyük olmalı');
  const [product] = await tx.select().from(products).where(eq(products.id, input.productId)).limit(1);
  if (!product) throw new NotFoundError('Ürün', input.productId);
  const uomId = input.uomId ?? product.uomId;
  const discountPct = D(input.discountPct ?? 0);
  // İhracat istisnası: KDV %0 (taxes.KDV0) — ürünün yurtiçi oranı (gıda %1 / diğer %20) uygulanmaz.
  const vatRate = ctx.isExport ? ZERO : D(product.vatRate);

  let unitPrice: Decimal;
  let priceSource: PriceSource;
  if (input.unitPrice !== undefined && input.unitPrice !== null) {
    unitPrice = round4(D(input.unitPrice));
    if (unitPrice.lte(0) && !input.isFree) {
      throw new ValidationError('Birim fiyat sıfır olamaz (ücretsiz/numune satır ise işaretleyin)', { productId: input.productId });
    }
    priceSource = input.isFree ? 'free' : 'manual';
  } else {
    const resolved = await resolvePrice(tx, { productId: input.productId, partnerId: ctx.partnerId, priceListId: ctx.priceListId, qty, asOf: ctx.orderDate });
    unitPrice = resolved.unitPrice;
    priceSource = resolved.source;
  }

  const totals = computeLineTotals({ qty, unitPrice, discountPct, vatRate });
  return { productId: product.id, uomId, qty, unitPrice, discountPct, vatRate, priceSource, ...totals };
}

/** Teklif veya sipariş oluşturur; satırları fiyatlandırır, toplamları ve (yalnızca sipariş) kanal kesintilerini hesaplar. */
export async function createSalesDoc(tx: DbOrTx, input: CreateSalesDocInput, ctx: ActorCtx): Promise<SalesDocWithLines> {
  if (input.docType === 'order' && !input.lines.length) throw new ValidationError('Siparişte en az bir satır olmalı');
  const [partner] = await tx.select().from(partners).where(eq(partners.id, input.partnerId)).limit(1);
  if (!partner) throw new NotFoundError('Cari', input.partnerId);
  const [channel] = await tx.select().from(salesChannels).where(eq(salesChannels.id, input.channelId)).limit(1);
  if (!channel) throw new NotFoundError('Satış kanalı', input.channelId);

  const orderDate = businessDate(input.orderDate ?? new Date());
  const currency = input.currency ?? channel.currency ?? partner.currency ?? 'TRY';
  const priceListId = input.priceListId ?? partner.priceListId ?? channel.defaultPriceListId ?? null;
  const exchangeRate = await getExchangeRate(tx, currency, orderDate);
  if (exchangeRate === null) throw new ValidationError(`${currency} için ${orderDate} tarihli TCMB kuru bulunamadı`, { currency, date: orderDate });
  const paymentTermDays = input.paymentTermDays ?? partner.paymentTermDays ?? 0;

  const isExport = input.isExport ?? channel.kind === 'export';
  const docNo = await nextDocNo(tx, input.docType === 'quotation' ? 'QT' : 'SO', input.orderDate ? new Date(orderDate) : new Date());
  const [order] = await tx
    .insert(salesOrders)
    .values({
      docType: input.docType,
      docNo,
      status: 'draft',
      partnerId: partner.id,
      channelId: channel.id,
      warehouseId: input.warehouseId,
      priceListId,
      billingAddressId: input.billingAddressId ?? null,
      shippingAddressId: input.shippingAddressId ?? null,
      opportunityId: input.opportunityId ?? null,
      externalOrderNo: input.externalOrderNo ?? null,
      customerRef: input.customerRef ?? null,
      orderDate,
      validUntil: input.validUntil ? businessDate(input.validUntil) : null,
      requestedDeliveryDate: input.requestedDeliveryDate ? businessDate(input.requestedDeliveryDate) : null,
      currency,
      exchangeRate: toDb(exchangeRate),
      paymentTermDays,
      dueDate: paymentTermDays > 0 ? businessDate(new Date(new Date(orderDate).getTime() + paymentTermDays * 86_400_000)) : orderDate,
      isExport,
      incoterm: input.incoterm ?? null,
      salespersonId: input.salespersonId ?? null,
      origin: input.origin ?? 'manual',
      note: input.note ?? null,
      createdBy: ctx.userId ?? null,
    })
    .returning();

  const lines: Array<typeof salesOrderLines.$inferSelect> = [];
  let seq = 10;
  for (const l of input.lines) {
    const built = await buildLine(tx, l, { partnerId: partner.id, priceListId, orderDate, isExport });
    const [row] = await tx
      .insert(salesOrderLines)
      .values({
        orderId: order!.id,
        productId: built.productId,
        description: l.description ?? null,
        qty: toDb(built.qty),
        uomId: built.uomId,
        unitPrice: toDb(built.unitPrice),
        discountPct: toDb(built.discountPct),
        vatRate: toDb(built.vatRate),
        lineSubtotal: toDb(built.lineSubtotal),
        lineVat: toDb(built.lineVat),
        lineTotal: toDb(built.lineTotal),
        priceSource: built.priceSource,
        sequence: seq,
      })
      .returning();
    lines.push(row!);
    seq += 10;
  }

  await recomputeOrderTotals(tx, order!.id, channel);
  if (input.opportunityId) {
    await linkDocuments(tx, { sourceType: 'opportunity', sourceId: input.opportunityId, targetType: input.docType === 'quotation' ? 'quotation' : 'sales_order', targetId: order!.id }, ctx);
  }
  const [final] = await tx.select().from(salesOrders).where(eq(salesOrders.id, order!.id)).limit(1);
  await indexDocument(tx, {
    type: input.docType === 'quotation' ? 'quotation' : 'sales_order', recordId: order!.id, docNo, partnerId: partner.id, status: 'draft',
    origin: input.origin ?? 'manual', title: `${input.docType === 'quotation' ? 'Teklif' : 'Sipariş'} ${docNo}`, amount: final!.grandTotal, docDate: new Date(orderDate),
  });
  const finalLines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, order!.id)).orderBy(salesOrderLines.sequence);
  return { order: final!, lines: finalLines };
}

/** Başlık toplamlarını satırlardan yeniden hesaplar; `order` docType'ında kanal kesintilerini de günceller. */
export async function recomputeOrderTotals(tx: DbOrTx, orderId: string, channelRow?: typeof salesChannels.$inferSelect): Promise<void> {
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
  if (!order) throw new NotFoundError('Satış belgesi', orderId);
  const lines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId));
  const subtotal = round4(sum(lines.map((l) => l.lineSubtotal)));
  const discountTotal = round4(sum(lines.map((l) => D(l.qty).mul(D(l.unitPrice)).minus(D(l.lineSubtotal)))));
  const vatTotal = round4(sum(lines.map((l) => l.lineVat)));
  const grandTotal = round4(sum(lines.map((l) => l.lineTotal)));

  let commissionAmount = ZERO, shippingDeduction = ZERO, otherDeduction = ZERO, netRevenue = subtotal;
  if (order.docType === 'order') {
    const channel = channelRow ?? (await tx.select().from(salesChannels).where(eq(salesChannels.id, order.channelId)).limit(1))[0];
    if (channel) ({ commissionAmount, shippingDeduction, otherDeduction, netRevenue } = computeChannelDeductions(subtotal, channel));
  }

  await tx
    .update(salesOrders)
    .set({
      subtotal: toDb(subtotal), discountTotal: toDb(discountTotal), vatTotal: toDb(vatTotal), grandTotal: toDb(grandTotal),
      commissionAmount: toDb(commissionAmount), shippingDeduction: toDb(shippingDeduction), otherDeduction: toDb(otherDeduction), netRevenue: toDb(netRevenue),
    })
    .where(eq(salesOrders.id, orderId));
}

/** Satırları tamamen değiştirir (yalnızca düzenlenebilir durumdaki belgeler — taslak teklif/sipariş). */
export async function updateLines(tx: DbOrTx, orderId: string, lines: SalesLineInput[], ctx: ActorCtx): Promise<SalesDocWithLines> {
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).for('update');
  if (!order) throw new NotFoundError('Satış belgesi', orderId);
  if (!isEditable(order)) throw new DomainError('ORDER_NOT_EDITABLE', `${order.docNo} durumunda satırlar değiştirilemez (${order.status})`);
  if (order.docType === 'order' && !lines.length) throw new ValidationError('Siparişte en az bir satır olmalı');

  const existing = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId));
  if (existing.some((l) => D(l.deliveredQty).gt(0) || D(l.invoicedQty).gt(0))) {
    throw new DomainError('ORDER_HAS_ACTIVITY', `${order.docNo} için teslim/fatura kaydı var; satırlar değiştirilemez`);
  }
  await tx.delete(salesOrderLines).where(eq(salesOrderLines.orderId, orderId));

  let seq = 10;
  for (const l of lines) {
    const built = await buildLine(tx, l, { partnerId: order.partnerId, priceListId: order.priceListId, orderDate: order.orderDate, isExport: order.isExport });
    await tx.insert(salesOrderLines).values({
      orderId, productId: built.productId, description: l.description ?? null, qty: toDb(built.qty), uomId: built.uomId,
      unitPrice: toDb(built.unitPrice), discountPct: toDb(built.discountPct), vatRate: toDb(built.vatRate),
      lineSubtotal: toDb(built.lineSubtotal), lineVat: toDb(built.lineVat), lineTotal: toDb(built.lineTotal), priceSource: built.priceSource, sequence: seq,
    });
    seq += 10;
  }
  await recomputeOrderTotals(tx, orderId);
  await tx.update(salesOrders).set({ updatedBy: ctx.userId ?? null }).where(eq(salesOrders.id, orderId));
  const [updated] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
  await indexDocument(tx, { type: order.docType === 'quotation' ? 'quotation' : 'sales_order', recordId: orderId, docNo: order.docNo, partnerId: order.partnerId, status: order.status, origin: order.origin, title: `${order.docType === 'quotation' ? 'Teklif' : 'Sipariş'} ${order.docNo}`, amount: updated!.grandTotal });
  const finalLines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId)).orderBy(salesOrderLines.sequence);
  return { order: updated!, lines: finalLines };
}

export async function sendQuotation(tx: DbOrTx, id: string, ctx: ActorCtx): Promise<typeof salesOrders.$inferSelect> {
  const [q] = await tx.select().from(salesOrders).where(eq(salesOrders.id, id)).limit(1);
  if (!q) throw new NotFoundError('Teklif', id);
  if (q.docType !== 'quotation') throw new DomainError('NOT_A_QUOTATION', `${q.docNo} bir teklif değil`);
  if (q.status !== 'draft') throw new DomainError('QUOTATION_NOT_DRAFT', `${q.docNo} zaten gönderilmiş (${q.status})`);
  const [updated] = await tx.update(salesOrders).set({ status: 'sent', updatedBy: ctx.userId ?? null }).where(eq(salesOrders.id, id)).returning();
  await indexDocument(tx, { type: 'quotation', recordId: id, docNo: q.docNo, partnerId: q.partnerId, status: 'sent', origin: q.origin, title: `Teklif ${q.docNo}`, amount: q.grandTotal });
  return updated!;
}

export async function acceptQuotation(tx: DbOrTx, id: string, ctx: ActorCtx): Promise<typeof salesOrders.$inferSelect> {
  const [q] = await tx.select().from(salesOrders).where(eq(salesOrders.id, id)).limit(1);
  if (!q) throw new NotFoundError('Teklif', id);
  if (q.docType !== 'quotation') throw new DomainError('NOT_A_QUOTATION', `${q.docNo} bir teklif değil`);
  if (!['draft', 'sent'].includes(q.status)) throw new DomainError('QUOTATION_NOT_PENDING', `${q.docNo} kabul edilemez (${q.status})`);
  const [updated] = await tx.update(salesOrders).set({ status: 'accepted', updatedBy: ctx.userId ?? null }).where(eq(salesOrders.id, id)).returning();
  await indexDocument(tx, { type: 'quotation', recordId: id, docNo: q.docNo, partnerId: q.partnerId, status: 'accepted', origin: q.origin, title: `Teklif ${q.docNo}`, amount: q.grandTotal });
  return updated!;
}

/** Kabul edilmiş teklifi siparişe dönüştürür: yeni SO, satırlar kopya, document_links(quotation→sales_order). */
export async function convertQuotationToOrder(tx: DbOrTx, quotationId: string, ctx: ActorCtx): Promise<SalesDocWithLines> {
  const [quotation] = await tx.select().from(salesOrders).where(eq(salesOrders.id, quotationId)).for('update');
  if (!quotation) throw new NotFoundError('Teklif', quotationId);
  if (quotation.docType !== 'quotation') throw new DomainError('NOT_A_QUOTATION', `${quotation.docNo} bir teklif değil`);
  if (!['sent', 'accepted'].includes(quotation.status)) throw new DomainError('QUOTATION_NOT_ACCEPTED', `${quotation.docNo} kabul edilmeden siparişe dönüştürülemez (${quotation.status})`);
  const qLines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, quotationId)).orderBy(salesOrderLines.sequence);
  if (!qLines.length) throw new ValidationError('Teklifte satır yok');

  const orderDate = businessDate(new Date());
  const exchangeRate = quotation.currency === 'TRY' ? D(1) : (await getExchangeRate(tx, quotation.currency, orderDate)) ?? D(quotation.exchangeRate);
  const docNo = await nextDocNo(tx, 'SO');
  const [order] = await tx
    .insert(salesOrders)
    .values({
      docType: 'order', docNo, status: 'draft', partnerId: quotation.partnerId, channelId: quotation.channelId, warehouseId: quotation.warehouseId,
      priceListId: quotation.priceListId, billingAddressId: quotation.billingAddressId, shippingAddressId: quotation.shippingAddressId,
      opportunityId: quotation.opportunityId, quotationId: quotation.id, orderDate, requestedDeliveryDate: quotation.requestedDeliveryDate,
      currency: quotation.currency, exchangeRate: toDb(exchangeRate), paymentTermDays: quotation.paymentTermDays,
      dueDate: quotation.paymentTermDays > 0 ? businessDate(new Date(Date.now() + quotation.paymentTermDays * 86_400_000)) : orderDate,
      isExport: quotation.isExport, incoterm: quotation.incoterm, salespersonId: quotation.salespersonId, origin: 'chain',
      createdBy: ctx.userId ?? null,
    })
    .returning();

  let seq = 10;
  for (const l of qLines) {
    const [row] = await tx
      .insert(salesOrderLines)
      .values({
        orderId: order!.id, productId: l.productId, description: l.description, qty: l.qty, uomId: l.uomId, unitPrice: l.unitPrice,
        discountPct: l.discountPct, vatRate: l.vatRate, lineSubtotal: l.lineSubtotal, lineVat: l.lineVat, lineTotal: l.lineTotal,
        priceSource: l.priceSource, sequence: seq,
      })
      .returning();
    await linkDocuments(tx, { sourceType: 'quotation', sourceId: quotation.id, sourceLineId: l.id, targetType: 'sales_order', targetId: order!.id, targetLineId: row!.id, qty: D(l.qty), amount: D(l.lineTotal) }, ctx);
    seq += 10;
  }
  await recomputeOrderTotals(tx, order!.id);
  await linkDocuments(tx, { sourceType: 'quotation', sourceId: quotation.id, targetType: 'sales_order', targetId: order!.id }, ctx);

  const [final] = await tx.select().from(salesOrders).where(eq(salesOrders.id, order!.id)).limit(1);
  await indexDocument(tx, { type: 'sales_order', recordId: order!.id, docNo, partnerId: quotation.partnerId, status: 'draft', origin: 'chain', title: `Sipariş ${docNo}`, amount: final!.grandTotal, docDate: new Date() });
  const finalLines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, order!.id)).orderBy(salesOrderLines.sequence);
  return { order: final!, lines: finalLines };
}

export type ConfirmOrderResult = { order: typeof salesOrders.$inferSelect; delivery: DeliveryWithLines['delivery']; warnings: string[] };

/** Siparişi onaylar, stok kullanılabilirlik uyarısı üretir ve otomatik irsaliye taslağı açar. */
export async function confirmOrder(tx: DbOrTx, orderId: string, ctx: ActorCtx, opts: CreateDeliveryOpts = {}): Promise<ConfirmOrderResult> {
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).for('update');
  if (!order) throw new NotFoundError('Sipariş', orderId);
  if (order.docType !== 'order') throw new DomainError('NOT_AN_ORDER', `${order.docNo} bir sipariş değil`);
  if (order.status !== 'draft') throw new DomainError('ORDER_NOT_DRAFT', `${order.docNo} zaten onaylanmış (${order.status})`);
  const lines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId));
  if (!lines.length) throw new ValidationError('Onaylanacak satır yok');

  const warnings: string[] = [];
  for (const line of lines) {
    const [product] = await tx.select({ name: products.name }).from(products).where(eq(products.id, line.productId)).limit(1);
    const onHand = await getOnHand(tx, { productId: line.productId, warehouseId: order.warehouseId });
    if (onHand.available.lt(D(line.qty))) {
      warnings.push(`${product?.name ?? line.productId}: yetersiz stok (mevcut ${toDb(onHand.available)}, gerekli ${line.qty})`);
    }
  }

  const confirmedAt = new Date();
  const [updated] = await tx.update(salesOrders).set({ status: 'confirmed', confirmedAt, confirmedBy: ctx.userId ?? null, updatedBy: ctx.userId ?? null }).where(eq(salesOrders.id, orderId)).returning();
  await indexDocument(tx, { type: 'sales_order', recordId: orderId, docNo: order.docNo, partnerId: order.partnerId, status: 'confirmed', origin: order.origin, title: `Sipariş ${order.docNo}`, amount: order.grandTotal });

  const { delivery } = await createDeliveryFromOrder(tx, orderId, opts, ctx);
  return { order: updated!, delivery, warnings };
}

/** İptal — sevk edilmiş irsaliye ya da fatura varsa engeller (yalnızca `order` docType). Teklif için 'lost' işaretler. */
export async function cancelOrder(tx: DbOrTx, orderId: string, ctx: ActorCtx, reason?: string | null): Promise<typeof salesOrders.$inferSelect> {
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).for('update');
  if (!order) throw new NotFoundError('Satış belgesi', orderId);
  if (['cancelled', 'lost', 'closed'].includes(order.status)) throw new DomainError('ALREADY_CLOSED', `${order.docNo} zaten kapalı (${order.status})`);

  if (order.docType === 'order') {
    const lines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId));
    if (lines.some((l) => D(l.deliveredQty).gt(0) || D(l.invoicedQty).gt(0))) {
      throw new DomainError('ORDER_HAS_ACTIVITY', `${order.docNo} sevk/fatura kaydı olduğu için iptal edilemez`);
    }
  }
  const nextStatus = order.docType === 'quotation' ? 'lost' : 'cancelled';
  const [updated] = await tx
    .update(salesOrders)
    .set({ status: nextStatus, note: reason ? `${order.note ?? ''}\n${reason}`.trim() : order.note, updatedBy: ctx.userId ?? null })
    .where(eq(salesOrders.id, orderId))
    .returning();
  await indexDocument(tx, { type: order.docType === 'quotation' ? 'quotation' : 'sales_order', recordId: orderId, docNo: order.docNo, partnerId: order.partnerId, status: nextStatus, origin: order.origin, title: `${order.docType === 'quotation' ? 'Teklif' : 'Sipariş'} ${order.docNo}`, amount: order.grandTotal });
  return updated!;
}

/** Teslim/fatura durumuna göre sipariş durumunu ilerletir (yalnızca teslim/fatura akışındaki siparişler). */
export async function recomputeOrderStatus(tx: DbOrTx, orderId: string): Promise<typeof salesOrders.$inferSelect> {
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
  if (!order) throw new NotFoundError('Sipariş', orderId);
  if (!['confirmed', 'partially_delivered', 'delivered', 'invoiced'].includes(order.status)) return order;
  const lines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId));
  if (!lines.length) return order;

  const allDelivered = lines.every((l) => D(l.deliveredQty).gte(D(l.qty)));
  const anyDelivered = lines.some((l) => D(l.deliveredQty).gt(0));
  const allInvoiced = lines.every((l) => D(l.invoicedQty).gte(D(l.qty)));

  const nextStatus = allDelivered && allInvoiced ? 'invoiced' : allDelivered ? 'delivered' : anyDelivered ? 'partially_delivered' : 'confirmed';
  if (nextStatus === order.status) return order;
  const [updated] = await tx.update(salesOrders).set({ status: nextStatus }).where(eq(salesOrders.id, orderId)).returning();
  await indexDocument(tx, { type: 'sales_order', recordId: orderId, docNo: order.docNo, partnerId: order.partnerId, status: nextStatus, origin: order.origin, title: `Sipariş ${order.docNo}`, amount: order.grandTotal });
  return updated!;
}

