import 'server-only';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@plantero/db';
import { D, getAccountBalance, getOpenInvoicesForPartner as coreGetOpenInvoices } from '@plantero/core';

const {
  payments, paymentAllocations, invoices, partners, bankAccounts, bankTransactions, reconciliationMatches,
} = schema;

/* ==================================================================== */
/* Ortak arama listeleri                                                */
/* ==================================================================== */

/** Yöne göre cari listesi: tahsilat → müşteri/ikisi, ödeme → tedarikçi/ikisi */
export async function listPartnersForDirection(direction: 'inbound' | 'outbound') {
  const kinds: Array<'customer' | 'supplier' | 'both' | 'bank' | 'other'> = direction === 'inbound' ? ['customer', 'both'] : ['supplier', 'both'];
  return db
    .select({ id: partners.id, code: partners.code, name: partners.name, currency: partners.currency, balance: partners.balance })
    .from(partners)
    .where(and(inArray(partners.kind, kinds), eq(partners.isActive, true)))
    .orderBy(asc(partners.name));
}

export type OpenInvoiceRow = { id: string; docNo: string; invoiceDate: string; dueDate: string; currency: string; grandTotal: string; residual: string };

/** Bir carinin açık (kalanı olan) faturaları — tahsilat formunda tahsis listesi */
export async function listOpenInvoices(partnerId: string, direction: 'inbound' | 'outbound'): Promise<OpenInvoiceRow[]> {
  const rows = await coreGetOpenInvoices(db, partnerId, direction);
  return rows.map((r) => ({ id: r.id, docNo: r.docNo, invoiceDate: r.invoiceDate, dueDate: r.dueDate, currency: r.currency, grandTotal: r.grandTotal, residual: r.residual }));
}

export async function listBankAccountsForForm() {
  return db.select({ id: bankAccounts.id, code: bankAccounts.code, bankName: bankAccounts.bankName, currency: bankAccounts.currency }).from(bankAccounts).where(eq(bankAccounts.isActive, true)).orderBy(asc(bankAccounts.code));
}

/* ==================================================================== */
/* /finans/tahsilat                                                     */
/* ==================================================================== */

export type PaymentRow = {
  id: string; docNo: string; direction: 'inbound' | 'outbound'; method: string; status: string; partnerName: string;
  paymentDate: string; currency: string; amount: string; amountTry: string; allocatedAmount: string; unallocatedAmount: string;
  fxDifference: string; allocationCount: number;
};

export async function listPayments(): Promise<PaymentRow[]> {
  const rows = await db
    .select({ p: payments, partnerName: partners.name })
    .from(payments)
    .innerJoin(partners, eq(partners.id, payments.partnerId))
    .orderBy(desc(payments.paymentDate), desc(payments.createdAt));
  const allocAgg = await db.select({ paymentId: paymentAllocations.paymentId, cnt: sql<string>`count(*)` }).from(paymentAllocations).groupBy(paymentAllocations.paymentId);
  const cntByPayment = new Map(allocAgg.map((r) => [r.paymentId, Number(r.cnt)]));
  return rows.map((r) => ({
    id: r.p.id, docNo: r.p.docNo, direction: r.p.direction, method: r.p.method, status: r.p.status, partnerName: r.partnerName,
    paymentDate: r.p.paymentDate, currency: r.p.currency, amount: r.p.amount, amountTry: r.p.amountTry,
    allocatedAmount: r.p.allocatedAmount, unallocatedAmount: r.p.unallocatedAmount, fxDifference: r.p.fxDifference,
    allocationCount: cntByPayment.get(r.p.id) ?? 0,
  }));
}

export type PaymentKpis = { totalInboundTry: string; totalOutboundTry: string; openReceivableTry: string; openPayableTry: string; last30dCount: number };

export async function getPaymentKpis(): Promise<PaymentKpis> {
  const [inbound] = await db.select({ sum: sql<string>`coalesce(sum(${payments.amountTry}), 0)` }).from(payments).where(and(eq(payments.direction, 'inbound'), eq(payments.status, 'posted')));
  const [outbound] = await db.select({ sum: sql<string>`coalesce(sum(${payments.amountTry}), 0)` }).from(payments).where(and(eq(payments.direction, 'outbound'), eq(payments.status, 'posted')));
  const [receivable] = await db.select({ sum: sql<string>`coalesce(sum(${invoices.residual}), 0)` }).from(invoices).where(and(eq(invoices.kind, 'sales'), inArray(invoices.status, ['posted', 'partially_paid'])));
  const [payable] = await db.select({ sum: sql<string>`coalesce(sum(${invoices.residual}), 0)` }).from(invoices).where(and(eq(invoices.kind, 'purchase'), inArray(invoices.status, ['posted', 'partially_paid'])));
  const [recent] = await db.select({ cnt: sql<string>`count(*)` }).from(payments).where(and(eq(payments.status, 'posted'), sql`${payments.paymentDate} >= (current_date - interval '30 days')`));
  return {
    totalInboundTry: inbound?.sum ?? '0', totalOutboundTry: outbound?.sum ?? '0', openReceivableTry: receivable?.sum ?? '0',
    openPayableTry: payable?.sum ?? '0', last30dCount: Number(recent?.cnt ?? 0),
  };
}

/* ==================================================================== */
/* /finans/banka                                                        */
/* ==================================================================== */

export type BankAccountSummary = {
  id: string; code: string; bankName: string; branch: string | null; currency: string; accountCode: string;
  statementBalance: string; ledgerBalanceVuk: string; diff: string; unmatchedCount: number;
};

export async function listBankAccountsSummary(): Promise<BankAccountSummary[]> {
  const accounts = await db.select().from(bankAccounts).orderBy(asc(bankAccounts.code));
  const unmatchedAgg = await db
    .select({ bankAccountId: bankTransactions.bankAccountId, cnt: sql<string>`count(*)` })
    .from(bankTransactions)
    .where(inArray(bankTransactions.status, ['unmatched', 'suggested']))
    .groupBy(bankTransactions.bankAccountId);
  const unmatchedByAccount = new Map(unmatchedAgg.map((r) => [r.bankAccountId, Number(r.cnt)]));

  const out: BankAccountSummary[] = [];
  for (const a of accounts) {
    const ledgerBalance = await getAccountBalance(db, { accountCode: a.accountCode, ledger: 'VUK' });
    const diff = D(a.statementBalance).minus(ledgerBalance);
    out.push({
      id: a.id, code: a.code, bankName: a.bankName, branch: a.branch, currency: a.currency, accountCode: a.accountCode,
      statementBalance: a.statementBalance, ledgerBalanceVuk: ledgerBalance.toFixed(4), diff: diff.toFixed(4),
      unmatchedCount: unmatchedByAccount.get(a.id) ?? 0,
    });
  }
  return out;
}

export type BankTransactionRow = {
  id: string; bankAccountId: string; bankAccountCode: string; externalRef: string; txDate: string; amount: string;
  currency: string; description: string; counterpartyName: string | null; status: string;
  matchedPartnerName: string | null; bestMatchId: string | null; bestConfidence: string | null; bestRationale: string | null;
  bestPartnerName: string | null; bestInvoiceDocNo: string | null; bestAllocationAmount: string | null;
};

/** Banka hareketleri: en iyi (güven en yüksek) 'suggested' önerisi + eşleşmişse cari adı ile birlikte */
export async function listBankTransactions(bankAccountId?: string): Promise<BankTransactionRow[]> {
  const rows = await db
    .select({ bt: bankTransactions, accountCode: bankAccounts.code, matchedPartnerName: partners.name })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankAccounts.id, bankTransactions.bankAccountId))
    .leftJoin(partners, eq(partners.id, bankTransactions.matchedPartnerId))
    .where(bankAccountId ? eq(bankTransactions.bankAccountId, bankAccountId) : undefined)
    .orderBy(desc(bankTransactions.txDate), desc(bankTransactions.createdAt));

  const suggestedIds = rows.filter((r) => r.bt.status === 'suggested').map((r) => r.bt.id);
  const matchRows = suggestedIds.length
    ? await db
        .select({ m: reconciliationMatches, partnerName: partners.name })
        .from(reconciliationMatches)
        .leftJoin(partners, eq(partners.id, reconciliationMatches.partnerId))
        .where(and(inArray(reconciliationMatches.bankTransactionId, suggestedIds), eq(reconciliationMatches.status, 'suggested')))
    : [];
  const bestByBt = new Map<string, (typeof matchRows)[number]>();
  for (const m of matchRows) {
    const cur = bestByBt.get(m.m.bankTransactionId);
    if (!cur || D(m.m.confidence).gt(D(cur.m.confidence))) bestByBt.set(m.m.bankTransactionId, m);
  }
  const bestInvoiceIds = Array.from(new Set(Array.from(bestByBt.values()).map((m) => m.m.invoiceIds?.[0]).filter((v): v is string => Boolean(v))));
  const invoiceDocNoById = bestInvoiceIds.length
    ? new Map((await db.select({ id: invoices.id, docNo: invoices.docNo }).from(invoices).where(inArray(invoices.id, bestInvoiceIds))).map((i) => [i.id, i.docNo]))
    : new Map<string, string>();

  return rows.map((r) => {
    const best = bestByBt.get(r.bt.id);
    const alloc = best?.m.allocations?.[0] as { invoiceId?: string; amount?: string } | undefined;
    return {
      id: r.bt.id, bankAccountId: r.bt.bankAccountId, bankAccountCode: r.accountCode, externalRef: r.bt.externalRef,
      txDate: r.bt.txDate, amount: r.bt.amount, currency: r.bt.currency, description: r.bt.description,
      counterpartyName: r.bt.counterpartyName, status: r.bt.status, matchedPartnerName: r.matchedPartnerName,
      bestMatchId: best?.m.id ?? null, bestConfidence: best?.m.confidence ?? null, bestRationale: best?.m.rationale ?? null,
      bestPartnerName: best?.partnerName ?? null, bestInvoiceDocNo: alloc?.invoiceId ? (invoiceDocNoById.get(alloc.invoiceId) ?? null) : null,
      bestAllocationAmount: alloc?.amount ?? null,
    };
  });
}

export type ReconciliationKpis = { unmatched: number; suggested: number; matched: number; autoAppliedToday: number };

export async function getReconciliationKpis(): Promise<ReconciliationKpis> {
  const rows = await db.select({ status: bankTransactions.status, cnt: sql<string>`count(*)` }).from(bankTransactions).groupBy(bankTransactions.status);
  const byStatus = new Map(rows.map((r) => [r.status, Number(r.cnt)]));
  const [autoToday] = await db
    .select({ cnt: sql<string>`count(*)` })
    .from(reconciliationMatches)
    .where(and(eq(reconciliationMatches.status, 'auto_applied'), sql`${reconciliationMatches.decidedAt} >= current_date`));
  return { unmatched: byStatus.get('unmatched') ?? 0, suggested: byStatus.get('suggested') ?? 0, matched: byStatus.get('matched') ?? 0, autoAppliedToday: Number(autoToday?.cnt ?? 0) };
}
