'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@plantero/db';
import { D, recomputeVariableLoan, postLoanInstallmentPayment } from '@plantero/core';
import { requirePermission } from '@/lib/auth';
import { withAudit } from '@/lib/actions';

const recomputeSchema = z.object({ loanId: z.string().uuid(), newMonthlyRatePct: z.string().min(1) });

/** Değişken faizli kredi için "faiz oranı güncelle" — ödenmemiş taksitleri yeni oranla yeniden hesaplar */
export const recomputeVariableLoanAction = withAudit('finance.recomputeVariableLoan', async (raw: z.infer<typeof recomputeSchema>) => {
  const user = await requirePermission('finance.manage');
  const input = recomputeSchema.parse(raw);
  const result = await db.transaction((tx) => recomputeVariableLoan(tx, input.loanId, D(input.newMonthlyRatePct), user.actor));
  revalidatePath('/finans/krediler');
  revalidatePath('/finans/nakit-akisi');
  return {
    data: result,
    audit: { action: 'update' as const, tableName: 'loans', recordId: input.loanId, summary: `Faiz oranı %${input.newMonthlyRatePct} olarak güncellendi, ${result.updated} taksit yeniden hesaplandı` },
  };
});

const payInstallmentSchema = z.object({ loanId: z.string().uuid(), seq: z.number().int().min(1), cashAccountCode: z.string().optional(), bankTransactionId: z.string().uuid().optional().nullable() });

/** Taksidi elle ödendi işaretler (300.xx + 780 borç / banka alacak fişi atar) */
export const payInstallmentAction = withAudit('finance.payInstallment', async (raw: z.infer<typeof payInstallmentSchema>) => {
  const user = await requirePermission('finance.manage');
  const input = payInstallmentSchema.parse(raw);
  const result = await db.transaction((tx) => postLoanInstallmentPayment(tx, { loanId: input.loanId, seq: input.seq, cashAccountCode: input.cashAccountCode, bankTransactionId: input.bankTransactionId }, user.actor));
  revalidatePath('/finans/krediler');
  return {
    data: result,
    audit: { action: 'post' as const, tableName: 'loan_installments', summary: result.skipped ? 'Taksit zaten ödenmişti' : `Taksit #${input.seq} ödendi olarak işaretlendi` },
  };
});
