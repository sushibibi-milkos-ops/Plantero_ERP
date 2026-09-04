'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@plantero/db';
import {
  D, recordPayment, unapplyPayment,
  approveReconciliationMatch, rejectReconciliationMatch, manualReconciliationMatch, ignoreBankTransaction,
} from '@plantero/core';
import { runAiReconciliation } from '@plantero/ai';
import { requirePermission } from '@/lib/auth';
import { withAudit } from '@/lib/actions';
import { listOpenInvoices } from './queries';

/* ==================================================================== */
/* Tahsilat / Ödeme                                                     */
/* ==================================================================== */

const allocationSchema = z.object({ invoiceId: z.string().uuid(), amount: z.string().min(1, 'Tutar girin') });

const recordPaymentSchema = z.object({
  direction: z.enum(['inbound', 'outbound']),
  method: z.enum(['bank_transfer', 'cash', 'credit_card', 'cheque', 'marketplace_payout', 'other']).default('bank_transfer'),
  partnerId: z.string().uuid('Cari seçin'),
  bankAccountId: z.string().uuid().optional().nullable(),
  paymentDate: z.string().min(1, 'Tarih girin'),
  currency: z.string().default('TRY'),
  amount: z.string().min(1, 'Tutar girin'),
  allocations: z.array(allocationSchema).default([]),
  reference: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable(),
});

export const recordPaymentAction = withAudit('finance.recordPayment', async (raw: z.infer<typeof recordPaymentSchema>) => {
  const user = await requirePermission('finance.manage');
  const input = recordPaymentSchema.parse(raw);
  const { payment } = await db.transaction((tx) =>
    recordPayment(tx, {
      direction: input.direction, method: input.method, partnerId: input.partnerId, bankAccountId: input.bankAccountId || null,
      paymentDate: input.paymentDate, currency: input.currency, amount: D(input.amount),
      allocations: input.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: D(a.amount) })),
      reference: input.reference || null, note: input.note || null, origin: 'manual',
    }, user.actor),
  );
  revalidatePath('/finans/tahsilat');
  const kind = input.direction === 'inbound' ? 'Tahsilat' : 'Ödeme';
  return {
    data: { id: payment.id, docNo: payment.docNo },
    audit: { action: 'create', tableName: 'payments', recordId: payment.id, summary: `${kind} ${payment.docNo} kaydedildi (${payment.amountTry} ₺)`, after: payment },
  };
});

const idSchema = z.object({ id: z.string().uuid() });

export const unapplyPaymentAction = withAudit('finance.unapplyPayment', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('finance.manage');
  const input = idSchema.parse(raw);
  const { payment } = await db.transaction((tx) => unapplyPayment(tx, input.id, user.actor));
  revalidatePath('/finans/tahsilat');
  revalidatePath('/finans/banka');
  return { data: { id: payment.id }, audit: { action: 'cancel', tableName: 'payments', recordId: payment.id, summary: `${payment.docNo} geri alındı` } };
});

const openInvoicesSchema = z.object({ partnerId: z.string().uuid(), direction: z.enum(['inbound', 'outbound']) });

/** Form için: seçilen carinin açık faturaları (istemci tarafında sorgu tabloları çağıramaz) */
export const getOpenInvoicesAction = withAudit('finance.getOpenInvoices', async (raw: z.infer<typeof openInvoicesSchema>) => {
  await requirePermission('finance.view');
  const input = openInvoicesSchema.parse(raw);
  const rows = await listOpenInvoices(input.partnerId, input.direction);
  return { data: rows };
});

/* ==================================================================== */
/* Banka mutabakatı                                                     */
/* ==================================================================== */

const runReconciliationSchema = z.object({ bankAccountId: z.string().uuid().optional().nullable() });

export const runReconciliationAction = withAudit('finance.runReconciliation', async (raw: z.infer<typeof runReconciliationSchema>) => {
  const user = await requirePermission('accounting.reconcile');
  const input = runReconciliationSchema.parse(raw);
  // /muhasebe/mutabakat ve worker (reconciliation-nightly) ile PAYLAŞILAN tek motor — bkz. packages/ai/src/reconciliationRunner.ts.
  // Eski fatura-only kural motoru (`finance/bankReconciliation.ts::runReconciliation`) canlı yoldan çıkarıldı.
  const result = await runAiReconciliation(db, { bankAccountId: input.bankAccountId || undefined }, user.actor);
  revalidatePath('/finans/banka');
  revalidatePath('/muhasebe/banka');
  revalidatePath('/muhasebe/mutabakat');
  const failNote = result.failed ? `, ${result.failed} hareket hata verdi (${result.errors.map((e) => e.message).slice(0, 3).join('; ')})` : '';
  return {
    data: { evaluated: result.evaluated, suggested: result.suggested, autoApplied: result.autoApplied, failed: result.failed },
    audit: { action: 'other', tableName: 'bank_transactions', summary: `Mutabakat çalıştırıldı: ${result.evaluated} değerlendirildi, ${result.suggested} öneri, ${result.autoApplied} otomatik uygulandı${failNote}` },
  };
});

const approveMatchSchema = z.object({ matchId: z.string().uuid() });

export const approveMatchAction = withAudit('finance.approveMatch', async (raw: z.infer<typeof approveMatchSchema>) => {
  const user = await requirePermission('accounting.reconcile');
  const input = approveMatchSchema.parse(raw);
  // Tür bazlı jenerik onay (fatura / cari avans / kredi taksiti / gider / masraf) — /muhasebe/mutabakat ile aynı servis.
  const result = await db.transaction((tx) => approveReconciliationMatch(tx, input.matchId, user.actor));
  revalidatePath('/finans/banka');
  revalidatePath('/finans/tahsilat');
  revalidatePath('/muhasebe/banka');
  revalidatePath('/muhasebe/mutabakat');
  return { data: { paymentId: result.paymentId ?? null, journalEntryId: result.journalEntryId ?? null }, audit: { action: 'approve', tableName: 'reconciliation_matches', recordId: input.matchId, summary: 'Mutabakat önerisi onaylandı; tahsilat/ödeme veya fiş üretildi' } };
});

const rejectMatchSchema = z.object({ matchId: z.string().uuid(), reason: z.string().trim().optional().nullable() });

export const rejectMatchAction = withAudit('finance.rejectMatch', async (raw: z.infer<typeof rejectMatchSchema>) => {
  const user = await requirePermission('accounting.reconcile');
  const input = rejectMatchSchema.parse(raw);
  await db.transaction((tx) => rejectReconciliationMatch(tx, input.matchId, input.reason || null, user.actor));
  revalidatePath('/finans/banka');
  revalidatePath('/muhasebe/mutabakat');
  return { data: undefined, audit: { action: 'reject', tableName: 'reconciliation_matches', recordId: input.matchId, summary: `Mutabakat önerisi reddedildi${input.reason ? `: ${input.reason}` : ''}` } };
});

const manualMatchSchema = z.object({ bankTransactionId: z.string().uuid(), partnerId: z.string().uuid('Cari seçin'), invoiceId: z.string().uuid('Fatura seçin'), amount: z.string().min(1, 'Tutar girin') });

export const manualMatchAction = withAudit('finance.manualMatch', async (raw: z.infer<typeof manualMatchSchema>) => {
  const user = await requirePermission('accounting.reconcile');
  const input = manualMatchSchema.parse(raw);
  // Ödeme tutarı = |banka hareketi| (I11-d), fatura tahsisi = girilen tutar; kalan cari avans olarak kalır.
  const { paymentId } = await db.transaction((tx) =>
    manualReconciliationMatch(tx, input.bankTransactionId, { kind: 'invoice', partnerId: input.partnerId, invoiceId: input.invoiceId, amount: D(input.amount) }, user.actor),
  );
  revalidatePath('/finans/banka');
  revalidatePath('/finans/tahsilat');
  revalidatePath('/muhasebe/banka');
  return { data: { paymentId: paymentId ?? null }, audit: { action: 'create', tableName: 'reconciliation_matches', summary: 'Banka hareketi elle eşleştirildi; tahsilat/ödeme + fiş üretildi' } };
});

const ignoreSchema = z.object({ bankTransactionId: z.string().uuid() });

export const ignoreTransactionAction = withAudit('finance.ignoreTransaction', async (raw: z.infer<typeof ignoreSchema>) => {
  const user = await requirePermission('accounting.reconcile');
  const input = ignoreSchema.parse(raw);
  await db.transaction((tx) => ignoreBankTransaction(tx, input.bankTransactionId, user.actor));
  revalidatePath('/finans/banka');
  revalidatePath('/muhasebe/banka');
  return { data: undefined, audit: { action: 'update', tableName: 'bank_transactions', recordId: input.bankTransactionId, summary: 'Banka hareketi mutabakat dışı bırakıldı (yok sayıldı)', after: { status: 'ignored' } } };
});
