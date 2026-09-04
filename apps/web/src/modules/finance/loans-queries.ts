import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db, loans, loanInstallments, bankAccounts } from '@plantero/db';
import { listConsolidatedInstallments, listOutstandingPrincipal, getOutstandingPrincipal } from '@plantero/core';

export type LoanCardRow = {
  id: string; code: string; bankName: string; productName: string; rateKind: string; monthlyRatePct: string; monthlyInstallment: string;
  /** Statik I34(c) referansı — Excel içe aktarım anındaki toplam anapara, taksit ödendikçe DEĞİŞMEZ. Ekranlarda gösterilmez. */
  remainingPrincipal: string;
  /** Canlı bakiye — ödenmemiş taksitlerin anapara toplamı (`listOutstandingPrincipal`, tek GROUP BY sorgusu). Ekranlarda "Kalan anapara" olarak bu gösterilir. */
  outstandingPrincipal: string;
  remainingInstallments: number; lastDue: string | null; paymentDay: number; isActive: boolean; bankAccountLabel: string | null;
};

export async function listLoans(): Promise<LoanCardRow[]> {
  // Tur 7 P2 düzeltmesi: canlı bakiye TEK bir GROUP BY sorgusuyla (listOutstandingPrincipal) tüm
  // krediler için birlikte alınır — kredi sayısı kadar N+1 sorgu üretmez (bkz. loans.ts yorumu).
  const [rows, outstandingByLoan] = await Promise.all([
    db
      .select({ l: loans, bankCode: bankAccounts.code })
      .from(loans)
      .leftJoin(bankAccounts, eq(bankAccounts.id, loans.bankAccountId))
      .orderBy(asc(loans.code)),
    listOutstandingPrincipal(db),
  ]);
  return rows.map((r) => ({
    id: r.l.id, code: r.l.code, bankName: r.l.bankName, productName: r.l.productName, rateKind: r.l.rateKind, monthlyRatePct: r.l.monthlyRatePct,
    monthlyInstallment: r.l.monthlyInstallment, remainingPrincipal: r.l.remainingPrincipal, outstandingPrincipal: outstandingByLoan.get(r.l.id) ?? r.l.remainingPrincipal,
    remainingInstallments: r.l.remainingInstallments, lastDue: r.l.lastDue, paymentDay: r.l.paymentDay, isActive: r.l.isActive, bankAccountLabel: r.bankCode,
  }));
}

export async function getLoan(loanId: string) {
  const [loan] = await db.select().from(loans).where(eq(loans.id, loanId)).limit(1);
  if (!loan) return null;
  // Tur 7 P2 düzeltmesi: detay ekranındaki "Kalan anapara" KPI'ı da canlı bakiyeyi göstermeli (bkz. loans.ts yorumu).
  const outstandingPrincipal = await getOutstandingPrincipal(db, loanId);
  return { ...loan, outstandingPrincipal };
}

export type InstallmentRow = { id: string; seq: number; dueDate: string; period: string; installment: string; interest: string; principal: string; remainingAfter: string; status: string; paidAt: string | null };

export async function listLoanInstallments(loanId: string): Promise<InstallmentRow[]> {
  const rows = await db.select().from(loanInstallments).where(eq(loanInstallments.loanId, loanId)).orderBy(asc(loanInstallments.seq));
  return rows.map((r) => ({ id: r.id, seq: r.seq, dueDate: r.dueDate, period: r.period, installment: r.installment, interest: r.interest, principal: r.principal, remainingAfter: r.remainingAfter, status: r.status, paidAt: r.paidAt }));
}

export type ConsolidatedRow = { period: string; loanCode: string; loanId: string; seq: number; dueDate: string; installment: string; interest: string; principal: string; status: string; bankTransactionId: string | null };

/** Konsolide takvim: dönem × kredi — pivotlanmış (her dönem bir satır, her kredi bir kolon) */
export async function getConsolidatedSchedule(): Promise<{ periods: string[]; loanCodes: string[]; cellByKey: Map<string, ConsolidatedRow>; totalsByPeriod: Map<string, { installment: string; paidCount: number; totalCount: number }> }> {
  const rows = await listConsolidatedInstallments(db);
  const periods = [...new Set(rows.map((r) => r.period))].sort();
  const loanCodes = [...new Set(rows.map((r) => r.loanCode))].sort();
  const cellByKey = new Map<string, ConsolidatedRow>();
  const totalsByPeriod = new Map<string, { installment: number; paidCount: number; totalCount: number }>();
  for (const r of rows) {
    cellByKey.set(`${r.period}:${r.loanCode}`, r);
    const t = totalsByPeriod.get(r.period) ?? { installment: 0, paidCount: 0, totalCount: 0 };
    t.installment += Number(r.installment);
    t.totalCount += 1;
    if (r.status === 'paid') t.paidCount += 1;
    totalsByPeriod.set(r.period, t);
  }
  const totalsOut = new Map([...totalsByPeriod.entries()].map(([k, v]) => [k, { installment: v.installment.toFixed(4), paidCount: v.paidCount, totalCount: v.totalCount }]));
  return { periods, loanCodes, cellByKey, totalsByPeriod: totalsOut };
}

/** Toplam aylık taksit yükü — grafik için (tüm kredilerin dönem bazlı toplamı) */
export async function getMonthlyLoanBurden(): Promise<Array<{ period: string; total: string }>> {
  const rows = await listConsolidatedInstallments(db);
  const byPeriod = new Map<string, number>();
  for (const r of rows) byPeriod.set(r.period, (byPeriod.get(r.period) ?? 0) + Number(r.installment));
  return [...byPeriod.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([period, total]) => ({ period, total: total.toFixed(4) }));
}
