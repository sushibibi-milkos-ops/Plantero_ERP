'use server';

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db, schema } from '@plantero/db';
import {
  D, recordPayment, unapplyPayment, postJournalEntry, reverseJournalEntry,
  createExpensePurchaseInvoice, createCreditNote, cancelInvoice,
  closePeriod, openPeriod, closeVatPeriod,
  applyEInvoiceResult, getEInvoiceSendContext, resolveEInvoiceKind,
  buildCandidates, persistAndApply, approveReconciliationMatch, rejectReconciliationMatch,
  manualReconciliationMatch, ignoreBankTransaction, listUnmatchedTransactions, importStatement,
  type JournalLineInput,
} from '@plantero/core';
import { matchBankTransaction } from '@plantero/ai';
// Not: '@plantero/integrations' barrel'ı (index.ts) pdf/render.ts üzerinden playwright-core'u da
// re-export eder; bu server action dosyası client referans grafiğine dahil olduğundan barrel yerine
// yalnızca ihtiyaç duyulan alt modülden içe aktarılır (aksi halde webpack build hatası verir —
// bkz. apps/web/src/modules/sales/actions.ts aynı not).
import { bizimhesap } from '@plantero/integrations/einvoice/bizimhesap';
import { parseCsv } from '@plantero/integrations/bank/csv';
import { parseMt940 } from '@plantero/integrations/bank/mt940';
import { requirePermission } from '@/lib/auth';
import { withAudit, type AuditInfo } from '@/lib/actions';
import { listOpenInvoicesForPartner } from './queries';

/* ==================================================================== */
/* Faturalar                                                            */
/* ==================================================================== */

const expenseLineSchema = z.object({ description: z.string().trim().min(1, 'Açıklama girin'), accountCode: z.string().min(1, 'Hesap seçin'), amount: z.string().min(1, 'Tutar girin'), vatRate: z.string().optional() });
const createExpenseInvoiceSchema = z.object({
  partnerId: z.string().uuid('Tedarikçi seçin'),
  supplierInvoiceNo: z.string().trim().optional().nullable(),
  invoiceDate: z.string().min(1, 'Tarih girin'),
  dueDate: z.string().optional().nullable(),
  note: z.string().trim().optional().nullable(),
  lines: z.array(expenseLineSchema).min(1, 'En az bir satır ekleyin'),
});

export const createExpenseInvoiceAction = withAudit('accounting.createExpenseInvoice', async (raw: z.infer<typeof createExpenseInvoiceSchema>) => {
  const user = await requirePermission('accounting.invoice');
  const input = createExpenseInvoiceSchema.parse(raw);
  const { invoice } = await db.transaction((tx) =>
    createExpensePurchaseInvoice(tx, {
      partnerId: input.partnerId, supplierInvoiceNo: input.supplierInvoiceNo || null, invoiceDate: input.invoiceDate,
      dueDate: input.dueDate || undefined, note: input.note || null,
      lines: input.lines.map((l) => ({ description: l.description, accountCode: l.accountCode, amount: D(l.amount), vatRate: l.vatRate ? D(l.vatRate) : undefined })),
    }, user.actor),
  );
  revalidatePath('/muhasebe/faturalar');
  return { data: { id: invoice.id, docNo: invoice.docNo }, audit: { action: 'create', tableName: 'invoices', recordId: invoice.id, summary: `Gider faturası ${invoice.docNo} kaydedildi`, after: invoice } };
});

const creditNoteSchema = z.object({ invoiceId: z.string().uuid(), reason: z.string().trim().min(3, 'Gerekçe girin') });
export const createCreditNoteAction = withAudit('accounting.createCreditNote', async (raw: z.infer<typeof creditNoteSchema>) => {
  const user = await requirePermission('accounting.invoice');
  const input = creditNoteSchema.parse(raw);
  const { invoice } = await db.transaction((tx) => createCreditNote(tx, input, user.actor));
  revalidatePath('/muhasebe/faturalar');
  revalidatePath(`/muhasebe/faturalar/${input.invoiceId}`);
  return { data: { id: invoice.id, docNo: invoice.docNo }, audit: { action: 'create', tableName: 'invoices', recordId: invoice.id, summary: `İade faturası ${invoice.docNo} kesildi`, after: invoice } };
});

const cancelInvoiceSchema = z.object({ invoiceId: z.string().uuid(), reason: z.string().trim().optional().nullable() });
export const cancelInvoiceAction = withAudit('accounting.cancelInvoice', async (raw: z.infer<typeof cancelInvoiceSchema>) => {
  const user = await requirePermission('accounting.invoice');
  const input = cancelInvoiceSchema.parse(raw);
  const { invoice } = await db.transaction((tx) => cancelInvoice(tx, input.invoiceId, user.actor, { reason: input.reason || undefined }));
  revalidatePath('/muhasebe/faturalar');
  revalidatePath(`/muhasebe/faturalar/${input.invoiceId}`);
  return { data: { id: invoice.id }, audit: { action: 'cancel', tableName: 'invoices', recordId: invoice.id, summary: `${invoice.docNo} iptal edildi` } };
});

const sendEInvoiceSchema = z.object({ invoiceId: z.string().uuid() });
export const sendEInvoiceAction = withAudit('accounting.sendEInvoice', async (raw: z.infer<typeof sendEInvoiceSchema>) => {
  const user = await requirePermission('accounting.einvoice');
  const input = sendEInvoiceSchema.parse(raw);
  const { invoice, partner } = await db.transaction((tx) => getEInvoiceSendContext(tx, input.invoiceId));
  const { invoiceLines } = schema;
  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice.id));

  const kind = resolveEInvoiceKind(partner, invoice);
  const sendResult = await bizimhesap.sendInvoice({
    kind, docNo: invoice.docNo, partnerName: partner.name, partnerTaxNumber: partner.taxNumber ?? undefined, partnerTaxOffice: partner.taxOffice ?? undefined,
    invoiceDate: invoice.invoiceDate, currency: invoice.currency,
    lines: lines.map((l) => ({ description: l.description, qty: l.qty, unitPrice: l.unitPrice, vatRate: l.vatRate, lineTotal: l.lineTotal })),
    subtotal: invoice.subtotal, vatTotal: invoice.vatTotal, grandTotal: invoice.grandTotal,
  });

  const updated = await db.transaction((tx) => applyEInvoiceResult(tx, invoice.id, { kind, ok: sendResult.ok, uuid: sendResult.uuid, ettn: sendResult.ettn, status: sendResult.status, error: sendResult.error }, user.actor));
  revalidatePath('/muhasebe/faturalar');
  revalidatePath(`/muhasebe/faturalar/${invoice.id}`);
  return {
    data: { eInvoiceStatus: updated.eInvoiceStatus, uuid: updated.eInvoiceUuid, sandbox: sendResult.sandbox },
    audit: { action: 'other', tableName: 'invoices', recordId: invoice.id, summary: `${invoice.docNo}: e-belge (${kind}) gönderildi — ${updated.eInvoiceStatus}` },
  };
});

const bulkSendEInvoiceSchema = z.object({ invoiceIds: z.array(z.string().uuid()).min(1) });
export const sendBulkEInvoiceAction = withAudit('accounting.sendBulkEInvoice', async (raw: z.infer<typeof bulkSendEInvoiceSchema>) => {
  const user = await requirePermission('accounting.einvoice');
  const input = bulkSendEInvoiceSchema.parse(raw);
  const { invoiceLines } = schema;
  let sent = 0;
  const auditEntries: AuditInfo[] = [];
  for (const invoiceId of input.invoiceIds) {
    const { invoice, partner } = await db.transaction((tx) => getEInvoiceSendContext(tx, invoiceId));
    if (invoice.eInvoiceStatus === 'accepted') continue;
    const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
    const kind = resolveEInvoiceKind(partner, invoice);
    const sendResult = await bizimhesap.sendInvoice({
      kind, docNo: invoice.docNo, partnerName: partner.name, partnerTaxNumber: partner.taxNumber ?? undefined, partnerTaxOffice: partner.taxOffice ?? undefined,
      invoiceDate: invoice.invoiceDate, currency: invoice.currency,
      lines: lines.map((l) => ({ description: l.description, qty: l.qty, unitPrice: l.unitPrice, vatRate: l.vatRate, lineTotal: l.lineTotal })),
      subtotal: invoice.subtotal, vatTotal: invoice.vatTotal, grandTotal: invoice.grandTotal,
    });
    const updated = await db.transaction((tx) => applyEInvoiceResult(tx, invoiceId, { kind, ok: sendResult.ok, uuid: sendResult.uuid, ettn: sendResult.ettn, status: sendResult.status, error: sendResult.error }, user.actor));
    auditEntries.push({ action: 'other', tableName: 'invoices', recordId: invoiceId, summary: `${invoice.docNo}: toplu e-belge gönderimi — ${updated.eInvoiceStatus}` });
    sent++;
  }
  revalidatePath('/muhasebe/faturalar');
  return { data: { sent }, audit: auditEntries };
});

/* ==================================================================== */
/* Tahsilat / ödeme                                                     */
/* ==================================================================== */

const allocationSchema = z.object({ invoiceId: z.string().uuid(), amount: z.string().min(1, 'Tutar girin') });
const recordPaymentSchema = z.object({
  direction: z.enum(['inbound', 'outbound']),
  method: z.enum(['bank_transfer', 'cash', 'credit_card', 'cheque', 'marketplace_payout', 'other']).default('bank_transfer'),
  partnerId: z.string().uuid('Cari seçin'),
  bankAccountId: z.string().optional().nullable(),
  paymentDate: z.string().min(1, 'Tarih girin'),
  currency: z.string().default('TRY'),
  amount: z.string().min(1, 'Tutar girin'),
  allocations: z.array(allocationSchema).default([]),
  reference: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable(),
});

export const recordAccountingPaymentAction = withAudit('accounting.recordPayment', async (raw: z.infer<typeof recordPaymentSchema>) => {
  const user = await requirePermission('accounting.post');
  const input = recordPaymentSchema.parse(raw);
  const { payment } = await db.transaction((tx) =>
    recordPayment(tx, {
      direction: input.direction, method: input.method, partnerId: input.partnerId, bankAccountId: input.bankAccountId || null,
      paymentDate: input.paymentDate, currency: input.currency, amount: D(input.amount),
      allocations: input.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: D(a.amount) })),
      reference: input.reference || null, note: input.note || null, origin: 'manual',
    }, user.actor),
  );
  revalidatePath('/muhasebe/tahsilatlar');
  revalidatePath('/muhasebe/faturalar');
  const kind = input.direction === 'inbound' ? 'Tahsilat' : 'Ödeme';
  return { data: { id: payment.id, docNo: payment.docNo }, audit: { action: 'create', tableName: 'payments', recordId: payment.id, summary: `${kind} ${payment.docNo} kaydedildi (${payment.amountTry} ₺)`, after: payment } };
});

const idSchema = z.object({ id: z.string().uuid() });
export const unapplyAccountingPaymentAction = withAudit('accounting.unapplyPayment', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('accounting.post');
  const input = idSchema.parse(raw);
  const { payment } = await db.transaction((tx) => unapplyPayment(tx, input.id, user.actor));
  revalidatePath('/muhasebe/tahsilatlar');
  revalidatePath('/muhasebe/faturalar');
  return { data: { id: payment.id }, audit: { action: 'cancel', tableName: 'payments', recordId: payment.id, summary: `${payment.docNo} geri alındı` } };
});

const openInvoicesSchema = z.object({ partnerId: z.string().uuid(), direction: z.enum(['inbound', 'outbound']) });
export const getOpenInvoicesAction = withAudit('accounting.getOpenInvoices', async (raw: z.infer<typeof openInvoicesSchema>) => {
  await requirePermission('accounting.view');
  const input = openInvoicesSchema.parse(raw);
  const rows = await listOpenInvoicesForPartner(input.partnerId, input.direction);
  return { data: rows };
});

/* ==================================================================== */
/* Banka + mutabakat                                                    */
/* ==================================================================== */

const importSchema = z.object({ bankAccountId: z.string().uuid(), source: z.enum(['mt940', 'csv']), fileText: z.string().min(1, 'Dosya boş') });
export const importBankStatementAction = withAudit('accounting.importStatement', async (raw: z.infer<typeof importSchema>) => {
  const user = await requirePermission('accounting.reconcile');
  const input = importSchema.parse(raw);

  const lines = input.source === 'mt940'
    ? parseMt940(input.fileText).transactions
    : parseCsv(input.fileText);
  const parsedForImport = lines.map((l) => ({
    externalRef: l.externalRef, txDate: l.txDate, valueDate: l.valueDate ?? null, amount: D(l.amount),
    currency: l.currency || undefined, balanceAfter: l.balanceAfter ? D(l.balanceAfter) : null, description: l.description || '(açıklama yok)',
    txType: l.txType ?? null,
  }));

  const result = await db.transaction((tx) => importStatement(tx, { bankAccountId: input.bankAccountId, source: input.source, lines: parsedForImport }, user.actor));
  revalidatePath('/muhasebe/banka');
  return {
    data: result,
    audit: { action: 'import', tableName: 'bank_transactions', summary: `Ekstre içe aktarıldı (${input.source}): ${result.importedCount} yeni, ${result.duplicateCount} mükerrer` },
  };
});

const runReconciliationSchema = z.object({ bankAccountId: z.string().uuid().optional().nullable() });
export const runReconciliationAction = withAudit('accounting.runReconciliation', async (raw: z.infer<typeof runReconciliationSchema>) => {
  const user = await requirePermission('accounting.reconcile');
  const input = runReconciliationSchema.parse(raw);
  const unmatched = await listUnmatchedTransactions(db, { bankAccountId: input.bankAccountId || undefined });

  let evaluated = 0;
  let autoApplied = 0;
  let suggested = 0;
  for (const bt of unmatched) {
    const outcome = await db.transaction(async (tx) => {
      const candidates = await buildCandidates(tx, bt.id);
      const matches = await matchBankTransaction(candidates.tx, candidates);
      return persistAndApply(tx, bt.id, matches, user.actor);
    });
    evaluated++;
    if (outcome.applied) autoApplied++;
    else if (outcome.suggestedCount > 0) suggested++;
  }

  revalidatePath('/muhasebe/banka');
  revalidatePath('/muhasebe/mutabakat');
  return {
    data: { evaluated, suggested, autoApplied },
    audit: { action: 'other', tableName: 'bank_transactions', summary: `AI Mutabakat Ajanı çalıştırıldı: ${evaluated} hareket değerlendirildi, ${autoApplied} otomatik uygulandı, ${suggested} öneri üretildi` },
  };
});

const approveMatchSchema = z.object({ matchId: z.string().uuid() });
export const approveReconciliationMatchAction = withAudit('accounting.approveMatch', async (raw: z.infer<typeof approveMatchSchema>) => {
  const user = await requirePermission('accounting.reconcile');
  const input = approveMatchSchema.parse(raw);
  const result = await db.transaction((tx) => approveReconciliationMatch(tx, input.matchId, user.actor));
  revalidatePath('/muhasebe/mutabakat');
  revalidatePath('/muhasebe/banka');
  revalidatePath('/muhasebe/tahsilatlar');
  return { data: result, audit: { action: 'approve', tableName: 'reconciliation_matches', recordId: input.matchId, summary: 'Mutabakat önerisi onaylandı' } };
});

const rejectMatchSchema = z.object({ matchId: z.string().uuid(), reason: z.string().trim().optional().nullable() });
export const rejectReconciliationMatchAction = withAudit('accounting.rejectMatch', async (raw: z.infer<typeof rejectMatchSchema>) => {
  const user = await requirePermission('accounting.reconcile');
  const input = rejectMatchSchema.parse(raw);
  await db.transaction((tx) => rejectReconciliationMatch(tx, input.matchId, input.reason || null, user.actor));
  revalidatePath('/muhasebe/mutabakat');
  revalidatePath('/muhasebe/banka');
  return { data: undefined, audit: { action: 'reject', tableName: 'reconciliation_matches', recordId: input.matchId, summary: `Mutabakat önerisi reddedildi${input.reason ? `: ${input.reason}` : ''}` } };
});

const manualMatchSchema = z.object({
  bankTransactionId: z.string().uuid(),
  kind: z.enum(['invoice', 'partner_on_account', 'loan_installment', 'expense']),
  partnerId: z.string().uuid().optional().nullable(),
  invoiceId: z.string().uuid().optional().nullable(),
  amount: z.string().optional().nullable(),
  loanInstallmentId: z.string().uuid().optional().nullable(),
  expenseAccountCode: z.string().optional().nullable(),
});
export const manualReconciliationMatchAction = withAudit('accounting.manualMatch', async (raw: z.infer<typeof manualMatchSchema>) => {
  const user = await requirePermission('accounting.reconcile');
  const input = manualMatchSchema.parse(raw);
  const result = await db.transaction((tx) =>
    manualReconciliationMatch(tx, input.bankTransactionId, {
      kind: input.kind, partnerId: input.partnerId || null, invoiceId: input.invoiceId || null,
      amount: input.amount ? D(input.amount) : null, loanInstallmentId: input.loanInstallmentId || null, expenseAccountCode: input.expenseAccountCode || null,
    }, user.actor),
  );
  revalidatePath('/muhasebe/mutabakat');
  revalidatePath('/muhasebe/banka');
  revalidatePath('/muhasebe/tahsilatlar');
  return { data: result, audit: { action: 'create', tableName: 'reconciliation_matches', summary: 'Banka hareketi elle eşleştirildi' } };
});

const ignoreSchema = z.object({ bankTransactionId: z.string().uuid() });
export const ignoreBankTransactionAction = withAudit('accounting.ignoreTransaction', async (raw: z.infer<typeof ignoreSchema>) => {
  const user = await requirePermission('accounting.reconcile');
  const input = ignoreSchema.parse(raw);
  await db.transaction((tx) => ignoreBankTransaction(tx, input.bankTransactionId, user.actor));
  revalidatePath('/muhasebe/banka');
  revalidatePath('/muhasebe/mutabakat');
  return { data: undefined, audit: { action: 'update', tableName: 'bank_transactions', recordId: input.bankTransactionId, summary: 'Banka hareketi mutabakat dışı bırakıldı' } };
});

/* ==================================================================== */
/* Yevmiye                                                              */
/* ==================================================================== */

const journalLineSchema = z.object({ accountCode: z.string().min(1, 'Hesap seçin'), partnerId: z.string().trim().optional().nullable(), description: z.string().trim().optional().nullable(), debit: z.string().optional(), credit: z.string().optional() });
const manualJournalSchema = z.object({
  ledger: z.enum(['VUK', 'UFRS', 'both']), journalCode: z.string().min(1), entryDate: z.string().min(1, 'Tarih girin'),
  description: z.string().trim().min(3, 'Açıklama girin'), lines: z.array(journalLineSchema).min(2, 'En az iki satır olmalı'),
});

export const createManualJournalEntryAction = withAudit('accounting.createManualJournal', async (raw: z.infer<typeof manualJournalSchema>) => {
  const user = await requirePermission('accounting.post');
  const input = manualJournalSchema.parse(raw);
  const lines: JournalLineInput[] = input.lines.map((l) => ({ accountCode: l.accountCode, partnerId: l.partnerId || null, description: l.description || null, debit: D(l.debit || '0'), credit: D(l.credit || '0') }));
  const { vukId, ufrsId } = await db.transaction((tx) => postJournalEntry(tx, { ledger: input.ledger, journalCode: input.journalCode, entryDate: new Date(input.entryDate), description: input.description, lines, origin: 'manual' }, user.actor));
  revalidatePath('/muhasebe/yevmiye');
  return { data: { vukId, ufrsId }, audit: { action: 'post', tableName: 'journal_entries', recordId: vukId ?? ufrsId, summary: `Manuel fiş kaydedildi: ${input.description}` } };
});

const reverseSchema = z.object({ entryId: z.string().uuid() });
export const reverseJournalEntryAction = withAudit('accounting.reverseJournal', async (raw: z.infer<typeof reverseSchema>) => {
  const user = await requirePermission('accounting.post');
  const input = reverseSchema.parse(raw);
  const result = await db.transaction((tx) => reverseJournalEntry(tx, input.entryId, user.actor));
  revalidatePath('/muhasebe/yevmiye');
  return { data: result, audit: { action: 'cancel', tableName: 'journal_entries', recordId: input.entryId, summary: 'Fiş ters kayıtla iptal edildi' } };
});

/* ==================================================================== */
/* KDV + dönemler                                                       */
/* ==================================================================== */

const vatPeriodSchema = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM biçiminde girin') });
export const closeVatPeriodAction = withAudit('accounting.closeVatPeriod', async (raw: z.infer<typeof vatPeriodSchema>) => {
  const user = await requirePermission('accounting.post');
  const input = vatPeriodSchema.parse(raw);
  const result = await db.transaction((tx) => closeVatPeriod(tx, input.period, user.actor));
  revalidatePath('/muhasebe/kdv');
  return { data: result, audit: result.skipped ? undefined : { action: 'post', tableName: 'vat_periods', recordId: result.period, summary: `${result.period} KDV dönemi hesaplandı` } };
});

const periodSchema = z.object({ code: z.string().min(1) });
export const closeFiscalPeriodAction = withAudit('accounting.closePeriod', async (raw: z.infer<typeof periodSchema>) => {
  const user = await requirePermission('accounting.close_period');
  const input = periodSchema.parse(raw);
  const period = await db.transaction((tx) => closePeriod(tx, input.code, user.actor));
  revalidatePath('/muhasebe/donemler');
  return { data: { code: period.code, isClosed: period.isClosed }, audit: { action: 'update', tableName: 'fiscal_periods', recordId: period.id, summary: `${period.code} dönemi kapatıldı` } };
});

export const openFiscalPeriodAction = withAudit('accounting.openPeriod', async (raw: z.infer<typeof periodSchema>) => {
  const user = await requirePermission('accounting.close_period');
  const input = periodSchema.parse(raw);
  const period = await db.transaction((tx) => openPeriod(tx, input.code, user.actor));
  revalidatePath('/muhasebe/donemler');
  return { data: { code: period.code, isClosed: period.isClosed }, audit: { action: 'update', tableName: 'fiscal_periods', recordId: period.id, summary: `${period.code} dönemi yeniden açıldı` } };
});
