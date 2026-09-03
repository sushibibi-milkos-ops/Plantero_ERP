import { and, eq, sql } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import {
  invoices, invoiceLines, deliveries, deliveryLines, salesOrders, salesOrderLines, products, partners,
  documentLinks, type DbOrTx,
} from '@plantero/db';
import { D, toDb, round4, sum, ZERO } from '../money.js';
import { businessDate, addDays } from '../dates.js';
import { nextDocNo } from '../sequences.js';
import { linkDocuments, indexDocument } from '../documents/chain.js';
import { postJournalEntry, type JournalLineInput } from '../accounting/journal.js';
import { revenueAccountFor } from '../accounting/mapping.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import { computeLineTotals } from './pricing.js';
import { getExchangeRate } from './pricing.js';
import { recomputeOrderStatus } from './orders.js';
import type { ActorCtx, DocumentOrigin } from '../types.js';

/**
 * Satış faturalama — `docs/modules/satis.md`. Tek muhasebe yazma noktası (`postJournalEntry`) 120/600(601)+391
 * fişini atar; COGS ayrıca burada işlenmez (sevkiyat anında `postStockMove(kind:'delivery')` 621/152 zaten atar) —
 * `invoice_lines.cogs_amount` yalnızca marj raporlaması için bilgi amaçlıdır.
 */

type BuiltInvoiceLine = {
  productId: string;
  description: string;
  qty: Decimal;
  uomId: string | null;
  unitPrice: Decimal;
  discountPct: Decimal;
  vatRate: Decimal;
  salesOrderLineId: string | null;
  deliveryLineId: string | null;
  lotId: string | null;
  cogsAmount: Decimal;
  accountCode: string;
} & ReturnType<typeof computeLineTotals>;

export type InvoiceWithLines = { invoice: typeof invoices.$inferSelect; lines: Array<typeof invoiceLines.$inferSelect> };

type CreateInvoiceCoreInput = {
  partnerId: string;
  channelId: string | null;
  salesOrderId: string | null;
  deliveryId: string | null;
  currency: string;
  isExport: boolean;
  invoiceDate: string;
  dueDate: string;
  origin: DocumentOrigin;
  lines: BuiltInvoiceLine[];
};

async function createInvoiceCore(tx: DbOrTx, input: CreateInvoiceCoreInput, ctx: ActorCtx): Promise<InvoiceWithLines> {
  if (!input.lines.length) throw new ValidationError('Faturada en az bir satır olmalı');
  const [partner] = await tx.select().from(partners).where(eq(partners.id, input.partnerId)).limit(1);
  if (!partner) throw new NotFoundError('Cari', input.partnerId);

  const subtotal = round4(sum(input.lines.map((l) => l.lineSubtotal)));
  const discountTotal = round4(sum(input.lines.map((l) => l.qty.mul(l.unitPrice).minus(l.lineSubtotal))));
  const vatTotal = round4(sum(input.lines.map((l) => l.lineVat)));
  const grandTotal = round4(sum(input.lines.map((l) => l.lineTotal)));

  const exchangeRate = await getExchangeRate(tx, input.currency, input.invoiceDate);
  if (exchangeRate === null) throw new ValidationError(`${input.currency} için ${input.invoiceDate} tarihli TCMB kuru bulunamadı`, { currency: input.currency, date: input.invoiceDate });
  // Yuvarlama tutarlılığı (I13): grand_total_try tam olarak grand_total × exchange_rate olmalı;
  // subtotal/KDV'nin TL karşılığı bağımsız yuvarlanmaz, farkın tamamı ara toplama yazılır.
  const grandTotalTry = round4(grandTotal.mul(exchangeRate));
  const vatTotalTry = round4(vatTotal.mul(exchangeRate));
  const subtotalTry = round4(grandTotalTry.minus(vatTotalTry));

  const docNo = await nextDocNo(tx, 'INV', new Date(input.invoiceDate));
  const [invoice] = await tx
    .insert(invoices)
    .values({
      docNo, kind: 'sales', status: 'draft', partnerId: partner.id, channelId: input.channelId, salesOrderId: input.salesOrderId,
      deliveryId: input.deliveryId, invoiceDate: input.invoiceDate, dueDate: input.dueDate, currency: input.currency,
      exchangeRate: toDb(exchangeRate), subtotal: toDb(subtotal), discountTotal: toDb(discountTotal), vatTotal: toDb(vatTotal),
      grandTotal: toDb(grandTotal), grandTotalTry: toDb(grandTotalTry), residual: toDb(grandTotal), isExport: input.isExport,
      origin: input.origin, createdBy: ctx.userId ?? null,
    })
    .returning();

  const insertedLines: Array<typeof invoiceLines.$inferSelect> = [];
  let seq = 10;
  for (const l of input.lines) {
    const [row] = await tx
      .insert(invoiceLines)
      .values({
        invoiceId: invoice!.id, productId: l.productId, description: l.description, qty: toDb(l.qty), uomId: l.uomId,
        unitPrice: toDb(l.unitPrice), discountPct: toDb(l.discountPct), vatRate: toDb(l.vatRate), lineSubtotal: toDb(l.lineSubtotal),
        lineVat: toDb(l.lineVat), lineTotal: toDb(l.lineTotal), salesOrderLineId: l.salesOrderLineId, deliveryLineId: l.deliveryLineId,
        lotId: l.lotId, cogsAmount: toDb(l.cogsAmount), accountCode: l.accountCode, sequence: seq,
      })
      .returning();
    insertedLines.push(row!);
    seq += 10;
  }

  // Yevmiye: 120.cari (borç, TL karşılığı) — gelir hesabı(ları) + 391 (alacak). Aynı gelir hesabındaki satırlar tek kalemde toplanır.
  const revenueByAccount = new Map<string, Decimal>();
  for (const l of input.lines) {
    const shareTry = round4(l.lineSubtotal.mul(exchangeRate));
    revenueByAccount.set(l.accountCode, (revenueByAccount.get(l.accountCode) ?? ZERO).plus(shareTry));
  }
  // Yuvarlama farkını en büyük gelir kalemine ekle (Σ gelir kalemleri tam olarak subtotalTry etsin)
  const revenueSum = round4(sum(Array.from(revenueByAccount.values())));
  const roundingDiff = subtotalTry.minus(revenueSum);
  if (!roundingDiff.isZero() && revenueByAccount.size) {
    const [biggestCode] = Array.from(revenueByAccount.entries()).sort((a, b) => b[1].comparedTo(a[1]))[0]!;
    revenueByAccount.set(biggestCode, revenueByAccount.get(biggestCode)!.plus(roundingDiff));
  }

  const lines: JournalLineInput[] = [
    { accountCode: '120', debit: grandTotalTry, partnerId: partner.id, description: `Fatura ${docNo}`, channelId: input.channelId ?? undefined, dueDate: input.dueDate },
  ];
  for (const [accountCode, amount] of revenueByAccount) {
    if (amount.isZero()) continue;
    lines.push({ accountCode, credit: amount, partnerId: partner.id, description: `Fatura ${docNo}`, channelId: input.channelId ?? undefined });
  }
  if (!vatTotalTry.isZero()) lines.push({ accountCode: '391', credit: vatTotalTry, description: `Fatura ${docNo} KDV` });

  const { vukId } = await postJournalEntry(tx, {
    ledger: 'both', journalCode: 'SAT', entryDate: new Date(input.invoiceDate), description: `Satış faturası ${docNo}: ${partner.name}`,
    refType: 'invoice', refId: invoice!.id, refNo: docNo, partnerId: partner.id, currency: input.currency, exchangeRate, lines, origin: input.origin,
  }, ctx);

  const postedAt = new Date();
  const [posted] = await tx
    .update(invoices)
    .set({ status: 'posted', postedAt, postedBy: ctx.userId ?? null, journalEntryId: vukId ?? null, updatedBy: ctx.userId ?? null })
    .where(eq(invoices.id, invoice!.id))
    .returning();

  for (let i = 0; i < input.lines.length; i++) {
    const l = input.lines[i]!;
    const invLine = insertedLines[i]!;
    if (l.salesOrderLineId) {
      await tx.update(salesOrderLines).set({ invoicedQty: sql`${salesOrderLines.invoicedQty} + ${toDb(l.qty)}::numeric` }).where(eq(salesOrderLines.id, l.salesOrderLineId));
    }
    if (input.deliveryId && l.deliveryLineId) {
      await linkDocuments(tx, { sourceType: 'delivery', sourceId: input.deliveryId, sourceLineId: l.deliveryLineId, targetType: 'invoice', targetId: invoice!.id, targetLineId: invLine.id, qty: l.qty, amount: l.lineTotal }, ctx);
    } else if (input.salesOrderId && l.salesOrderLineId) {
      await linkDocuments(tx, { sourceType: 'sales_order', sourceId: input.salesOrderId, sourceLineId: l.salesOrderLineId, targetType: 'invoice', targetId: invoice!.id, targetLineId: invLine.id, qty: l.qty, amount: l.lineTotal }, ctx);
    }
  }
  if (input.deliveryId && input.salesOrderId) {
    await linkDocuments(tx, { sourceType: 'delivery', sourceId: input.deliveryId, targetType: 'invoice', targetId: invoice!.id }, ctx);
  } else if (input.salesOrderId) {
    await linkDocuments(tx, { sourceType: 'sales_order', sourceId: input.salesOrderId, targetType: 'invoice', targetId: invoice!.id }, ctx);
  }

  await indexDocument(tx, { type: 'invoice', recordId: invoice!.id, docNo, partnerId: partner.id, status: 'posted', origin: input.origin, title: `Fatura ${docNo}`, amount: grandTotal, docDate: new Date(input.invoiceDate) });
  if (input.salesOrderId) await recomputeOrderStatus(tx, input.salesOrderId);

  const finalLines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice!.id)).orderBy(invoiceLines.sequence);
  return { invoice: posted!, lines: finalLines };
}

/** Sevk edilen irsaliyeden fatura oluşturur (lot/COGS bilgisi dahil). Bir irsaliye yalnızca bir kez faturalanabilir. */
export async function createInvoiceFromDelivery(tx: DbOrTx, deliveryId: string, ctx: ActorCtx, opts: { invoiceDate?: string | Date } = {}): Promise<InvoiceWithLines> {
  const [delivery] = await tx.select().from(deliveries).where(eq(deliveries.id, deliveryId)).limit(1);
  if (!delivery) throw new NotFoundError('Sevkiyat', deliveryId);
  if (!['shipped', 'delivered'].includes(delivery.status)) throw new DomainError('DELIVERY_NOT_SHIPPED', `${delivery.docNo} sevk edilmeden faturalanamaz (durum: ${delivery.status})`);
  if (!delivery.salesOrderId) throw new ValidationError('Sevkiyatın bağlı bir siparişi yok');

  const already = await tx.select({ id: documentLinks.id }).from(documentLinks).where(and(eq(documentLinks.sourceType, 'delivery'), eq(documentLinks.sourceId, deliveryId), eq(documentLinks.targetType, 'invoice'))).limit(1);
  if (already.length) throw new DomainError('DELIVERY_ALREADY_INVOICED', `${delivery.docNo} zaten faturalanmış`);

  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, delivery.salesOrderId)).limit(1);
  if (!order) throw new NotFoundError('Satış siparişi', delivery.salesOrderId);
  const dLines = (await tx.select().from(deliveryLines).where(eq(deliveryLines.deliveryId, deliveryId))).filter((l) => D(l.pickedQty).gt(0));
  if (!dLines.length) throw new ValidationError('Sevkiyatta faturalanacak satır yok');
  const soLineIds = dLines.map((l) => l.salesOrderLineId).filter((v): v is string => Boolean(v));
  const soLines = soLineIds.length ? await tx.select().from(salesOrderLines).where(and(eq(salesOrderLines.orderId, order.id))) : [];
  const soLineById = new Map(soLines.map((l) => [l.id, l]));

  const built: BuiltInvoiceLine[] = [];
  for (const dl of dLines) {
    const soLine = dl.salesOrderLineId ? soLineById.get(dl.salesOrderLineId) : undefined;
    if (!soLine) continue;
    const [product] = await tx.select().from(products).where(eq(products.id, dl.productId)).limit(1);
    if (!product) throw new NotFoundError('Ürün', dl.productId);
    const qty = D(dl.pickedQty);
    const unitPrice = D(soLine.unitPrice);
    const discountPct = D(soLine.discountPct);
    const vatRate = D(soLine.vatRate);
    const totals = computeLineTotals({ qty, unitPrice, discountPct, vatRate });
    built.push({
      productId: dl.productId, description: product.name, qty, uomId: dl.uomId, unitPrice, discountPct, vatRate,
      salesOrderLineId: soLine.id, deliveryLineId: dl.id, lotId: dl.lotId, cogsAmount: round4(qty.mul(D(dl.unitCost ?? 0))),
      accountCode: revenueAccountFor(product, order.isExport), ...totals,
    });
  }
  if (!built.length) throw new ValidationError('Sevkiyat satırları siparişe bağlı değil; fatura oluşturulamadı');

  const invoiceDate = businessDate(opts.invoiceDate ?? new Date());
  const dueDate = order.paymentTermDays > 0 ? addDays(invoiceDate, order.paymentTermDays) : invoiceDate;
  return createInvoiceCore(tx, {
    partnerId: order.partnerId, channelId: order.channelId, salesOrderId: order.id, deliveryId, currency: order.currency,
    isExport: order.isExport, invoiceDate, dueDate, origin: 'chain', lines: built,
  }, ctx);
}

/** Teslimatsız satış (hizmet / doğrudan hammadde) — sipariş satırlarından, kalan (fatura edilmemiş) miktar üzerinden. */
export async function createInvoiceFromOrder(tx: DbOrTx, orderId: string, ctx: ActorCtx, opts: { lineIds?: string[]; invoiceDate?: string | Date } = {}): Promise<InvoiceWithLines> {
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
  if (!order) throw new NotFoundError('Sipariş', orderId);
  if (order.docType !== 'order') throw new DomainError('NOT_AN_ORDER', `${order.docNo} bir sipariş değil`);
  if (!['confirmed', 'partially_delivered', 'delivered'].includes(order.status)) throw new DomainError('ORDER_NOT_CONFIRMED', `${order.docNo} onaylanmadan faturalanamaz (durum: ${order.status})`);

  const allLines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId));
  const candidates = opts.lineIds?.length ? allLines.filter((l) => opts.lineIds!.includes(l.id)) : allLines;
  const built: BuiltInvoiceLine[] = [];
  for (const l of candidates) {
    const remaining = round4(D(l.qty).minus(D(l.invoicedQty)));
    if (remaining.lte(0)) continue;
    const [product] = await tx.select().from(products).where(eq(products.id, l.productId)).limit(1);
    if (!product) throw new NotFoundError('Ürün', l.productId);
    const totals = computeLineTotals({ qty: remaining, unitPrice: D(l.unitPrice), discountPct: D(l.discountPct), vatRate: D(l.vatRate) });
    built.push({
      productId: l.productId, description: product.name, qty: remaining, uomId: l.uomId, unitPrice: D(l.unitPrice), discountPct: D(l.discountPct),
      vatRate: D(l.vatRate), salesOrderLineId: l.id, deliveryLineId: null, lotId: null, cogsAmount: ZERO, accountCode: revenueAccountFor(product, order.isExport), ...totals,
    });
  }
  if (!built.length) throw new DomainError('NOTHING_TO_INVOICE', 'Faturalanacak miktar kalmadı');

  const invoiceDate = businessDate(opts.invoiceDate ?? new Date());
  const dueDate = order.paymentTermDays > 0 ? addDays(invoiceDate, order.paymentTermDays) : invoiceDate;
  return createInvoiceCore(tx, {
    partnerId: order.partnerId, channelId: order.channelId, salesOrderId: order.id, deliveryId: null, currency: order.currency,
    isExport: order.isExport, invoiceDate, dueDate, origin: 'chain', lines: built,
  }, ctx);
}
