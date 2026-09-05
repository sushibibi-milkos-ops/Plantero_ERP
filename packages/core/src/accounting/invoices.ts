import { and, eq, inArray, sql } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import {
  invoices, invoiceLines, partners, purchaseOrderLines, salesOrderLines, documentLinks, stockMoves, type DbOrTx,
} from '@plantero/db';
import { D, toDb, toDbRate, round4, sum, pct, ZERO, isZero4 } from '../money.js';
import { businessDate, addDays } from '../dates.js';
import { nextDocNo } from '../sequences.js';
import { linkDocuments, indexDocument } from '../documents/chain.js';
import { postJournalEntry, reverseJournalEntry, type JournalLineInput } from '../accounting/journal.js';
import { postStockMove } from '../stock/ledger.js';
import { getSuppliersLocation } from '../stock/locations.js';
import { writeAudit } from '../audit/index.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import type { ActorCtx } from '../types.js';

/**
 * `docs/modules/muhasebe.md` — fatura yaşam döngüsünün, satış (`sales/invoicing.ts`) ve mal-kabul-tabanlı
 * alış (`purchasing/invoicing.ts createPurchaseInvoiceFromReceipt`) DIŞINDA kalan üç parçası:
 *
 *  - `createExpensePurchaseInvoice`: kaynak PO/mal kabulü OLMAYAN gider faturası (kira, elektrik,
 *    muhasebe ücreti…) — `origin='manual'` (CLAUDE.md kural 5: kaynak referanssız belge yalnızca
 *    manuel olabilir). Stok hesabı yerine doğrudan gider hesabına (7XX) + 191 (KDV) borç, 320.cari alacak.
 *  - `createCreditNote`: var olan bir faturayı (satış ya da alış) `document_links` ile kaynağına bağlı
 *    bir iade faturasıyla (aynı `invoices` tablosu, `kind` sales_return/purchase_return) tersine çevirir.
 *    Satışta ARCHITECTURE §7 satırı birebir uygulanır (610 + 391 borç / 120.cari alacak); alışta orijinal
 *    faturanın kendi hesap satırları (320.999 ya da gider hesabı) tersine çevrilir.
 *  - `cancelInvoice`: hiç tahsil/ödenmemiş bir faturayı ters kayıtla iptal eder (yalnızca muhasebe —
 *    `postStockMove`/teslim zincirine dokunmaz; stoklu faturalarda kaynağı zaten `receipt`/`delivery`dir,
 *    onların iptali depo modülünün sorumluluğundadır).
 *  - `getAging(...)`: 0-30/31-60/61-90/90+ yaşlandırma — kokpit/cari ekstre/KDV ekranı ortak kullanır.
 *
 * `createPurchaseInvoiceFromReceipt`/`createInvoiceFromDelivery`/`createInvoiceFromOrder` burada
 * YENİDEN YAZILMAZ — mevcut halleriyle `@plantero/core`'dan doğrudan kullanılır (satın-alma/satış
 * modüllerinin sözleşmesi).
 */

/* ------------------------------------------------------------------ */
/* Gider faturası (manuel — PO/mal kabul yok)                          */
/* ------------------------------------------------------------------ */

export type ExpenseInvoiceLineInput = {
  description: string;
  /** Gider hesabı (7XX) — ekranda kullanıcı seçer */
  accountCode: string;
  amount: Decimal;
  vatRate?: Decimal | null;
};

export type CreateExpenseInvoiceInput = {
  partnerId: string;
  supplierInvoiceNo?: string | null;
  invoiceDate?: string | Date;
  dueDate?: string | Date;
  lines: ExpenseInvoiceLineInput[];
  note?: string | null;
};

export type AccountingInvoiceResult = { invoice: typeof invoices.$inferSelect; lines: Array<typeof invoiceLines.$inferSelect> };

/**
 * Kaynak belgesiz (PO/mal kabul yok) alış/gider faturası — kira, elektrik, muhasebe ücreti vb.
 * `origin='manual'`. Yevmiye: Σ gider hesabı (borç) + 191 (borç) | 320.cari (alacak, brüt).
 */
export async function createExpensePurchaseInvoice(tx: DbOrTx, input: CreateExpenseInvoiceInput, ctx: ActorCtx): Promise<AccountingInvoiceResult> {
  if (!input.lines.length) throw new ValidationError('Faturada en az bir satır olmalı');
  const [partner] = await tx.select().from(partners).where(eq(partners.id, input.partnerId)).limit(1);
  if (!partner) throw new NotFoundError('Cari', input.partnerId);
  if (!['supplier', 'both'].includes(partner.kind)) throw new ValidationError(`${partner.name} tedarikçi değil; gider faturası girilemez`, { partnerId: partner.id });

  const built = input.lines.map((l) => {
    const amount = round4(l.amount);
    if (amount.lte(0)) throw new ValidationError('Satır tutarı sıfırdan büyük olmalı', { description: l.description });
    if (!l.accountCode) throw new ValidationError('Gider satırı için hesap kodu seçilmeli', { description: l.description });
    const vatRate = D(l.vatRate ?? '20');
    const lineVat = round4(pct(amount, vatRate));
    return { description: l.description, accountCode: l.accountCode, lineSubtotal: amount, vatRate, lineVat, lineTotal: round4(amount.plus(lineVat)) };
  });

  const subtotal = round4(sum(built.map((l) => l.lineSubtotal)));
  const vatTotal = round4(sum(built.map((l) => l.lineVat)));
  const grandTotal = round4(sum(built.map((l) => l.lineTotal)));

  const invoiceDate = businessDate(input.invoiceDate ?? new Date());
  const dueDate = input.dueDate ? businessDate(input.dueDate) : partner.paymentTermDays > 0 ? addDays(invoiceDate, partner.paymentTermDays) : invoiceDate;

  const docNo = await nextDocNo(tx, 'PINV', new Date(invoiceDate));
  const [invoice] = await tx
    .insert(invoices)
    .values({
      docNo, kind: 'purchase', status: 'draft', partnerId: partner.id, supplierInvoiceNo: input.supplierInvoiceNo ?? null,
      invoiceDate, dueDate, currency: 'TRY', exchangeRate: toDbRate(1), subtotal: toDb(subtotal), discountTotal: toDb(ZERO),
      vatTotal: toDb(vatTotal), grandTotal: toDb(grandTotal), grandTotalTry: toDb(grandTotal), residual: toDb(grandTotal),
      isExport: false, origin: 'manual', note: input.note ?? null, createdBy: ctx.userId ?? null,
    })
    .returning();

  let seq = 10;
  for (const l of built) {
    await tx.insert(invoiceLines).values({
      invoiceId: invoice!.id, productId: null, description: l.description, qty: toDb(1), unitPrice: toDb(l.lineSubtotal),
      discountPct: toDb(ZERO), vatRate: toDb(l.vatRate), lineSubtotal: toDb(l.lineSubtotal), lineVat: toDb(l.lineVat),
      lineTotal: toDb(l.lineTotal), accountCode: l.accountCode, sequence: seq,
    });
    seq += 10;
  }

  // Gider hesabına göre grupla (aynı hesaba yazılan birden çok satır tek yevmiye kalemine toplanır)
  const byAccount = new Map<string, Decimal>();
  for (const l of built) byAccount.set(l.accountCode, (byAccount.get(l.accountCode) ?? ZERO).plus(l.lineSubtotal));
  const lines: JournalLineInput[] = Array.from(byAccount.entries()).map(([accountCode, amount]) => ({ accountCode, debit: amount, description: `Gider faturası ${docNo}` }));
  if (!vatTotal.isZero()) lines.push({ accountCode: '191', debit: vatTotal, description: `Gider faturası ${docNo} KDV` });
  lines.push({ accountCode: '320', credit: grandTotal, partnerId: partner.id, description: `Gider faturası ${docNo}: ${partner.name}`, dueDate });

  const { vukId } = await postJournalEntry(tx, {
    ledger: 'both', journalCode: 'ALS', entryDate: new Date(invoiceDate), description: `Gider faturası ${docNo}: ${partner.name}`,
    refType: 'invoice', refId: invoice!.id, refNo: docNo, partnerId: partner.id, currency: 'TRY', exchangeRate: D(1), lines, origin: 'manual',
  }, ctx);

  const [posted] = await tx
    .update(invoices)
    .set({ status: 'posted', postedAt: new Date(), postedBy: ctx.userId ?? null, journalEntryId: vukId ?? null, updatedBy: ctx.userId ?? null })
    .where(eq(invoices.id, invoice!.id))
    .returning();

  await indexDocument(tx, { type: 'invoice', recordId: invoice!.id, docNo, partnerId: partner.id, status: 'posted', origin: 'manual', title: `Gider Faturası ${docNo}`, amount: grandTotal, docDate: new Date(invoiceDate) });

  const finalLines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice!.id)).orderBy(invoiceLines.sequence);
  return { invoice: posted!, lines: finalLines };
}

/* ------------------------------------------------------------------ */
/* İade faturası (credit note)                                         */
/* ------------------------------------------------------------------ */

export type CreateCreditNoteInput = {
  invoiceId: string;
  reason: string;
  invoiceDate?: string | Date;
};

/**
 * Kaynak faturayı (satış ya da alış — iade değil) tam tutarıyla tersine çeviren yeni bir belge
 * (`kind: sales_return | purchase_return`) oluşturur, `document_links` ile kaynağına bağlar.
 * Satışta ARCHITECTURE §7 ("Satış iade: 610 + 391 borç / 120.cari alacak") birebir uygulanır.
 *
 * Alışta (P0 kök neden düzeltmesi — Tur 7, docs/INVARIANTS.md I25): kaynak faturanın satırları
 * mal-kabul-tabanlı (`accountCode==='320.999'`, GRNI ara hesabı — `purchasing/invoicing.ts
 * createPurchaseInvoiceFromReceipt`'ten gelir) olduğunda, 320.999'u yalnızca MANUEL bir muhasebe
 * satırıyla tekrar alacaklandırmak (eski davranış) hiçbir karşılığı olmayan kalıcı bir GRNI bakiyesi
 * açıyordu — CLAUDE.md kural 3 ("her stok hareketi yalnızca postStockMove") de ihlal ediliyordu,
 * çünkü hiçbir fiziksel stok değişikliği hiç üretilmiyordu. Artık her böyle satır için TEK stok
 * yazma noktasından (`postStockMove(kind:'return_out')`) gerçek bir tedarikçiye-iade hareketi
 * üretilir — bu hareketin KENDİ fişi 320.999'u ürünün GÜNCEL (lot/ortalama) maliyetiyle borçlandırıp
 * envanteri alacaklandırır; buradaki manuel satır 320.999'u TAM olarak bu gerçek dönüş değeriyle
 * netler (orijinal fatura tutarı değil) — iki kayıt birlikte 320.999'u her zaman net sıfırda tutar
 * (I25). Aradaki fark (mal kabulden bu yana lot/ortalama maliyeti değiştiyse) 659/679'a atılır —
 * `stock/ledger.ts`'teki yuvarlama düzeltme kalıbıyla aynı mantık. İade edilecek miktar o mal kabul
 * satırının ürettiği TÜM `stock_moves` (tam/kısmi red ayrımı dahil) üzerinden, o hareketlerin KENDİ
 * lot/lokasyon bilgisiyle geri sarılır — hâlâ elde yeterli fiziksel stok yoksa (bir kısmı zaten
 * tüketilmiş/sevk edilmişse) `postStockMove` `INSUFFICIENT_STOCK` ile reddeder (bilinçli: kısmi
 * iade bu servisin kapsamında değil, tam iade fiziksel karşılığı olmadan asla kabul edilmez).
 * Gider faturası kaynaklı (7XX hesap) satırlarda stok/lot yok; eski davranış (hesabı aynen tersine
 * çevir) değişmeden korunur. Satış tarafının fiziksel iadesi (`return_in`) bu servisin kapsamı
 * DIŞINDADIR — bilinen sınır, rapora ayrıca not edilir.
 */
export async function createCreditNote(tx: DbOrTx, input: CreateCreditNoteInput, ctx: ActorCtx): Promise<AccountingInvoiceResult> {
  const [source] = await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
  if (!source) throw new NotFoundError('Fatura', input.invoiceId);
  if (!['posted', 'partially_paid', 'paid'].includes(source.status)) {
    throw new DomainError('INVOICE_NOT_POSTED', `${source.docNo} kayıtlı değil (durum: ${source.status}); iade faturası kesilemez`, { invoiceId: source.id });
  }
  if (source.kind === 'sales_return' || source.kind === 'purchase_return') {
    throw new DomainError('INVOICE_ALREADY_CREDIT_NOTE', `${source.docNo} zaten bir iade faturası`, { invoiceId: source.id });
  }

  const already = await tx
    .select({ id: documentLinks.id })
    .from(documentLinks)
    .where(and(eq(documentLinks.sourceType, 'invoice'), eq(documentLinks.sourceId, source.id), eq(documentLinks.targetType, 'invoice')))
    .limit(1);
  if (already.length) throw new DomainError('INVOICE_ALREADY_CREDITED', `${source.docNo} için zaten bir iade faturası kesilmiş`, { invoiceId: source.id });

  if (!source.journalEntryId) throw new ValidationError(`${source.docNo} yevmiye fişi yok; iade faturası kesilemez`, { invoiceId: source.id });
  const [partner] = await tx.select().from(partners).where(eq(partners.id, source.partnerId)).limit(1);
  if (!partner) throw new NotFoundError('Cari', source.partnerId);

  const srcLines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, source.id)).orderBy(invoiceLines.sequence);
  if (!srcLines.length) throw new ValidationError('Kaynak faturada satır yok', { invoiceId: source.id });

  const isSales = source.kind === 'sales';
  const returnKind = isSales ? 'sales_return' : 'purchase_return';
  const invoiceDate = businessDate(input.invoiceDate ?? new Date());
  const docNo = await nextDocNo(tx, isSales ? 'INV' : 'PINV', new Date(invoiceDate));

  const [note] = await tx
    .insert(invoices)
    .values({
      docNo, kind: returnKind, status: 'draft', partnerId: partner.id, channelId: source.channelId, deliveryId: source.deliveryId,
      receiptId: source.receiptId, invoiceDate, dueDate: invoiceDate, currency: source.currency, exchangeRate: source.exchangeRate,
      subtotal: source.subtotal, discountTotal: source.discountTotal, vatTotal: source.vatTotal, grandTotal: source.grandTotal,
      grandTotalTry: source.grandTotalTry, residual: source.grandTotal, isExport: source.isExport, origin: 'chain',
      note: input.reason, createdBy: ctx.userId ?? null,
    })
    .returning();

  let seq = 10;
  /** Kaynak satır id'si → bu iade faturasındaki karşılık gelen yeni satır id'si (stok hareketi refLineId'i için) */
  const noteLineIdBySourceLineId = new Map<string, string>();
  for (const l of srcLines) {
    const [noteLine] = await tx
      .insert(invoiceLines)
      .values({
        invoiceId: note!.id, productId: l.productId, description: l.description, qty: l.qty, uomId: l.uomId, unitPrice: l.unitPrice,
        discountPct: l.discountPct, vatRate: l.vatRate, lineSubtotal: l.lineSubtotal, lineVat: l.lineVat, lineTotal: l.lineTotal,
        accountCode: isSales ? '610' : l.accountCode, sequence: seq,
      })
      .returning();
    noteLineIdBySourceLineId.set(l.id, noteLine!.id);
    seq += 10;
  }

  // Satış iade: 610 + 391 (borç) / 120.cari (alacak). Alış iade: 320.cari (borç) / kaynağın kendi
  // hesabı — 320.999 ya da gider hesabı (alacak) — orijinal kaydın tam simetriği.
  const lines: JournalLineInput[] = [];
  if (isSales) {
    if (!D(source.subtotal).isZero()) lines.push({ accountCode: '610', debit: D(source.subtotal), description: `İade faturası ${docNo}: ${input.reason}` });
    if (!D(source.vatTotal).isZero()) lines.push({ accountCode: '391', debit: D(source.vatTotal), description: `İade faturası ${docNo} KDV` });
    lines.push({ accountCode: '120', credit: D(source.grandTotalTry), partnerId: partner.id, description: `İade faturası ${docNo}: ${partner.name}` });
  } else {
    lines.push({ accountCode: '320', debit: D(source.grandTotal), partnerId: partner.id, description: `İade faturası ${docNo}: ${partner.name}` });

    // GRNI (320.999) satırları: gerçek fiziksel iade (return_out) üret, 320.999'u fatura tutarıyla
    // DEĞİL, dönüşün GERÇEK stok değeriyle netle (bkz. yukarıdaki fonksiyon başı yorumu — P0/I25).
    const grniLines = srcLines.filter((l) => (l.accountCode ?? '320.999') === '320.999');
    const otherLines = srcLines.filter((l) => (l.accountCode ?? '320.999') !== '320.999');
    let grniReturnedValue = ZERO;
    const suppliersLoc = grniLines.length ? await getSuppliersLocation(tx) : null;

    for (const l of grniLines) {
      if (!l.productId || D(l.qty).lte(0)) continue;
      if (!l.receiptLineId) throw new ValidationError(`${docNo}: kaynak satırın mal kabul bağlantısı yok; fiziksel iade işlenemedi`, { invoiceLineId: l.id });
      // Kaynak mal kabul satırının ürettiği TÜM stok hareketleri (tam/kısmi red ayrımı dahil —
      // `receipt_lines.to_location_id/lot_id` yalnızca kabul edilen kısmı denormalize eder, split
      // durumunda yetersiz kalır) — her biri kendi lot/lokasyonundan geri sarılır.
      const originMoves = await tx
        .select()
        .from(stockMoves)
        .where(and(eq(stockMoves.refType, 'receipt'), eq(stockMoves.refLineId, l.receiptLineId), eq(stockMoves.kind, 'receipt')));
      if (!originMoves.length) throw new ValidationError(`${docNo}: mal kabul stok hareketi bulunamadı; fiziksel iade işlenemedi`, { invoiceLineId: l.id });

      for (const om of originMoves) {
        const mv = await postStockMove(tx, {
          kind: 'return_out', productId: l.productId, lotId: om.lotId, fromLocationId: om.toLocationId, toLocationId: suppliersLoc!.id,
          qty: D(om.qty), uomId: om.uomId, refType: 'invoice', refId: note!.id, refLineId: noteLineIdBySourceLineId.get(l.id) ?? l.id, refNo: docNo, partnerId: partner.id,
          movedAt: new Date(invoiceDate), origin: 'chain', note: `İade faturası ${docNo}: ${input.reason}`,
        }, ctx);
        grniReturnedValue = grniReturnedValue.plus(mv.value);
      }
    }
    if (!grniReturnedValue.isZero()) lines.push({ accountCode: '320.999', credit: grniReturnedValue, description: `İade faturası ${docNo}: fiziksel iade (GRNI kapama)` });

    const byAccount = new Map<string, Decimal>();
    for (const l of otherLines) byAccount.set(l.accountCode ?? '320.999', (byAccount.get(l.accountCode ?? '320.999') ?? ZERO).plus(D(l.lineSubtotal)));
    for (const [accountCode, amount] of byAccount) if (!amount.isZero()) lines.push({ accountCode, credit: amount, description: `İade faturası ${docNo}: ${input.reason}` });
    if (!D(source.vatTotal).isZero()) lines.push({ accountCode: '191', credit: D(source.vatTotal), description: `İade faturası ${docNo} KDV` });

    // Maliyet farkı: GRNI satırlarının orijinal fatura tutarı ile dönüşün gerçek (güncel maliyetli)
    // stok değeri arasındaki fark — lot/ortalama maliyeti mal kabulden bu yana değiştiyse oluşur.
    // Fişi dengede tutar (Σborç=Σalacak) ve I25'i tam sıfıra kilitler.
    const grniOriginalSubtotal = round4(sum(grniLines.map((l) => D(l.lineSubtotal))));
    const variance = round4(grniOriginalSubtotal.minus(grniReturnedValue));
    if (!variance.isZero()) {
      lines.push({
        accountCode: variance.gt(0) ? '679' : '659',
        credit: variance.gt(0) ? variance : undefined,
        debit: variance.lt(0) ? variance.abs() : undefined,
        description: `İade faturası ${docNo}: iade edilen stoğun güncel maliyeti ile fatura tutarı farkı`,
      });
    }
  }

  const { vukId } = await postJournalEntry(tx, {
    ledger: 'both', journalCode: isSales ? 'SAT' : 'ALS', entryDate: new Date(invoiceDate), description: `İade faturası ${docNo}: ${partner.name} (${input.reason})`,
    refType: 'invoice', refId: note!.id, refNo: docNo, partnerId: partner.id, currency: source.currency, exchangeRate: D(source.exchangeRate), lines, origin: 'chain',
  }, ctx);

  const [posted] = await tx
    .update(invoices)
    .set({ status: 'posted', postedAt: new Date(), postedBy: ctx.userId ?? null, journalEntryId: vukId ?? null, updatedBy: ctx.userId ?? null })
    .where(eq(invoices.id, note!.id))
    .returning();

  await linkDocuments(tx, { sourceType: 'invoice', sourceId: source.id, targetType: 'invoice', targetId: note!.id, amount: D(source.grandTotal) }, ctx);
  await indexDocument(tx, { type: 'invoice', recordId: note!.id, docNo, partnerId: partner.id, status: 'posted', origin: 'chain', title: `İade Faturası ${docNo}`, amount: D(source.grandTotal), docDate: new Date(invoiceDate) });

  const finalLines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, note!.id)).orderBy(invoiceLines.sequence);
  return { invoice: posted!, lines: finalLines };
}

/* ------------------------------------------------------------------ */
/* Fatura iptali                                                       */
/* ------------------------------------------------------------------ */

/**
 * Hiç tahsil/ödenmemiş bir faturayı ters kayıtla iptal eder. Sipariş/mal-kabul satırlarındaki
 * `invoicedQty`'yi (varsa) geri düşürür — yeniden faturalanabilir kalsın diye.
 */
export async function cancelInvoice(tx: DbOrTx, invoiceId: string, ctx: ActorCtx, opts: { reason?: string } = {}): Promise<{ invoice: typeof invoices.$inferSelect }> {
  const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice) throw new NotFoundError('Fatura', invoiceId);
  if (invoice.status === 'cancelled') throw new DomainError('INVOICE_ALREADY_CANCELLED', `${invoice.docNo} zaten iptal edilmiş`, { invoiceId });
  if (!isZero4(D(invoice.paidAmount))) {
    throw new DomainError('INVOICE_HAS_PAYMENTS', `${invoice.docNo} için tahsilat/ödeme yapılmış (${invoice.paidAmount}); önce tahsilatı geri alın`, { invoiceId, paidAmount: invoice.paidAmount });
  }

  if (invoice.journalEntryId) await reverseJournalEntry(tx, invoice.journalEntryId, ctx, { description: `${invoice.docNo} iptal edildi${opts.reason ? `: ${opts.reason}` : ''}` });

  const lines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
  for (const l of lines) {
    if (l.salesOrderLineId) {
      await tx.update(salesOrderLines).set({ invoicedQty: sql`GREATEST(${salesOrderLines.invoicedQty} - ${l.qty}::numeric, 0)` }).where(eq(salesOrderLines.id, l.salesOrderLineId));
    }
    if (l.purchaseOrderLineId) {
      await tx.update(purchaseOrderLines).set({ invoicedQty: sql`GREATEST(${purchaseOrderLines.invoicedQty} - ${l.qty}::numeric, 0)` }).where(eq(purchaseOrderLines.id, l.purchaseOrderLineId));
    }
  }

  const [updated] = await tx
    .update(invoices)
    .set({ status: 'cancelled', updatedBy: ctx.userId ?? null, note: opts.reason ? `${invoice.note ? `${invoice.note}\n` : ''}İptal: ${opts.reason}` : invoice.note })
    .where(eq(invoices.id, invoiceId))
    .returning();

  await writeAudit(tx, { action: 'cancel', tableName: 'invoices', recordId: invoiceId, summary: `${invoice.docNo} iptal edildi${opts.reason ? `: ${opts.reason}` : ''}`, before: { status: invoice.status }, after: { status: 'cancelled' } }, ctx);
  await indexDocument(tx, { type: 'invoice', recordId: invoiceId, docNo: invoice.docNo, partnerId: invoice.partnerId, status: 'cancelled', origin: invoice.origin, title: `Fatura ${invoice.docNo} (iptal)`, amount: D(invoice.grandTotal), docDate: new Date(invoice.invoiceDate) });

  return { invoice: updated! };
}

/* ------------------------------------------------------------------ */
/* Yaşlandırma (aging)                                                  */
/* ------------------------------------------------------------------ */

export type AgingBucket = { label: string; fromDays: number; toDays: number | null; amount: Decimal };
export type AgingRow = { invoiceId: string; docNo: string; partnerId: string; partnerName: string; dueDate: string; daysOverdue: number; residual: Decimal; currency: string };
export type AgingResult = { asOf: string; buckets: AgingBucket[]; rows: AgingRow[]; total: Decimal };

const BUCKET_DEFS: Array<{ label: string; fromDays: number; toDays: number | null }> = [
  { label: '0-30 gün', fromDays: 0, toDays: 30 },
  { label: '31-60 gün', fromDays: 31, toDays: 60 },
  { label: '61-90 gün', fromDays: 61, toDays: 90 },
  { label: '90+ gün', fromDays: 91, toDays: null },
];

/** Açık (kalanı olan) satış faturalarının vade bazlı yaşlandırması — kokpit/cari ekstre/muhasebe özet ekranı ortak kullanır. */
export async function getAging(tx: DbOrTx, opts: { partnerId?: string; kind?: 'sales' | 'purchase'; asOf?: string | Date } = {}): Promise<AgingResult> {
  const asOf = businessDate(opts.asOf ?? new Date());
  const kind = opts.kind ?? 'sales';
  const conds = [eq(invoices.kind, kind), inArray(invoices.status, ['posted', 'partially_paid']), sql`${invoices.residual} > 0`];
  if (opts.partnerId) conds.push(eq(invoices.partnerId, opts.partnerId));

  const rows = await tx
    .select({ i: invoices, partnerName: partners.name })
    .from(invoices)
    .innerJoin(partners, eq(partners.id, invoices.partnerId))
    .where(and(...conds));

  const asOfMs = new Date(`${asOf}T00:00:00Z`).getTime();
  const dayMs = 86_400_000;
  const aging: AgingRow[] = rows.map((r) => {
    const dueMs = new Date(`${r.i.dueDate}T00:00:00Z`).getTime();
    const daysOverdue = Math.max(0, Math.round((asOfMs - dueMs) / dayMs));
    return { invoiceId: r.i.id, docNo: r.i.docNo, partnerId: r.i.partnerId, partnerName: r.partnerName, dueDate: r.i.dueDate, daysOverdue, residual: D(r.i.residual), currency: r.i.currency };
  });

  const buckets: AgingBucket[] = BUCKET_DEFS.map((b) => ({
    ...b,
    amount: round4(sum(aging.filter((a) => a.daysOverdue >= b.fromDays && (b.toDays === null || a.daysOverdue <= b.toDays)).map((a) => a.residual))),
  }));
  const total = round4(sum(aging.map((a) => a.residual)));
  return { asOf, buckets, rows: aging.sort((a, b) => b.daysOverdue - a.daysOverdue), total };
}
