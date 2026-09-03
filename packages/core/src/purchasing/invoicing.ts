import { and, eq, sql } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import {
  invoices, invoiceLines, receipts, receiptLines, purchaseOrders, purchaseOrderLines, products, partners,
  type DbOrTx,
} from '@plantero/db';
import { D, toDb, toDbRate, round4, sum, ZERO } from '../money.js';
import { businessDate, addDays } from '../dates.js';
import { nextDocNo } from '../sequences.js';
import { linkDocuments, indexDocument } from '../documents/chain.js';
import { postJournalEntry, type JournalLineInput } from '../accounting/journal.js';
import { computeLineTotals } from '../sales/pricing.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import type { ActorCtx } from '../types.js';

/**
 * Alış faturalama — mal kabulden fatura üretir ve TEK muhasebe yazma noktasını (`postJournalEntry`)
 * kullanarak `postStockMove(kind:'receipt')`'nin açtığı 320.999 (Faturası Gelmemiş Alımlar) ara hesabını
 * gerçek tedarikçi cari hesabına (320.<kod>) devreder ve 191 (İndirilecek KDV)'yi doğurur
 * (ARCHITECTURE §6.7 / §7 — "Alış faturası (stoklu): 320.999 + 191 (borç) | 320.cari (alacak)").
 *
 * Fatura satırları mal kabul satırlarından (`receipt_lines`) türetilir — miktar × birim maliyet
 * (`unit_cost`), yani tam olarak `receipt`'in stok hareketinde 320.999'a yazılan değerdir; böylece bu
 * ara hesap net olarak kapanır. KDV oranı ürünün `purchase_vat_rate` alanından alınır (yoksa %20 —
 * CLAUDE.md kural 8: "alış %20 ağırlıklı"). Mal kabulde şu an tek para birimi (TRY) desteklenir — şema
 * `receipt_lines`'da döviz alanı taşımıyor; `unit_cost` doğrudan TL kabul edilir (aynı varsayım
 * `stock/ledger.ts postStockMove` tarafında da geçerli).
 */

export type PurchaseInvoiceWithLines = { invoice: typeof invoices.$inferSelect; lines: Array<typeof invoiceLines.$inferSelect> };

type BuiltPurchaseInvoiceLine = {
  productId: string;
  description: string;
  qty: Decimal;
  uomId: string;
  unitPrice: Decimal;
  vatRate: Decimal;
  purchaseOrderLineId: string | null;
  receiptLineId: string;
} & ReturnType<typeof computeLineTotals>;

export type CreatePurchaseInvoiceFromReceiptOpts = {
  supplierInvoiceNo?: string | null;
  invoiceDate?: string | Date;
  dueDate?: string | Date;
};

/**
 * Mal kabulden alış faturası oluşturur ve postalar (tek adım — SAP B1'de "based on" fatura).
 * Bir mal kabul yalnızca bir kez faturalanabilir (`invoices.receipt_id` üzerinden).
 */
export async function createPurchaseInvoiceFromReceipt(
  tx: DbOrTx,
  receiptId: string,
  ctx: ActorCtx,
  opts: CreatePurchaseInvoiceFromReceiptOpts = {},
): Promise<PurchaseInvoiceWithLines> {
  const [receipt] = await tx.select().from(receipts).where(eq(receipts.id, receiptId)).limit(1);
  if (!receipt) throw new NotFoundError('Mal kabul', receiptId);
  if (receipt.status === 'draft') throw new DomainError('RECEIPT_NOT_RECEIVED', `${receipt.docNo} henüz kabul edilmedi; faturalanamaz`, { receiptId });
  if (!receipt.partnerId) throw new ValidationError('Mal kabulün tedarikçisi yok; fatura oluşturulamaz', { receiptId });

  const already = await tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.kind, 'purchase'), eq(invoices.receiptId, receiptId), sql`${invoices.status} <> 'cancelled'`))
    .limit(1);
  if (already.length) throw new DomainError('RECEIPT_ALREADY_INVOICED', `${receipt.docNo} zaten faturalanmış`, { receiptId });

  const [partner] = await tx.select().from(partners).where(eq(partners.id, receipt.partnerId)).limit(1);
  if (!partner) throw new NotFoundError('Cari', receipt.partnerId);

  const po = receipt.purchaseOrderId
    ? (await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, receipt.purchaseOrderId)).limit(1))[0]
    : undefined;

  const rLines = await tx.select().from(receiptLines).where(eq(receiptLines.receiptId, receiptId)).orderBy(receiptLines.sequence);
  if (!rLines.length) throw new ValidationError('Mal kabulde satır yok', { receiptId });

  const built: BuiltPurchaseInvoiceLine[] = [];
  for (const rl of rLines) {
    const qty = D(rl.qty);
    if (qty.lte(0)) continue;
    const [product] = await tx.select().from(products).where(eq(products.id, rl.productId)).limit(1);
    if (!product) throw new NotFoundError('Ürün', rl.productId);
    const vatRate = D(product.purchaseVatRate ?? '20');
    const totals = computeLineTotals({ qty, unitPrice: D(rl.unitCost), vatRate });
    built.push({
      productId: rl.productId, description: product.name, qty, uomId: rl.uomId, unitPrice: D(rl.unitCost),
      vatRate, purchaseOrderLineId: rl.purchaseOrderLineId, receiptLineId: rl.id, ...totals,
    });
  }
  if (!built.length) throw new ValidationError('Faturalanacak satır kalmadı (tüm satırlar sıfır miktarlı)', { receiptId });

  const subtotal = round4(sum(built.map((l) => l.lineSubtotal)));
  const vatTotal = round4(sum(built.map((l) => l.lineVat)));
  const grandTotal = round4(sum(built.map((l) => l.lineTotal)));

  const invoiceDate = businessDate(opts.invoiceDate ?? new Date());
  const termDays = po?.paymentTermDays ?? partner.paymentTermDays ?? 0;
  const dueDate = opts.dueDate ? businessDate(opts.dueDate) : termDays > 0 ? addDays(invoiceDate, termDays) : invoiceDate;

  const docNo = await nextDocNo(tx, 'PINV', new Date(invoiceDate));
  const [invoice] = await tx
    .insert(invoices)
    .values({
      docNo, kind: 'purchase', status: 'draft', partnerId: partner.id, purchaseOrderId: receipt.purchaseOrderId ?? null,
      receiptId: receipt.id, supplierInvoiceNo: opts.supplierInvoiceNo ?? receipt.supplierDeliveryNo ?? null,
      invoiceDate, dueDate, currency: 'TRY', exchangeRate: toDbRate(1), subtotal: toDb(subtotal), discountTotal: toDb(ZERO),
      vatTotal: toDb(vatTotal), grandTotal: toDb(grandTotal), grandTotalTry: toDb(grandTotal), residual: toDb(grandTotal),
      isExport: false, origin: 'chain', createdBy: ctx.userId ?? null,
    })
    .returning();

  const insertedLines: Array<typeof invoiceLines.$inferSelect> = [];
  let seq = 10;
  for (const l of built) {
    const [row] = await tx
      .insert(invoiceLines)
      .values({
        invoiceId: invoice!.id, productId: l.productId, description: l.description, qty: toDb(l.qty), uomId: l.uomId,
        unitPrice: toDb(l.unitPrice), discountPct: toDb(ZERO), vatRate: toDb(l.vatRate), lineSubtotal: toDb(l.lineSubtotal),
        lineVat: toDb(l.lineVat), lineTotal: toDb(l.lineTotal), purchaseOrderLineId: l.purchaseOrderLineId,
        receiptLineId: l.receiptLineId, accountCode: '320.999', sequence: seq,
      })
      .returning();
    insertedLines.push(row!);
    seq += 10;
  }

  // Yevmiye: 320.999 (borç, stok tutarı) + 191 (borç, KDV) | 320.cari (alacak, brüt) — ARCHITECTURE §6.7/§7
  const lines: JournalLineInput[] = [
    { accountCode: '320.999', debit: subtotal, description: `Alış faturası ${docNo}` },
  ];
  if (!vatTotal.isZero()) lines.push({ accountCode: '191', debit: vatTotal, description: `Alış faturası ${docNo} KDV` });
  lines.push({ accountCode: '320', credit: grandTotal, partnerId: partner.id, description: `Alış faturası ${docNo}`, dueDate });

  const { vukId } = await postJournalEntry(tx, {
    ledger: 'both', journalCode: 'ALS', entryDate: new Date(invoiceDate), description: `Alış faturası ${docNo}: ${partner.name}`,
    refType: 'invoice', refId: invoice!.id, refNo: docNo, partnerId: partner.id, currency: 'TRY', exchangeRate: D(1), lines, origin: 'chain',
  }, ctx);

  const postedAt = new Date();
  const [posted] = await tx
    .update(invoices)
    .set({ status: 'posted', postedAt, postedBy: ctx.userId ?? null, journalEntryId: vukId ?? null, updatedBy: ctx.userId ?? null })
    .where(eq(invoices.id, invoice!.id))
    .returning();

  for (let i = 0; i < built.length; i++) {
    const l = built[i]!;
    const invLine = insertedLines[i]!;
    if (l.purchaseOrderLineId) {
      await tx
        .update(purchaseOrderLines)
        .set({ invoicedQty: sql`${purchaseOrderLines.invoicedQty} + ${toDb(l.qty)}::numeric` })
        .where(eq(purchaseOrderLines.id, l.purchaseOrderLineId));
    }
    await linkDocuments(tx, {
      sourceType: 'receipt', sourceId: receipt.id, sourceLineId: l.receiptLineId,
      targetType: 'invoice', targetId: invoice!.id, targetLineId: invLine.id, qty: l.qty, amount: l.lineTotal,
    }, ctx);
  }
  await linkDocuments(tx, { sourceType: 'receipt', sourceId: receipt.id, targetType: 'invoice', targetId: invoice!.id }, ctx);
  if (receipt.purchaseOrderId) {
    await linkDocuments(tx, { sourceType: 'purchase_order', sourceId: receipt.purchaseOrderId, targetType: 'invoice', targetId: invoice!.id }, ctx);

    const poLines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.orderId, receipt.purchaseOrderId));
    const allInvoiced = poLines.length > 0 && poLines.every((l) => D(l.invoicedQty).gte(D(l.qty)));
    if (allInvoiced && po && !['closed', 'cancelled', 'rejected'].includes(po.status)) {
      await tx.update(purchaseOrders).set({ status: 'invoiced' }).where(eq(purchaseOrders.id, receipt.purchaseOrderId));
    }
  }

  await indexDocument(tx, {
    type: 'invoice', recordId: invoice!.id, docNo, partnerId: partner.id, status: 'posted', origin: 'chain',
    title: `Alış Faturası ${docNo}`, amount: grandTotal, docDate: new Date(invoiceDate),
  });

  const finalLines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice!.id)).orderBy(invoiceLines.sequence);
  return { invoice: posted!, lines: finalLines };
}
