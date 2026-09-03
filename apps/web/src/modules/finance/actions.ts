'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@plantero/db';
import {
  D, recordPayment, unapplyPayment, runReconciliation, approveMatch, rejectMatch, manualMatch, ignoreTransaction,
} from '@plantero/core';
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
  const result = await db.transaction((tx) => runReconciliation(tx, { bankAccountId: input.bankAccountId || undefined }, user.actor));
  revalidatePath('/finans/banka');
  return {
    data: result,
    audit: { action: 'other', tableName: 'bank_transactions', summary: `Mutabakat çalıştırıldı: ${result.evaluated} değerlendirildi, ${result.suggested} öneri, ${result.autoApplied} otomatik uygulandı` },
  };
});

const approveMatchSchema = z.object({ matchId: z.string().uuid() });

export const approveMatchAction = withAudit('finance.approveMatch', async (raw: z.infer<typeof approveMatchSchema>) => {
  const user = await requirePermission('accounting.reconcile');
  const input = approveMatchSchema.parse(raw);
  const { paymentId } = await db.transaction((tx) => approveMatch(tx, input.matchId, user.actor));
  revalidatePath('/finans/banka');
  revalidatePath('/finans/tahsilat');
  return { data: { paymentId }, audit: { action: 'approve', tableName: 'reconciliation_matches', recordId: input.matchId, summary: 'Mutabakat önerisi onaylandı; tahsilat/ödeme + fiş üretildi' } };
});

const rejectMatchSchema = z.object({ matchId: z.string().uuid(), reason: z.string().trim().optional().nullable() });

export const rejectMatchAction = withAudit('finance.rejectMatch', async (raw: z.infer<typeof rejectMatchSchema>) => {
  const user = await requirePermission('accounting.reconcile');
  const input = rejectMatchSchema.parse(raw);
  await db.transaction((tx) => rejectMatch(tx, input.matchId, input.reason || null, user.actor));
  revalidatePath('/finans/banka');
  return { data: undefined, audit: { action: 'reject', tableName: 'reconciliation_matches', recordId: input.matchId, summary: `Mutabakat önerisi reddedildi${input.reason ? `: ${input.reason}` : ''}` } };
});

const manualMatchSchema = z.object({ bankTransactionId: z.string().uuid(), partnerId: z.string().uuid('Cari seçin'), invoiceId: z.string().uuid('Fatura seçin'), amount: z.string().min(1, 'Tutar girin') });

export const manualMatchAction = withAudit('finance.manualMatch', async (raw: z.infer<typeof manualMatchSchema>) => {
  const user = await requirePermission('accounting.reconcile');
  const input = manualMatchSchema.parse(raw);
  const { paymentId } = await db.transaction((tx) => manualMatch(tx, input.bankTransactionId, { partnerId: input.partnerId, invoiceId: input.invoiceId, amount: D(input.amount) }, user.actor));
  revalidatePath('/finans/banka');
  revalidatePath('/finans/tahsilat');
  return { data: { paymentId }, audit: { action: 'create', tableName: 'reconciliation_matches', summary: 'Banka hareketi elle eşleştirildi; tahsilat/ödeme + fiş üretildi' } };
});

const ignoreSchema = z.object({ bankTransactionId: z.string().uuid() });

export const ignoreTransactionAction = withAudit('finance.ignoreTransaction', async (raw: z.infer<typeof ignoreSchema>) => {
  await requirePermission('accounting.reconcile');
  const input = ignoreSchema.parse(raw);
  await db.transaction((tx) => ignoreTransaction(tx, input.bankTransactionId));
  revalidatePath('/finans/banka');
  return { data: undefined, audit: { action: 'update', tableName: 'bank_transactions', recordId: input.bankTransactionId, summary: 'Banka hareketi mutabakat dışı bırakıldı (yok sayıldı)', after: { status: 'ignored' } } };
});
