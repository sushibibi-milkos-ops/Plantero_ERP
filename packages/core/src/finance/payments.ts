import { and, eq, inArray, sql } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import {
  payments, paymentAllocations, invoices, partners, bankAccounts, bankTransactions, type DbOrTx,
} from '@plantero/db';
import { D, toDb, toDbRate, round4, isZero4, ZERO } from '../money.js';
import { businessDate } from '../dates.js';
import { nextDocNo } from '../sequences.js';
import { linkDocuments, indexDocument } from '../documents/chain.js';
import { postJournalEntry, reverseJournalEntry, type JournalLineInput } from '../accounting/journal.js';
import { getExchangeRate } from '../sales/pricing.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import type { ActorCtx, DocumentOrigin } from '../types.js';

/**
 * Tahsilat / ödeme — `docs/modules/finans.md` (tur 8 P0 düzeltmesi). `payments`/`payment_allocations`
 * tablolarına yazan TEK servis. Muhasebe yalnızca `postJournalEntry` üzerinden atılır (ARCHITECTURE §7):
 *
 *   Tahsilat: 102.banka / 100 kasa (borç) | 120.cari (alacak)
 *   Ödeme:    320.cari (borç)             | 102.banka / 100 kasa (alacak)
 *
 * Kur farkı (dövizli fatura + farklı kurdan tahsilat/ödeme — ayrı bir "KUR" fişi, `payments.fxJournalEntryId`):
 * her tahsis edilen faturanın KENDİ kuruyla (invoice.exchangeRate) kapanması gereken TL tutarı (`Σ alloc.amountTry`)
 * ile ana fişin fiilen bankaya/kasaya giren-çıkan TL tutarı (`amount × payment.exchangeRate`) arasındaki
 * fark 646 (Kambiyo Kârı) / 656 (Kambiyo Zararı) ile kapatılır — bkz. aşağıdaki `postFxDifference`.
 * Tahsis edilmemiş (on-account) kısım için kur farkı hesaplanmaz (henüz hangi faturanın kuruna göre
 * kapanacağı belli değil); ana fiş zaten tüm tutarı (tahsis edilen + edilmeyen) 120/320'e işler.
 */

export type PaymentAllocationInput = { invoiceId: string; amount: Decimal };

export type RecordPaymentInput = {
  direction: 'inbound' | 'outbound';
  method?: (typeof payments.$inferInsert)['method'];
  partnerId: string;
  bankAccountId?: string | null;
  bankTransactionId?: string | null;
  paymentDate: string | Date;
  currency?: string;
  amount: Decimal;
  allocations?: PaymentAllocationInput[];
  reference?: string | null;
  note?: string | null;
  origin?: DocumentOrigin;
};

export type RecordPaymentResult = {
  payment: typeof payments.$inferSelect;
  allocations: Array<typeof paymentAllocations.$inferSelect>;
};

const KIND_BY_DIRECTION: Record<'inbound' | 'outbound', readonly string[]> = {
  inbound: ['sales', 'sales_return'],
  outbound: ['purchase', 'purchase_return'],
};

/** Yön → cari ana hesap kökü (120 alacak, 320 tedarikçi) */
const accountRootFor = (direction: 'inbound' | 'outbound') => (direction === 'inbound' ? '120' : '320');

/** Nakit/banka hesabı: yöntem 'cash' → 100 Kasa; aksi halde banka hesabının 102.xx kodu (verilmezse genel 102) */
async function resolveCashAccount(tx: DbOrTx, method: string, bankAccountId?: string | null): Promise<{ code: string; journalCode: 'KAS' | 'BNK' }> {
  if (method === 'cash') return { code: '100', journalCode: 'KAS' };
  if (bankAccountId) {
    const [row] = await tx.select({ accountCode: bankAccounts.accountCode }).from(bankAccounts).where(eq(bankAccounts.id, bankAccountId)).limit(1);
    if (!row) throw new NotFoundError('Banka hesabı', bankAccountId);
    return { code: row.accountCode, journalCode: 'BNK' };
  }
  return { code: '102', journalCode: 'BNK' };
}

/**
 * TEK tahsilat/ödeme yazma noktası. Fatura(lar)a tahsis eder (`payment_allocations`), 102/100 ↔ 120/320
 * fişini `postJournalEntry` ile atar, dövizli tahsis varsa ayrı bir kur farkı fişi atar, fatura
 * `paidAmount/residual/status` alanlarını günceller, `document_links` (payment → invoice) kurar.
 * `bankTransactionId` verilmişse (mutabakat akışı) ilgili banka hareketini `matched` işaretler.
 */
export async function recordPayment(tx: DbOrTx, input: RecordPaymentInput, ctx: ActorCtx): Promise<RecordPaymentResult> {
  const amount = round4(input.amount);
  if (amount.lte(0)) throw new ValidationError('Tahsilat/ödeme tutarı sıfırdan büyük olmalı');
  const currency = input.currency ?? 'TRY';
  const method = input.method ?? 'bank_transfer';
  const paymentDate = businessDate(input.paymentDate);

  const [partner] = await tx.select().from(partners).where(eq(partners.id, input.partnerId)).limit(1);
  if (!partner) throw new NotFoundError('Cari', input.partnerId);
  const allowedKinds = input.direction === 'inbound' ? ['customer', 'both'] : ['supplier', 'both'];
  if (!allowedKinds.includes(partner.kind)) {
    throw new ValidationError(`${partner.name} ${input.direction === 'inbound' ? 'müşteri' : 'tedarikçi'} değil; ${input.direction === 'inbound' ? 'tahsilat' : 'ödeme'} kaydedilemez`, { partnerId: partner.id });
  }

  const exchangeRate = await getExchangeRate(tx, currency, paymentDate);
  if (exchangeRate === null) throw new ValidationError(`${currency} için ${paymentDate} tarihli TCMB kuru bulunamadı`, { currency, date: paymentDate });
  const amountTry = round4(amount.mul(exchangeRate));

  // Tahsis edilecek faturalar — doğrula ve tahsis tutarlarının TL karşılığını (kendi fatura kuruyla) hesapla
  const allocInputs = input.allocations ?? [];
  let allocatedNative = ZERO;
  let allocatedBookTry = ZERO;
  type BuiltAlloc = { invoice: typeof invoices.$inferSelect; amount: Decimal; amountTry: Decimal };
  const built: BuiltAlloc[] = [];
  for (const a of allocInputs) {
    const allocAmount = round4(a.amount);
    if (allocAmount.lte(0)) continue;
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, a.invoiceId)).limit(1);
    if (!invoice) throw new NotFoundError('Fatura', a.invoiceId);
    if (invoice.partnerId !== partner.id) throw new ValidationError(`Fatura ${invoice.docNo} bu cariye ait değil`, { invoiceId: invoice.id });
    if (!KIND_BY_DIRECTION[input.direction].includes(invoice.kind)) {
      throw new ValidationError(`Fatura ${invoice.docNo} (${invoice.kind}) bu yönde (${input.direction}) tahsis edilemez`, { invoiceId: invoice.id });
    }
    if (invoice.status === 'cancelled' || invoice.status === 'draft') {
      throw new DomainError('INVOICE_NOT_POSTED', `Fatura ${invoice.docNo} kayıtlı değil (durum: ${invoice.status}); tahsis edilemez`, { invoiceId: invoice.id });
    }
    if (invoice.currency !== currency) {
      throw new ValidationError(`Fatura ${invoice.docNo} para birimi (${invoice.currency}) tahsilat para birimiyle (${currency}) uyuşmuyor`, { invoiceId: invoice.id });
    }
    const residual = D(invoice.residual);
    if (allocAmount.gt(residual.plus('0.0001'))) {
      throw new ValidationError(`Fatura ${invoice.docNo} kalan tutarı (${toDb(residual)}) tahsis edilen tutardan (${toDb(allocAmount)}) küçük`, { invoiceId: invoice.id });
    }
    const allocAmountTry = round4(allocAmount.mul(D(invoice.exchangeRate)));
    built.push({ invoice, amount: allocAmount, amountTry: allocAmountTry });
    allocatedNative = allocatedNative.plus(allocAmount);
    allocatedBookTry = allocatedBookTry.plus(allocAmountTry);
  }
  if (allocatedNative.gt(amount.plus('0.0001'))) {
    throw new ValidationError('Tahsis edilen toplam tutar, tahsilat/ödeme tutarını aşamaz');
  }
  const unallocated = round4(amount.minus(allocatedNative));

  const { code: cashAccount, journalCode } = await resolveCashAccount(tx, method, input.bankAccountId ?? null);
  const accountRoot = accountRootFor(input.direction);
  const docNo = await nextDocNo(tx, 'PAY', new Date(paymentDate));
  const kind = input.direction === 'inbound' ? 'Tahsilat' : 'Ödeme';

  const [payment] = await tx
    .insert(payments)
    .values({
      docNo, direction: input.direction, method, status: 'posted', partnerId: partner.id,
      bankAccountId: input.bankAccountId ?? null, bankTransactionId: input.bankTransactionId ?? null,
      paymentDate, currency, exchangeRate: toDbRate(exchangeRate), amount: toDb(amount), amountTry: toDb(amountTry),
      allocatedAmount: toDb(allocatedNative), unallocatedAmount: toDb(unallocated),
      reference: input.reference ?? null, origin: input.origin ?? 'manual', note: input.note ?? null,
      createdBy: ctx.userId ?? null,
    })
    .returning();
  const p = payment!;

  // Ana fiş: tahsilat → DR nakit/banka, CR cari | ödeme → DR cari, CR nakit/banka (ARCHITECTURE §7)
  const mainLines: JournalLineInput[] =
    input.direction === 'inbound'
      ? [
          { accountCode: cashAccount, debit: amountTry, description: `${kind} ${docNo}: ${partner.name}` },
          { accountCode: accountRoot, credit: amountTry, partnerId: partner.id, description: `${kind} ${docNo}` },
        ]
      : [
          { accountCode: accountRoot, debit: amountTry, partnerId: partner.id, description: `${kind} ${docNo}` },
          { accountCode: cashAccount, credit: amountTry, description: `${kind} ${docNo}: ${partner.name}` },
        ];
  const { vukId } = await postJournalEntry(tx, {
    ledger: 'both', journalCode, entryDate: new Date(paymentDate), description: `${kind} ${docNo}: ${partner.name}`,
    refType: 'payment', refId: p.id, refNo: docNo, partnerId: partner.id, currency, exchangeRate, lines: mainLines,
    origin: input.origin ?? 'manual',
  }, ctx);
  await tx.update(payments).set({ journalEntryId: vukId ?? null }).where(eq(payments.id, p.id));

  // Kur farkı: yalnızca tahsis edilen (fatura kuru belli) kısım için — Σ alloc.amountTry (kapanması gereken
  // TL) ile ana fişin cari hesaba dokunduğu TL (amountTry_total, tahsis+tahsissiz TÜMÜ) arasındaki fark.
  // Tahsissiz kısım henüz hiçbir faturanın kuruna bağlı olmadığından ana fişteki payı zaten doğru kalır;
  // yalnızca tahsis edilen faturaların kapanış tutarını (amountTry_total içindeki payını) düzeltmek gerekir.
  let fxDifference = ZERO;
  let fxJournalEntryId: string | null = null;
  if (built.length > 0) {
    const amountTryAllocatedPortion = round4(allocatedNative.mul(exchangeRate));
    fxDifference = round4(amountTryAllocatedPortion.minus(allocatedBookTry));
    if (!isZero4(fxDifference)) {
      // signedGain > 0 ⇒ lehte (kâr); < 0 ⇒ aleyhte (zarar). Tahsilatta payment.rate>invoice.rate lehte;
      // ödemede payment.rate>invoice.rate aleyhte (daha çok TL ödendi) — bkz. dosya başı yorum.
      const signedGain = input.direction === 'inbound' ? fxDifference : fxDifference.neg();
      const abs = signedGain.abs();
      const fxLines: JournalLineInput[] = signedGain.gt(0)
        ? [
            { accountCode: accountRoot, debit: abs, partnerId: partner.id, description: `Kur farkı (lehte): ${docNo}` },
            { accountCode: '646', credit: abs, description: `Kur farkı (lehte): ${docNo} — ${partner.name}` },
          ]
        : [
            { accountCode: '656', debit: abs, description: `Kur farkı (aleyhte): ${docNo} — ${partner.name}` },
            { accountCode: accountRoot, credit: abs, partnerId: partner.id, description: `Kur farkı (aleyhte): ${docNo}` },
          ];
      const fxResult = await postJournalEntry(tx, {
        ledger: 'both', journalCode: 'KUR', entryDate: new Date(paymentDate), description: `Kur farkı ${docNo}: ${partner.name}`,
        refType: 'payment', refId: p.id, refNo: docNo, partnerId: partner.id, currency, exchangeRate, lines: fxLines, origin: 'system',
      }, ctx);
      fxJournalEntryId = fxResult.vukId ?? null;
      await tx.update(payments).set({ fxJournalEntryId, fxDifference: toDb(fxDifference) }).where(eq(payments.id, p.id));
    }
  }

  // Tahsisler + fatura güncelleme + belge zinciri
  const insertedAllocs: Array<typeof paymentAllocations.$inferSelect> = [];
  for (const b of built) {
    const [row] = await tx
      .insert(paymentAllocations)
      .values({ paymentId: p.id, invoiceId: b.invoice.id, amount: toDb(b.amount), amountTry: toDb(b.amountTry) })
      .returning();
    insertedAllocs.push(row!);

    const newPaid = round4(D(b.invoice.paidAmount).plus(b.amount));
    const newResidual = round4(D(b.invoice.grandTotal).minus(newPaid));
    const status = newResidual.lte('0.0001') ? 'paid' : newPaid.gt(0) ? 'partially_paid' : b.invoice.status;
    await tx.update(invoices).set({ paidAmount: toDb(newPaid), residual: toDb(newResidual.lt(0) ? ZERO : newResidual), status, updatedBy: ctx.userId ?? null }).where(eq(invoices.id, b.invoice.id));

    await linkDocuments(tx, { sourceType: 'payment', sourceId: p.id, targetType: 'invoice', targetId: b.invoice.id, amount: b.amount }, ctx);
  }

  await indexDocument(tx, {
    type: 'payment', recordId: p.id, docNo, partnerId: partner.id, status: 'posted', origin: input.origin ?? 'manual',
    title: `${kind} ${docNo}`, amount: amount, docDate: new Date(paymentDate),
  });

  if (input.bankTransactionId) {
    await tx
      .update(bankTransactions)
      .set({ status: 'matched', matchedPartnerId: partner.id, matchedPaymentId: p.id, journalEntryId: vukId ?? null, matchedAt: new Date(), matchedBy: ctx.userId ?? null })
      .where(eq(bankTransactions.id, input.bankTransactionId));
    // Belge zinciri (I7): mutabakattan doğan tahsilat/ödemenin kaynağı banka hareketidir.
    await linkDocuments(tx, { sourceType: 'bank_transaction', sourceId: input.bankTransactionId, targetType: 'payment', targetId: p.id }, ctx);
  }

  const [finalPayment] = await tx.select().from(payments).where(eq(payments.id, p.id)).limit(1);
  return { payment: finalPayment!, allocations: insertedAllocs };
}

/**
 * Tahsilat/ödemeyi geri alır: ana + kur farkı fişini ters kayıtla iptal eder, tahsisleri siler
 * (I10 `payment_allocations` durumdan bağımsız toplanır — kayıt kalırsa fatura ile tutarsız kalır),
 * fatura `paidAmount/residual/status`'unu geri alır, banka hareketi eşleşmesini kaldırır.
 */
export async function unapplyPayment(tx: DbOrTx, paymentId: string, ctx: ActorCtx): Promise<{ payment: typeof payments.$inferSelect }> {
  const [p] = await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!p) throw new NotFoundError('Tahsilat/Ödeme', paymentId);
  if (p.status !== 'posted') throw new DomainError('PAYMENT_NOT_POSTED', `${p.docNo} durumu ${p.status}; geri alınamaz`);

  const allocs = await tx.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, paymentId));
  for (const a of allocs) {
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, a.invoiceId)).limit(1);
    if (!invoice) continue;
    const newPaid = round4(D(invoice.paidAmount).minus(D(a.amount)));
    const newResidual = round4(D(invoice.grandTotal).minus(newPaid));
    const status = newPaid.lte('0.0001') ? 'posted' : 'partially_paid';
    await tx.update(invoices).set({ paidAmount: toDb(newPaid.lt(0) ? ZERO : newPaid), residual: toDb(newResidual), status, updatedBy: ctx.userId ?? null }).where(eq(invoices.id, invoice.id));
  }
  await tx.delete(paymentAllocations).where(eq(paymentAllocations.paymentId, paymentId));

  if (p.journalEntryId) await reverseJournalEntry(tx, p.journalEntryId, ctx, { description: `${p.docNo} geri alındı` });
  if (p.fxJournalEntryId) await reverseJournalEntry(tx, p.fxJournalEntryId, ctx, { description: `${p.docNo} kur farkı geri alındı` });

  if (p.bankTransactionId) {
    await tx.update(bankTransactions).set({ status: 'unmatched', matchedPartnerId: null, matchedPaymentId: null, journalEntryId: null, matchedAt: null, matchedBy: null }).where(eq(bankTransactions.id, p.bankTransactionId));
  }

  const [updated] = await tx.update(payments).set({ status: 'cancelled', allocatedAmount: toDb(ZERO), unallocatedAmount: toDb(ZERO), updatedBy: ctx.userId ?? null }).where(eq(payments.id, paymentId)).returning();
  await indexDocument(tx, { type: 'payment', recordId: paymentId, docNo: p.docNo, partnerId: p.partnerId, status: 'cancelled', origin: p.origin, title: `Tahsilat/Ödeme ${p.docNo} (iptal)`, amount: D(p.amount), docDate: new Date(p.paymentDate) });
  return { payment: updated! };
}

/** Cari için açık (kalan tutarlı) faturalar — otomatik "en eski önce" tahsis önerisi için sıralı. */
export async function getOpenInvoicesForPartner(tx: DbOrTx, partnerId: string, direction: 'inbound' | 'outbound'): Promise<Array<typeof invoices.$inferSelect>> {
  const kinds = KIND_BY_DIRECTION[direction];
  return tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.partnerId, partnerId), inArray(invoices.kind, kinds as ('sales' | 'sales_return' | 'purchase' | 'purchase_return')[]), inArray(invoices.status, ['posted', 'partially_paid']), sql`${invoices.residual} > 0`))
    .orderBy(invoices.dueDate);
}
