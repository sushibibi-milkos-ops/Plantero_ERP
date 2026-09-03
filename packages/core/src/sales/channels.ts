import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import { channelOrders, salesChannels, salesOrders, partners, products, type DbOrTx } from '@plantero/db';
import { D, toDb } from '../money.js';
import { businessDate } from '../dates.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import { createSalesDoc, confirmOrder, resolveDefaultSalesWarehouse } from './orders.js';
import type { ActorCtx } from '../types.js';

/**
 * Pazaryeri senkronu — `docs/modules/satis.md`. Ham sipariş verisi (`packages/integrations` marketplace
 * adaptörlerinden) yalnızca web/worker katmanından gelir (core, integrations'a bağımlı değildir —
 * ARCHITECTURE §1 katman sırası); bu dosya yalnızca DB'ye yazma ve dönüştürme mantığını taşır.
 */

export type ChannelOrderLineInput = { barcode: string; sku?: string; productName: string; qty: string; unitPrice: string };
export type ChannelOrderInput = {
  externalId: string;
  orderedAt: string;
  externalStatus: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  grossAmount: string;
  commissionAmount: string;
  shippingAmount: string;
  netAmount: string;
  currency: string;
  lines: ChannelOrderLineInput[];
  raw?: Record<string, unknown>;
};

/** Kanala bağlı pazaryeri carisi (ör. C-000001 "Trendyol Pazaryeri") — `partners.defaultChannelId` ile eşlenir. */
async function getChannelPartner(tx: DbOrTx, channelId: string): Promise<typeof partners.$inferSelect | null> {
  const [row] = await tx.select().from(partners).where(and(eq(partners.defaultChannelId, channelId), inArray(partners.kind, ['customer', 'both']))).orderBy(partners.code).limit(1);
  return row ?? null;
}

export type ConvertChannelOrderResult = { status: 'converted' | 'error'; salesOrderId?: string; salesOrderDocNo?: string; deliveryId?: string; deliveryDocNo?: string; error?: string };

/** Barkod eşleştirme ile ham pazaryeri siparişini satış siparişine dönüştürür, otomatik onaylar (irsaliye taslağı açılır). */
export async function convertChannelOrder(tx: DbOrTx, channelOrderId: string, ctx: ActorCtx): Promise<ConvertChannelOrderResult> {
  const [co] = await tx.select().from(channelOrders).where(eq(channelOrders.id, channelOrderId)).for('update');
  if (!co) throw new NotFoundError('Pazaryeri siparişi', channelOrderId);
  if (co.syncStatus === 'converted') return { status: 'converted', salesOrderId: co.salesOrderId ?? undefined };

  const partner = await getChannelPartner(tx, co.channelId);
  if (!partner) {
    const msg = 'Kanala bağlı müşteri carisi tanımlı değil';
    await tx.update(channelOrders).set({ syncStatus: 'error', syncError: msg }).where(eq(channelOrders.id, co.id));
    return { status: 'error', error: msg };
  }

  const lines = (co.lines ?? []) as ChannelOrderLineInput[];
  if (!lines.length) {
    const msg = 'Pazaryeri siparişinde satır yok';
    await tx.update(channelOrders).set({ syncStatus: 'error', syncError: msg }).where(eq(channelOrders.id, co.id));
    return { status: 'error', error: msg };
  }

  const barcodes = Array.from(new Set(lines.map((l) => l.barcode).filter(Boolean)));
  const productRows = barcodes.length ? await tx.select().from(products).where(inArray(products.barcode, barcodes)) : [];
  const productByBarcode = new Map(productRows.map((p) => [p.barcode, p]));
  const unmatched = lines.filter((l) => !productByBarcode.get(l.barcode));
  if (unmatched.length) {
    const msg = `Barkod eşleşmedi: ${unmatched.map((l) => l.barcode || l.productName).join(', ')}`;
    await tx.update(channelOrders).set({ syncStatus: 'error', syncError: msg }).where(eq(channelOrders.id, co.id));
    return { status: 'error', error: msg };
  }

  const warehouse = await resolveDefaultSalesWarehouse(tx);
  const orderDate = businessDate(co.orderedAt);
  // origin='manual' (bkz. `document_links` — channel_orders belge zinciri tiplerinde yer almaz,
  // dolayısıyla pazaryeri kaynaklı sipariş için gerçek bir "kaynak belge" yok; izlenebilirlik
  // `channel_orders.sales_order_id` + `sales_orders.external_order_no` ile sağlanır).
  const { order } = await createSalesDoc(tx, {
    docType: 'order', partnerId: partner.id, channelId: co.channelId, warehouseId: warehouse.id, orderDate, currency: co.currency,
    externalOrderNo: co.externalId, origin: 'manual',
    lines: lines.map((l) => ({ productId: productByBarcode.get(l.barcode)!.id, qty: D(l.qty), unitPrice: D(l.unitPrice) })),
  }, ctx);
  const { delivery } = await confirmOrder(tx, order.id, ctx);

  await tx.update(channelOrders).set({ salesOrderId: order.id, syncStatus: 'converted', syncError: null }).where(eq(channelOrders.id, co.id));
  return { status: 'converted', salesOrderId: order.id, salesOrderDocNo: order.docNo, deliveryId: delivery.id, deliveryDocNo: delivery.docNo };
}

export type IngestResult = { fetched: number; converted: number; errors: number; createdOrders: Array<{ salesOrderId: string; salesOrderDocNo: string; deliveryId: string; deliveryDocNo: string }> };

/** Ham pazaryeri siparişlerini `channel_orders`a işler (upsert) ve yeni/hatalı olanları dönüştürmeyi dener. */
export async function ingestChannelOrders(tx: DbOrTx, channelId: string, orders: ChannelOrderInput[], ctx: ActorCtx): Promise<IngestResult> {
  let converted = 0;
  let errors = 0;
  const createdOrders: IngestResult['createdOrders'] = [];
  for (const o of orders) {
    if (!o.lines.length) throw new ValidationError(`Pazaryeri siparişi ${o.externalId} satırsız`);
    const [existing] = await tx.select().from(channelOrders).where(and(eq(channelOrders.channelId, channelId), eq(channelOrders.externalId, o.externalId))).limit(1);
    if (existing?.syncStatus === 'converted') continue;

    const values = {
      externalStatus: o.externalStatus, orderedAt: new Date(o.orderedAt), customerName: o.customerName ?? null, customerEmail: o.customerEmail ?? null,
      customerPhone: o.customerPhone ?? null, grossAmount: toDb(D(o.grossAmount)), commissionAmount: toDb(D(o.commissionAmount)),
      shippingAmount: toDb(D(o.shippingAmount)), netAmount: toDb(D(o.netAmount)), currency: o.currency, lines: o.lines, raw: o.raw ?? {}, syncedAt: new Date(),
    };
    let rowId: string;
    if (existing) {
      await tx.update(channelOrders).set(values).where(eq(channelOrders.id, existing.id));
      rowId = existing.id;
    } else {
      const [row] = await tx.insert(channelOrders).values({ channelId, externalId: o.externalId, syncStatus: 'new', ...values }).returning();
      rowId = row!.id;
    }
    try {
      const res = await convertChannelOrder(tx, rowId, ctx);
      if (res.status === 'converted') {
        converted++;
        if (res.salesOrderId && res.salesOrderDocNo && res.deliveryId && res.deliveryDocNo) {
          createdOrders.push({ salesOrderId: res.salesOrderId, salesOrderDocNo: res.salesOrderDocNo, deliveryId: res.deliveryId, deliveryDocNo: res.deliveryDocNo });
        }
      } else errors++;
    } catch (err) {
      errors++;
      const msg = err instanceof DomainError ? err.message : err instanceof Error ? err.message : String(err);
      await tx.update(channelOrders).set({ syncStatus: 'error', syncError: msg }).where(eq(channelOrders.id, rowId));
    }
  }
  return { fetched: orders.length, converted, errors, createdOrders };
}

/** Tüm tutarlar TL karşılığıdır (siparişin kendi `exchange_rate`'i ile çevrilmiştir — dövizli kanallar da toplama katılabilsin diye). */
export type ChannelRevenueRow = {
  channelId: string; channelCode: string; channelName: string; orderCount: number;
  subtotal: Decimal; vatTotal: Decimal; grandTotal: Decimal;
  commissionAmount: Decimal; shippingDeduction: Decimal; otherDeduction: Decimal; netRevenue: Decimal;
};

/** Kanal başına ciro/kesinti özeti (TL karşılığı) — `confirmed+` siparişler (taslak/iptal hariç). */
export async function getChannelRevenue(tx: DbOrTx, period: { from: string; to: string }): Promise<ChannelRevenueRow[]> {
  const rows = await tx
    .select({
      channelId: salesChannels.id, channelCode: salesChannels.code, channelName: salesChannels.name,
      orderCount: sql<string>`count(*)`,
      // Dövizli siparişler (ör. İhracat/EUR) TL karşılığına çevrilerek toplanır — aksi halde farklı
      // para birimleri aynı toplamda karışır (ör. 270 EUR ham haliyle 270 TL gibi görünür).
      subtotal: sql<string>`coalesce(sum(${salesOrders.subtotal}::numeric * ${salesOrders.exchangeRate}::numeric), 0)`,
      vatTotal: sql<string>`coalesce(sum(${salesOrders.vatTotal}::numeric * ${salesOrders.exchangeRate}::numeric), 0)`,
      grandTotal: sql<string>`coalesce(sum(${salesOrders.grandTotal}::numeric * ${salesOrders.exchangeRate}::numeric), 0)`,
      commissionAmount: sql<string>`coalesce(sum(${salesOrders.commissionAmount}::numeric * ${salesOrders.exchangeRate}::numeric), 0)`,
      shippingDeduction: sql<string>`coalesce(sum(${salesOrders.shippingDeduction}::numeric * ${salesOrders.exchangeRate}::numeric), 0)`,
      otherDeduction: sql<string>`coalesce(sum(${salesOrders.otherDeduction}::numeric * ${salesOrders.exchangeRate}::numeric), 0)`,
      netRevenue: sql<string>`coalesce(sum(${salesOrders.netRevenue}::numeric * ${salesOrders.exchangeRate}::numeric), 0)`,
    })
    .from(salesOrders)
    .innerJoin(salesChannels, eq(salesChannels.id, salesOrders.channelId))
    .where(
      and(
        eq(salesOrders.docType, 'order'),
        gte(salesOrders.orderDate, period.from),
        lte(salesOrders.orderDate, period.to),
        inArray(salesOrders.status, ['confirmed', 'partially_delivered', 'delivered', 'invoiced', 'closed']),
      ),
    )
    .groupBy(salesChannels.id, salesChannels.code, salesChannels.name);

  return rows.map((r) => ({
    channelId: r.channelId, channelCode: r.channelCode, channelName: r.channelName, orderCount: Number(r.orderCount),
    subtotal: D(r.subtotal), vatTotal: D(r.vatTotal), grandTotal: D(r.grandTotal), commissionAmount: D(r.commissionAmount),
    shippingDeduction: D(r.shippingDeduction), otherDeduction: D(r.otherDeduction), netRevenue: D(r.netRevenue),
  }));
}
