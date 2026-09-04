'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@plantero/db';
import { D } from '@plantero/core';
import {
  createSalesDoc, updateLines, sendQuotation, acceptQuotation, convertQuotationToOrder, confirmOrder, cancelOrder,
  type SalesLineInput,
} from '@plantero/core/sales/orders';
import { createInvoiceFromDelivery, createInvoiceFromOrder } from '@plantero/core/sales/invoicing';
import { ingestChannelOrders } from '@plantero/core/sales/channels';
import { createOpportunity, moveOpportunity, addActivity, setNextActivity, convertToQuotation } from '@plantero/core/sales/crm';
import { resolvePrice } from '@plantero/core/sales/pricing';
// Not: '@plantero/integrations' barrel'ı (index.ts) pdf/render.ts üzerinden playwright-core'u da
// re-export eder; bu server action dosyası client referans grafiğine dahil olduğundan barrel yerine
// yalnızca ihtiyaç duyulan alt modülden içe aktarılır (aksi halde webpack playwright-core'un
// bidi/native bağımlılıklarını çözemediği için build hatası verir).
import { trendyol } from '@plantero/integrations/marketplace/trendyol';
import { hepsiburada } from '@plantero/integrations/marketplace/hepsiburada';
import { requirePermission } from '@/lib/auth';
import { withAudit } from '@/lib/actions';
import { getPriceListItems, getOpportunityDetail } from './queries';

const { customerPrices, priceLists, priceListItems, salesChannels } = schema;

/* ==================================================================== */
/* CRM — fırsatlar                                                      */
/* ==================================================================== */

const createOpportunitySchema = z.object({
  title: z.string().trim().min(2, 'Başlık gerekli'),
  partnerId: z.string().uuid().optional().nullable(),
  contactName: z.string().trim().optional().nullable(),
  contactEmail: z.string().trim().optional().nullable(),
  contactPhone: z.string().trim().optional().nullable(),
  stageId: z.string().uuid().optional().nullable(),
  channelId: z.string().uuid().optional().nullable(),
  expectedAmount: z.string().min(1),
  currency: z.string().default('TRY'),
  expectedCloseDate: z.string().optional().nullable(),
  source: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable(),
});

export const createOpportunityAction = withAudit('sales.createOpportunity', async (raw: z.infer<typeof createOpportunitySchema>) => {
  const user = await requirePermission('sales.quote');
  const input = createOpportunitySchema.parse(raw);
  const opp = await db.transaction((tx) => createOpportunity(tx, { ...input, expectedAmount: D(input.expectedAmount) }, user.actor));
  revalidatePath('/satis/firsatlar');
  return { data: { id: opp.id, docNo: opp.docNo }, audit: { action: 'create', tableName: 'opportunities', recordId: opp.id, summary: `Fırsat ${opp.docNo} oluşturuldu: ${opp.title}`, after: opp } };
});

const moveOpportunitySchema = z.object({ id: z.string().uuid(), stageId: z.string().uuid(), lostReason: z.string().trim().optional().nullable() });

export const moveOpportunityAction = withAudit('sales.moveOpportunity', async (raw: z.infer<typeof moveOpportunitySchema>) => {
  const user = await requirePermission('sales.quote');
  const input = moveOpportunitySchema.parse(raw);
  const opp = await db.transaction((tx) => moveOpportunity(tx, input, user.actor));
  revalidatePath('/satis/firsatlar');
  return { data: { id: opp.id }, audit: { action: 'update', tableName: 'opportunities', recordId: opp.id, summary: `Fırsat ${opp.docNo} aşaması değişti` } };
});

const addActivitySchema = z.object({ opportunityId: z.string().uuid(), kind: z.enum(['call', 'email', 'meeting', 'note', 'whatsapp']), body: z.string().trim().min(1, 'Metin gerekli') });

export const addActivityAction = withAudit('sales.addActivity', async (raw: z.infer<typeof addActivitySchema>) => {
  const user = await requirePermission('sales.quote');
  const input = addActivitySchema.parse(raw);
  const activity = await db.transaction((tx) => addActivity(tx, input, user.actor));
  revalidatePath('/satis/firsatlar');
  return { data: { id: activity.id }, audit: { action: 'create', tableName: 'opportunity_activities', recordId: activity.id, summary: `Aktivite eklendi (${activity.kind})` } };
});

const setNextActivitySchema = z.object({ id: z.string().uuid(), nextActivity: z.string().trim().optional().nullable(), nextActivityDate: z.string().optional().nullable() });

export const setNextActivityAction = withAudit('sales.setNextActivity', async (raw: z.infer<typeof setNextActivitySchema>) => {
  const user = await requirePermission('sales.quote');
  const input = setNextActivitySchema.parse(raw);
  const opp = await db.transaction((tx) => setNextActivity(tx, { id: input.id, nextActivity: input.nextActivity ?? null, nextActivityDate: input.nextActivityDate ?? null }, user.actor));
  revalidatePath('/satis/firsatlar');
  return { data: { id: opp.id } };
});

export type OpportunityDetailData = Awaited<ReturnType<typeof getOpportunityDetail>>;

/** Kanban kartına tıklandığında sağ çekmecede detay yükler (yalnızca okuma). */
export const getOpportunityDetailAction = withAudit('sales.getOpportunityDetail', async (raw: { id: string }) => {
  await requirePermission('sales.view');
  const input = z.object({ id: z.string().uuid() }).parse(raw);
  const detail = await getOpportunityDetail(input.id);
  if (!detail) throw new Error('Fırsat bulunamadı');
  return { data: detail };
});

export const convertToQuotationAction = withAudit('sales.convertToQuotation', async (raw: { id: string }) => {
  const user = await requirePermission('sales.quote');
  const input = z.object({ id: z.string().uuid() }).parse(raw);
  const result = await db.transaction((tx) => convertToQuotation(tx, input.id, user.actor));
  revalidatePath('/satis/firsatlar');
  revalidatePath('/satis/teklifler');
  return { data: { quotationId: result.quotationId, quotationDocNo: result.quotationDocNo }, audit: { action: 'create', tableName: 'sales_orders', recordId: result.quotationId!, summary: `Fırsat ${result.docNo} teklife dönüştürüldü: ${result.quotationDocNo}` } };
});

/* ==================================================================== */
/* Teklif / Sipariş — ortak (docType ile ayrışır)                       */
/* ==================================================================== */

const lineSchema = z.object({
  productId: z.string().uuid('Ürün seçin'),
  qty: z.string().min(1, 'Miktar girin'),
  uomId: z.string().uuid().optional().nullable(),
  unitPrice: z.string().optional().nullable(),
  discountPct: z.string().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  /** Ücretsiz/numune satır — 0 birim fiyata yalnızca bu bayrakla izin verilir (bkz. buildLine). */
  isFree: z.boolean().optional(),
});

const resolvePriceSchema = z.object({ productId: z.string().uuid(), partnerId: z.string().uuid(), priceListId: z.string().uuid().optional().nullable(), qty: z.string().min(1) });

/** Form ekranında fiyat çözümleme önizlemesi: müşteri özel > kanal/liste fiyatı > ürün liste fiyatı (yalnızca okuma). */
export const resolvePriceAction = withAudit('sales.resolvePrice', async (raw: z.infer<typeof resolvePriceSchema>) => {
  await requirePermission('sales.view');
  const input = resolvePriceSchema.parse(raw);
  const resolved = await resolvePrice(db, { productId: input.productId, partnerId: input.partnerId, priceListId: input.priceListId, qty: D(input.qty) });
  return { data: { unitPrice: resolved.unitPrice.toFixed(4), source: resolved.source, currency: resolved.currency } };
});

const createSalesDocSchema = z.object({
  docType: z.enum(['quotation', 'order']),
  partnerId: z.string().uuid('Cari seçin'),
  channelId: z.string().uuid('Kanal seçin'),
  warehouseId: z.string().uuid('Depo seçin'),
  priceListId: z.string().uuid().optional().nullable(),
  opportunityId: z.string().uuid().optional().nullable(),
  externalOrderNo: z.string().trim().optional().nullable(),
  customerRef: z.string().trim().optional().nullable(),
  orderDate: z.string().optional(),
  validUntil: z.string().optional().nullable(),
  requestedDeliveryDate: z.string().optional().nullable(),
  currency: z.string().optional(),
  paymentTermDays: z.coerce.number().int().min(0).optional(),
  isExport: z.boolean().optional(),
  incoterm: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable(),
  lines: z.array(lineSchema).min(1, 'En az bir satır ekleyin'),
});

function toLineInputs(lines: z.infer<typeof createSalesDocSchema>['lines']): SalesLineInput[] {
  return lines.map((l) => ({
    productId: l.productId, qty: D(l.qty), uomId: l.uomId || null,
    unitPrice: l.unitPrice ? D(l.unitPrice) : null, discountPct: l.discountPct ? D(l.discountPct) : null, description: l.description || null,
    isFree: l.isFree ?? false,
  }));
}

export const createSalesDocAction = withAudit('sales.createSalesDoc', async (raw: z.infer<typeof createSalesDocSchema>) => {
  const input = createSalesDocSchema.parse(raw);
  const user = await requirePermission(input.docType === 'quotation' ? 'sales.quote' : 'sales.order');
  const { order } = await db.transaction((tx) => createSalesDoc(tx, { ...input, lines: toLineInputs(input.lines) }, user.actor));
  revalidatePath(input.docType === 'quotation' ? '/satis/teklifler' : '/satis/siparisler');
  return {
    data: { id: order.id, docNo: order.docNo },
    audit: { action: 'create', tableName: 'sales_orders', recordId: order.id, summary: `${input.docType === 'quotation' ? 'Teklif' : 'Sipariş'} ${order.docNo} oluşturuldu`, after: order },
  };
});

const updateLinesSchema = z.object({ orderId: z.string().uuid(), docType: z.enum(['quotation', 'order']), lines: z.array(lineSchema).min(1, 'En az bir satır ekleyin') });

export const updateLinesAction = withAudit('sales.updateLines', async (raw: z.infer<typeof updateLinesSchema>) => {
  const input = updateLinesSchema.parse(raw);
  const user = await requirePermission(input.docType === 'quotation' ? 'sales.quote' : 'sales.order');
  const { order } = await db.transaction((tx) => updateLines(tx, input.orderId, toLineInputs(input.lines), user.actor));
  revalidatePath(input.docType === 'quotation' ? `/satis/teklifler/${input.orderId}` : `/satis/siparisler/${input.orderId}`);
  return { data: { id: order.id }, audit: { action: 'update', tableName: 'sales_order_lines', recordId: order.id, summary: `${order.docNo} satırları güncellendi` } };
});

const idSchema = z.object({ id: z.string().uuid() });

export const sendQuotationAction = withAudit('sales.sendQuotation', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('sales.quote');
  const input = idSchema.parse(raw);
  const q = await db.transaction((tx) => sendQuotation(tx, input.id, user.actor));
  revalidatePath(`/satis/teklifler/${input.id}`);
  revalidatePath('/satis/teklifler');
  return { data: { status: q.status }, audit: { action: 'update', tableName: 'sales_orders', recordId: q.id, summary: `Teklif ${q.docNo} gönderildi` } };
});

export const acceptQuotationAction = withAudit('sales.acceptQuotation', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('sales.quote');
  const input = idSchema.parse(raw);
  const q = await db.transaction((tx) => acceptQuotation(tx, input.id, user.actor));
  revalidatePath(`/satis/teklifler/${input.id}`);
  return { data: { status: q.status }, audit: { action: 'update', tableName: 'sales_orders', recordId: q.id, summary: `Teklif ${q.docNo} kabul edildi` } };
});

export const convertQuotationToOrderAction = withAudit('sales.convertQuotationToOrder', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('sales.order');
  const input = idSchema.parse(raw);
  const { order } = await db.transaction((tx) => convertQuotationToOrder(tx, input.id, user.actor));
  revalidatePath(`/satis/teklifler/${input.id}`);
  revalidatePath('/satis/siparisler');
  return { data: { id: order.id, docNo: order.docNo }, audit: { action: 'create', tableName: 'sales_orders', recordId: order.id, summary: `${order.docNo} teklif ${input.id} üzerinden oluşturuldu`, after: order } };
});

export const confirmOrderAction = withAudit('sales.confirmOrder', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('sales.confirm');
  const input = idSchema.parse(raw);
  const { order, delivery, warnings } = await db.transaction((tx) => confirmOrder(tx, input.id, user.actor));
  revalidatePath(`/satis/siparisler/${input.id}`);
  revalidatePath('/satis/siparisler');
  revalidatePath('/depo/sevkiyat');
  return {
    data: { status: order.status, deliveryId: delivery.id, deliveryDocNo: delivery.docNo, warnings },
    audit: [
      { action: 'approve', tableName: 'sales_orders', recordId: order.id, summary: `Sipariş ${order.docNo} onaylandı; irsaliye taslağı ${delivery.docNo} açıldı`, after: order },
      { action: 'create', tableName: 'deliveries', recordId: delivery.id, summary: `İrsaliye taslağı ${delivery.docNo} sipariş ${order.docNo} onayından oluştu`, after: delivery },
    ],
  };
});

const cancelSchema = z.object({ id: z.string().uuid(), reason: z.string().trim().optional().nullable() });

export const cancelOrderAction = withAudit('sales.cancelOrder', async (raw: z.infer<typeof cancelSchema>) => {
  const user = await requirePermission('sales.confirm');
  const input = cancelSchema.parse(raw);
  const order = await db.transaction((tx) => cancelOrder(tx, input.id, user.actor, input.reason));
  revalidatePath(`/satis/siparisler/${input.id}`);
  revalidatePath(`/satis/teklifler/${input.id}`);
  revalidatePath('/satis/siparisler');
  revalidatePath('/satis/teklifler');
  return { data: { status: order.status }, audit: { action: 'cancel', tableName: 'sales_orders', recordId: order.id, summary: `${order.docNo} durumu ${order.status}` } };
});

/* ==================================================================== */
/* Fatura                                                                */
/* ==================================================================== */

const invoiceFromDeliverySchema = z.object({ deliveryId: z.string().uuid() });

export const createInvoiceFromDeliveryAction = withAudit('sales.createInvoiceFromDelivery', async (raw: z.infer<typeof invoiceFromDeliverySchema>) => {
  const user = await requirePermission('accounting.invoice');
  const input = invoiceFromDeliverySchema.parse(raw);
  const { invoice } = await db.transaction((tx) => createInvoiceFromDelivery(tx, input.deliveryId, user.actor));
  revalidatePath('/satis/siparisler');
  if (invoice.salesOrderId) revalidatePath(`/satis/siparisler/${invoice.salesOrderId}`);
  return { data: { id: invoice.id, docNo: invoice.docNo }, audit: { action: 'post', tableName: 'invoices', recordId: invoice.id, summary: `Fatura ${invoice.docNo} kesildi (${invoice.grandTotal} ${invoice.currency})`, after: invoice } };
});

const invoiceFromOrderSchema = z.object({ orderId: z.string().uuid(), lineIds: z.array(z.string().uuid()).optional() });

export const createInvoiceFromOrderAction = withAudit('sales.createInvoiceFromOrder', async (raw: z.infer<typeof invoiceFromOrderSchema>) => {
  const user = await requirePermission('accounting.invoice');
  const input = invoiceFromOrderSchema.parse(raw);
  const { invoice } = await db.transaction((tx) => createInvoiceFromOrder(tx, input.orderId, user.actor, { lineIds: input.lineIds }));
  revalidatePath(`/satis/siparisler/${input.orderId}`);
  return { data: { id: invoice.id, docNo: invoice.docNo }, audit: { action: 'post', tableName: 'invoices', recordId: invoice.id, summary: `Fatura ${invoice.docNo} kesildi (teslimatsız satış)`, after: invoice } };
});

/* ==================================================================== */
/* Kanallar                                                              */
/* ==================================================================== */

const syncSchema = z.object({ channelCode: z.enum(['TRENDYOL', 'HEPSIBURADA']) });

export const syncChannelOrdersAction = withAudit('sales.syncChannelOrders', async (raw: z.infer<typeof syncSchema>) => {
  const user = await requirePermission('sales.order');
  const input = syncSchema.parse(raw);
  const [channel] = await db.select().from(salesChannels).where(eq(salesChannels.code, input.channelCode)).limit(1);
  if (!channel) throw new Error(`Kanal bulunamadı: ${input.channelCode}`);

  const provider = input.channelCode === 'TRENDYOL' ? trendyol : hepsiburada;
  const since = new Date(Date.now() - 30 * 86_400_000);
  const orders = await provider.fetchOrders(since);
  const result = await db.transaction((tx) =>
    ingestChannelOrders(
      tx,
      channel.id,
      orders.map((o) => ({
        externalId: o.externalId, orderedAt: o.orderedAt, externalStatus: o.externalStatus, customerName: o.customerName, customerEmail: o.customerEmail,
        customerPhone: o.customerPhone, grossAmount: o.grossAmount, commissionAmount: o.commissionAmount, shippingAmount: o.shippingAmount, netAmount: o.netAmount,
        currency: o.currency, lines: o.lines.map((l) => ({ barcode: l.barcode, sku: l.sku, productName: l.productName, qty: l.qty, unitPrice: l.unitPrice })), raw: o.raw,
      })),
      user.actor,
    ),
  );
  revalidatePath('/satis/kanallar');
  revalidatePath('/satis/siparisler');
  return {
    data: result,
    audit: [
      { action: 'sync', tableName: 'channel_orders', summary: `${channel.name} senkronu: ${result.fetched} sipariş, ${result.converted} dönüştürüldü, ${result.errors} hata` },
      ...result.createdOrders.flatMap((o) => [
        { action: 'create' as const, tableName: 'sales_orders', recordId: o.salesOrderId, summary: `${o.salesOrderDocNo} pazaryeri senkronundan oluşturuldu (${channel.name})` },
        { action: 'create' as const, tableName: 'deliveries', recordId: o.deliveryId, summary: `İrsaliye taslağı ${o.deliveryDocNo} sipariş ${o.salesOrderDocNo} onayından oluştu` },
      ]),
    ],
  };
});

const channelSettingsSchema = z.object({
  id: z.string().uuid(), commissionPct: z.string().min(1), shippingDeductionPerOrder: z.string().min(1), otherDeductionPct: z.string().min(1),
  settlementDays: z.coerce.number().int().min(0), syncEnabled: z.boolean(),
});

export const updateChannelSettingsAction = withAudit('sales.updateChannelSettings', async (raw: z.infer<typeof channelSettingsSchema>) => {
  await requirePermission('sales.price');
  const input = channelSettingsSchema.parse(raw);
  const [updated] = await db
    .update(salesChannels)
    .set({ commissionPct: input.commissionPct, shippingDeductionPerOrder: input.shippingDeductionPerOrder, otherDeductionPct: input.otherDeductionPct, settlementDays: input.settlementDays, syncEnabled: input.syncEnabled })
    .where(eq(salesChannels.id, input.id))
    .returning();
  if (!updated) throw new Error('Kanal bulunamadı');
  revalidatePath('/satis/kanallar');
  return { data: { id: updated.id }, audit: { action: 'update', tableName: 'sales_channels', recordId: updated.id, summary: `${updated.name} kanal ayarları güncellendi`, after: updated } };
});

/* ==================================================================== */
/* Fiyat listeleri                                                      */
/* ==================================================================== */

const priceListIdSchema = z.object({ priceListId: z.string().uuid() });

export type PriceListItemRow = Awaited<ReturnType<typeof getPriceListItems>>[number];

/** Fiyat listesi çekmecesi açıldığında satırları getirir (yalnızca okuma; audit yazılmaz). */
export const getPriceListItemsAction = withAudit('sales.getPriceListItems', async (raw: z.infer<typeof priceListIdSchema>) => {
  await requirePermission('sales.price');
  const input = priceListIdSchema.parse(raw);
  const rows = await getPriceListItems(input.priceListId);
  return { data: rows };
});

const upsertPriceListItemSchema = z.object({ priceListId: z.string().uuid(), productId: z.string().uuid(), minQty: z.string().default('0'), price: z.string().min(1) });

export const upsertPriceListItemAction = withAudit('sales.upsertPriceListItem', async (raw: z.infer<typeof upsertPriceListItemSchema>) => {
  await requirePermission('sales.price');
  const input = upsertPriceListItemSchema.parse(raw);
  const [existing] = await db.select({ id: priceListItems.id }).from(priceListItems).where(and(eq(priceListItems.priceListId, input.priceListId), eq(priceListItems.productId, input.productId), eq(priceListItems.minQty, input.minQty))).limit(1);
  if (existing) await db.update(priceListItems).set({ price: input.price }).where(eq(priceListItems.id, existing.id));
  else await db.insert(priceListItems).values({ priceListId: input.priceListId, productId: input.productId, minQty: input.minQty, price: input.price });
  revalidatePath('/satis/fiyat-listeleri');
  return { data: { ok: true }, audit: { action: existing ? 'update' : 'create', tableName: 'price_list_items', summary: `Fiyat listesi satırı güncellendi (${input.price})` } };
});

const bulkUpdateSchema = z.object({ priceListId: z.string().uuid(), pct: z.string().min(1) });

export const bulkUpdatePriceListAction = withAudit('sales.bulkUpdatePriceList', async (raw: z.infer<typeof bulkUpdateSchema>) => {
  await requirePermission('sales.price');
  const input = bulkUpdateSchema.parse(raw);
  const items = await db.select().from(priceListItems).where(eq(priceListItems.priceListId, input.priceListId));
  const factor = D(1).plus(D(input.pct).div(100));
  for (const item of items) {
    await db.update(priceListItems).set({ price: D(item.price).mul(factor).toFixed(4) }).where(eq(priceListItems.id, item.id));
  }
  const [list] = await db.select({ name: priceLists.name }).from(priceLists).where(eq(priceLists.id, input.priceListId)).limit(1);
  revalidatePath('/satis/fiyat-listeleri');
  return { data: { updated: items.length }, audit: { action: 'update', tableName: 'price_list_items', summary: `${list?.name ?? input.priceListId}: ${items.length} satır %${input.pct} güncellendi` } };
});

const customerPriceSchema = z.object({ partnerId: z.string().uuid(), productId: z.string().uuid(), minQty: z.string().default('0'), price: z.string().min(1), currency: z.string().default('TRY') });

export const upsertCustomerPriceAction = withAudit('sales.upsertCustomerPrice', async (raw: z.infer<typeof customerPriceSchema>) => {
  const user = await requirePermission('sales.price');
  const input = customerPriceSchema.parse(raw);
  const [existing] = await db.select({ id: customerPrices.id }).from(customerPrices).where(and(eq(customerPrices.partnerId, input.partnerId), eq(customerPrices.productId, input.productId), eq(customerPrices.minQty, input.minQty))).limit(1);
  if (existing) await db.update(customerPrices).set({ price: input.price, currency: input.currency, approvedBy: user.userId }).where(eq(customerPrices.id, existing.id));
  else await db.insert(customerPrices).values({ partnerId: input.partnerId, productId: input.productId, minQty: input.minQty, price: input.price, currency: input.currency, approvedBy: user.userId });
  revalidatePath('/satis/fiyat-listeleri');
  return { data: { ok: true }, audit: { action: existing ? 'update' : 'create', tableName: 'customer_prices', summary: `Müşteri özel fiyat kaydedildi (${input.price})` } };
});
