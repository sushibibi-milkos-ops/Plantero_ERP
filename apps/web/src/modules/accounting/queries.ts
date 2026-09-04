import 'server-only';
import type Decimal from 'decimal.js';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@plantero/db';
import { D, ZERO, round4, listPeriods as coreListPeriods, getAging as coreGetAging, STOCK_LINKED_REF_TYPES } from '@plantero/core';

const {
  invoices, invoiceLines, partners, products, salesChannels, payments, paymentAllocations,
  bankAccounts, bankTransactions, reconciliationMatches, journalEntries, journalLines, journals,
  accounts, vatPeriods, uoms,
} = schema;

/* ==================================================================== */
/* /muhasebe (özet)                                                     */
/* ==================================================================== */

export type AccountingDashboard = {
  bankDiffTry: string;
  openReceivable: string;
  openPayable: string;
  overdueReceivable: string;
  vatCarriedToNext: string;
  vatLastPeriod: string | null;
  unmatchedBankCount: number;
  openClosablePeriods: number;
};

export async function getDashboard(): Promise<AccountingDashboard> {
  const accts = await db.select().from(bankAccounts).where(eq(bankAccounts.isActive, true));
  let bankDiffTry = ZERO;
  for (const a of accts) {
    if (a.currency !== 'TRY') continue;
    const rows = await db
      .select({ debit: sql<string>`coalesce(sum(${journalLines.debit}), 0)`, credit: sql<string>`coalesce(sum(${journalLines.credit}), 0)` })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
      .where(and(eq(journalLines.ledger, 'VUK'), eq(journalLines.accountCode, a.accountCode), inArray(journalEntries.status, ['posted', 'reversed'])));
    const ledgerBalance = D(rows[0]?.debit).minus(D(rows[0]?.credit));
    bankDiffTry = bankDiffTry.plus(D(a.statementBalance).minus(ledgerBalance));
  }

  const [receivable] = await db.select({ sum: sql<string>`coalesce(sum(${invoices.residual}), 0)` }).from(invoices).where(and(eq(invoices.kind, 'sales'), inArray(invoices.status, ['posted', 'partially_paid'])));
  const [payable] = await db.select({ sum: sql<string>`coalesce(sum(${invoices.residual}), 0)` }).from(invoices).where(and(eq(invoices.kind, 'purchase'), inArray(invoices.status, ['posted', 'partially_paid'])));
  const [overdue] = await db.select({ sum: sql<string>`coalesce(sum(${invoices.residual}), 0)` }).from(invoices).where(and(eq(invoices.kind, 'sales'), inArray(invoices.status, ['posted', 'partially_paid']), sql`${invoices.dueDate} < current_date`));

  const [lastVat] = await db.select().from(vatPeriods).orderBy(desc(vatPeriods.period)).limit(1);

  const [unmatched] = await db.select({ cnt: sql<string>`count(*)` }).from(bankTransactions).where(inArray(bankTransactions.status, ['unmatched', 'suggested']));

  const periods = await coreListPeriods(db);
  const today = new Date().toISOString().slice(0, 10);
  const openClosablePeriods = periods.filter((p) => !p.isClosed && p.endDate < today).length;

  return {
    bankDiffTry: round4(bankDiffTry).toFixed(4),
    openReceivable: receivable?.sum ?? '0', openPayable: payable?.sum ?? '0', overdueReceivable: overdue?.sum ?? '0',
    vatCarriedToNext: lastVat?.carriedToNext ?? '0', vatLastPeriod: lastVat?.period ?? null,
    unmatchedBankCount: Number(unmatched?.cnt ?? 0), openClosablePeriods,
  };
}

/** UUID biçimi (v1-v5) — geçersiz `id` (ör. `/muhasebe/faturalar/yeni` gibi bir metin rota segmentinin
 *  yanlışlıkla `[id]` dinamik rotasına düşmesi) veritabanına gitmeden `null` döner; sayfa `notFound()`
 *  çağırır. Kök neden (tur 2 P0 muhasebe-faturalar-yeni-01): önceden `id='yeni'` doğrudan Postgres'e
 *  gidiyor, sorgu tip hatasıyla patlıyor ve hata sınırı ham SQL'i (dev derlemesinde) ekrana basıyordu. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

/** Vadesi geçmiş 8 satış faturası — /muhasebe özet ekranı (en gecikmiş önce). */
export type OverdueReceivableRow = { id: string; docNo: string; partnerName: string; dueDate: string; daysOverdue: number; residual: string; currency: string };
export async function getOverdueReceivables(limit = 8): Promise<OverdueReceivableRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({ i: invoices, partnerName: partners.name })
    .from(invoices)
    .innerJoin(partners, eq(partners.id, invoices.partnerId))
    .where(and(eq(invoices.kind, 'sales'), inArray(invoices.status, ['posted', 'partially_paid']), sql`${invoices.dueDate} < current_date`))
    .orderBy(asc(invoices.dueDate))
    .limit(limit);
  return rows.map((r) => ({
    id: r.i.id, docNo: r.i.docNo, partnerName: r.partnerName, dueDate: r.i.dueDate, currency: r.i.currency, residual: r.i.residual,
    daysOverdue: Math.round((new Date(today).getTime() - new Date(r.i.dueDate).getTime()) / 86_400_000),
  }));
}

/** Son 8 kaydedilmiş VUK yevmiye fişi — /muhasebe özet ekranı. */
export type RecentJournalEntryRow = { id: string; docNo: string; description: string; entryDate: string; totalDebit: string };
export async function getRecentJournalEntries(limit = 8): Promise<RecentJournalEntryRow[]> {
  const rows = await db
    .select({ e: journalEntries })
    .from(journalEntries)
    .where(and(eq(journalEntries.ledger, 'VUK'), eq(journalEntries.status, 'posted')))
    .orderBy(desc(journalEntries.entryDate), desc(journalEntries.createdAt))
    .limit(limit);
  return rows.map((r) => ({ id: r.e.id, docNo: r.e.docNo, description: r.e.description, entryDate: r.e.entryDate, totalDebit: r.e.totalDebit }));
}

/* ==================================================================== */
/* /muhasebe/faturalar                                                  */
/* ==================================================================== */

export type InvoiceRow = {
  id: string; docNo: string; kind: string; status: string; partnerId: string; partnerName: string; channelName: string | null;
  invoiceDate: string; dueDate: string; currency: string; grandTotal: string; residual: string;
  eInvoiceType: string; eInvoiceStatus: string; daysOverdue: number;
};

export async function listInvoices(kinds: Array<'sales' | 'purchase' | 'sales_return' | 'purchase_return'>): Promise<InvoiceRow[]> {
  const rows = await db
    .select({ i: invoices, partnerName: partners.name, channelName: salesChannels.name })
    .from(invoices)
    .innerJoin(partners, eq(partners.id, invoices.partnerId))
    .leftJoin(salesChannels, eq(salesChannels.id, invoices.channelId))
    .where(inArray(invoices.kind, kinds))
    .orderBy(desc(invoices.invoiceDate), desc(invoices.createdAt));
  const today = new Date().toISOString().slice(0, 10);
  return rows.map((r) => ({
    id: r.i.id, docNo: r.i.docNo, kind: r.i.kind, status: r.i.status, partnerId: r.i.partnerId, partnerName: r.partnerName,
    channelName: r.channelName, invoiceDate: r.i.invoiceDate, dueDate: r.i.dueDate, currency: r.i.currency, grandTotal: r.i.grandTotal,
    residual: r.i.residual, eInvoiceType: r.i.eInvoiceType, eInvoiceStatus: r.i.eInvoiceStatus,
    daysOverdue: D(r.i.residual).gt(0) && r.i.dueDate < today ? Math.round((new Date(today).getTime() - new Date(r.i.dueDate).getTime()) / 86_400_000) : 0,
  }));
}

export type InvoiceLineRow = { id: string; productName: string | null; description: string; qty: string; uomCode: string | null; unitPrice: string; vatRate: string; lineSubtotal: string; lineVat: string; lineTotal: string; accountCode: string | null; lotId: string | null };
export type InvoiceDetail = {
  invoice: typeof invoices.$inferSelect;
  partner: typeof partners.$inferSelect;
  lines: InvoiceLineRow[];
  payments: Array<{ id: string; docNo: string; direction: string; paymentDate: string; amount: string; allocatedAmount: string }>;
  linkedCreditNoteId: string | null;
  sourceInvoiceId: string | null;
};

export async function getInvoiceDetail(id: string): Promise<InvoiceDetail | null> {
  if (!isUuid(id)) return null;
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!invoice) return null;
  const [partner] = await db.select().from(partners).where(eq(partners.id, invoice.partnerId)).limit(1);
  // uoms join (kritik bulgu, kriter 6 — muhasebe-fatura-detay-04): invoiceLines.uomId zaten var,
  // şema değişikliği gerekmez; birim kodu (KG/ADET/LT…) olmadan "Miktar" hücresi birimsiz ("5")
  // basılıyordu, aynı satırdaki tutar/birim fiyat hücreleri para birimiyle geliyordu.
  const lineRows = await db
    .select({ l: invoiceLines, productName: products.name, uomCode: uoms.code })
    .from(invoiceLines)
    .leftJoin(products, eq(products.id, invoiceLines.productId))
    .leftJoin(uoms, eq(uoms.id, invoiceLines.uomId))
    .where(eq(invoiceLines.invoiceId, id))
    .orderBy(asc(invoiceLines.sequence));

  const allocRows = await db
    .select({ p: payments, allocAmount: paymentAllocations.amount })
    .from(paymentAllocations)
    .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
    .where(eq(paymentAllocations.invoiceId, id))
    .orderBy(desc(payments.paymentDate));

  const { documentLinks } = schema;
  const [asSource] = await db.select({ targetId: documentLinks.targetId }).from(documentLinks).where(and(eq(documentLinks.sourceType, 'invoice'), eq(documentLinks.sourceId, id), eq(documentLinks.targetType, 'invoice'))).limit(1);
  const [asTarget] = await db.select({ sourceId: documentLinks.sourceId }).from(documentLinks).where(and(eq(documentLinks.targetType, 'invoice'), eq(documentLinks.targetId, id), eq(documentLinks.sourceType, 'invoice'))).limit(1);

  return {
    invoice, partner: partner!,
    lines: lineRows.map((r) => ({ id: r.l.id, productName: r.productName, description: r.l.description, qty: r.l.qty, uomCode: r.uomCode, unitPrice: r.l.unitPrice, vatRate: r.l.vatRate, lineSubtotal: r.l.lineSubtotal, lineVat: r.l.lineVat, lineTotal: r.l.lineTotal, accountCode: r.l.accountCode, lotId: r.l.lotId })),
    payments: allocRows.map((r) => ({ id: r.p.id, docNo: r.p.docNo, direction: r.p.direction, paymentDate: r.p.paymentDate, amount: r.p.amount, allocatedAmount: r.allocAmount })),
    linkedCreditNoteId: asSource?.targetId ?? null, sourceInvoiceId: asTarget?.sourceId ?? null,
  };
}

export async function listSuppliersForExpense() {
  return db.select({ id: partners.id, code: partners.code, name: partners.name, paymentTermDays: partners.paymentTermDays }).from(partners).where(and(inArray(partners.kind, ['supplier', 'both']), eq(partners.isActive, true))).orderBy(asc(partners.name));
}

export type ExpenseAccountOption = { code: string; name: string };
/** Gider faturası / banka mutabakatı "gider hesabı seç" alanları için — yalnızca 7XX gider hesapları (621 SMM gibi maliyet hesapları hariç, onlar yalnızca sevkiyattan otomatik doğar). */
export async function listExpenseAccounts(): Promise<ExpenseAccountOption[]> {
  const rows = await db.select({ code: accounts.code, name: accounts.name }).from(accounts).where(and(eq(accounts.type, 'expense'), eq(accounts.isPostable, true))).orderBy(asc(accounts.code));
  return rows;
}

/* ==================================================================== */
/* /muhasebe/tahsilatlar                                                */
/* ==================================================================== */

export type AccountingPaymentRow = {
  id: string; docNo: string; direction: 'inbound' | 'outbound'; method: string; status: string; partnerName: string;
  paymentDate: string; currency: string; amount: string; amountTry: string; allocatedAmount: string; unallocatedAmount: string; fxDifference: string;
};

export async function listAccountingPayments(): Promise<AccountingPaymentRow[]> {
  const rows = await db.select({ p: payments, partnerName: partners.name }).from(payments).innerJoin(partners, eq(partners.id, payments.partnerId)).orderBy(desc(payments.paymentDate), desc(payments.createdAt));
  return rows.map((r) => ({ id: r.p.id, docNo: r.p.docNo, direction: r.p.direction, method: r.p.method, status: r.p.status, partnerName: r.partnerName, paymentDate: r.p.paymentDate, currency: r.p.currency, amount: r.p.amount, amountTry: r.p.amountTry, allocatedAmount: r.p.allocatedAmount, unallocatedAmount: r.p.unallocatedAmount, fxDifference: r.p.fxDifference }));
}

export type OpenInvoiceRow = { id: string; docNo: string; invoiceDate: string; dueDate: string; currency: string; grandTotal: string; residual: string };

export async function listOpenInvoicesForPartner(partnerId: string, direction: 'inbound' | 'outbound'): Promise<OpenInvoiceRow[]> {
  const kinds = direction === 'inbound' ? (['sales', 'sales_return'] as const) : (['purchase', 'purchase_return'] as const);
  const rows = await db
    .select().from(invoices)
    .where(and(eq(invoices.partnerId, partnerId), inArray(invoices.kind, kinds), inArray(invoices.status, ['posted', 'partially_paid']), sql`${invoices.residual} > 0`))
    .orderBy(asc(invoices.dueDate));
  return rows.map((r) => ({ id: r.id, docNo: r.docNo, invoiceDate: r.invoiceDate, dueDate: r.dueDate, currency: r.currency, grandTotal: r.grandTotal, residual: r.residual }));
}

export async function listPartnersForDirection(direction: 'inbound' | 'outbound') {
  const kinds = direction === 'inbound' ? (['customer', 'both'] as const) : (['supplier', 'both'] as const);
  return db.select({ id: partners.id, code: partners.code, name: partners.name, currency: partners.currency, kind: partners.kind }).from(partners).where(and(inArray(partners.kind, kinds), eq(partners.isActive, true))).orderBy(asc(partners.name));
}

export async function listBankAccountsForForm() {
  return db.select({ id: bankAccounts.id, code: bankAccounts.code, bankName: bankAccounts.bankName, currency: bankAccounts.currency }).from(bankAccounts).where(eq(bankAccounts.isActive, true)).orderBy(asc(bankAccounts.code));
}

/* ==================================================================== */
/* /muhasebe/banka + /muhasebe/mutabakat                                */
/* ==================================================================== */

export type BankAccountSummary = { id: string; code: string; bankName: string; branch: string | null; currency: string; accountCode: string; statementBalance: string; ledgerBalanceVuk: string; diff: string; unmatchedCount: number; lastSyncedAt: Date | null };

export async function listBankAccountsSummary(): Promise<BankAccountSummary[]> {
  const accts = await db.select().from(bankAccounts).orderBy(asc(bankAccounts.code));
  const unmatchedAgg = await db.select({ bankAccountId: bankTransactions.bankAccountId, cnt: sql<string>`count(*)` }).from(bankTransactions).where(inArray(bankTransactions.status, ['unmatched', 'suggested'])).groupBy(bankTransactions.bankAccountId);
  const unmatchedByAccount = new Map(unmatchedAgg.map((r) => [r.bankAccountId, Number(r.cnt)]));

  const out: BankAccountSummary[] = [];
  for (const a of accts) {
    const rows = await db
      .select({ debit: sql<string>`coalesce(sum(${journalLines.debit}), 0)`, credit: sql<string>`coalesce(sum(${journalLines.credit}), 0)` })
      .from(journalLines).innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
      .where(and(eq(journalLines.ledger, 'VUK'), eq(journalLines.accountCode, a.accountCode), inArray(journalEntries.status, ['posted', 'reversed'])));
    const ledgerBalance = D(rows[0]?.debit).minus(D(rows[0]?.credit));
    out.push({ id: a.id, code: a.code, bankName: a.bankName, branch: a.branch, currency: a.currency, accountCode: a.accountCode, statementBalance: a.statementBalance, ledgerBalanceVuk: ledgerBalance.toFixed(4), diff: D(a.statementBalance).minus(ledgerBalance).toFixed(4), unmatchedCount: unmatchedByAccount.get(a.id) ?? 0, lastSyncedAt: a.lastSyncedAt });
  }
  return out;
}

export type BankTransactionRow = { id: string; bankAccountId: string; bankAccountCode: string; externalRef: string; txDate: string; amount: string; currency: string; description: string; counterpartyName: string | null; status: string };

export async function listBankTransactionsFor(bankAccountId?: string): Promise<BankTransactionRow[]> {
  const rows = await db.select({ bt: bankTransactions, accountCode: bankAccounts.code }).from(bankTransactions).innerJoin(bankAccounts, eq(bankAccounts.id, bankTransactions.bankAccountId)).where(bankAccountId ? eq(bankTransactions.bankAccountId, bankAccountId) : undefined).orderBy(desc(bankTransactions.txDate), desc(bankTransactions.createdAt)).limit(500);
  return rows.map((r) => ({ id: r.bt.id, bankAccountId: r.bt.bankAccountId, bankAccountCode: r.accountCode, externalRef: r.bt.externalRef, txDate: r.bt.txDate, amount: r.bt.amount, currency: r.bt.currency, description: r.bt.description, counterpartyName: r.bt.counterpartyName, status: r.bt.status }));
}

export type ReconciliationCandidateView = {
  matchId: string; kind: string; confidence: string; rationale: string | null; partnerName: string | null;
  invoiceDocNos: string[]; expenseAccountCode: string | null; loanCode: string | null; source: string;
};

export type ReconciliationQueueItem = {
  bankTransactionId: string; bankAccountCode: string; txDate: string; description: string; counterpartyName: string | null; amount: string; currency: string;
  /** En iyi (güven en yüksek) aday önce — onay ekranı ana kart olarak bunu gösterir, gerisini "alternatif" listeler. */
  candidates: ReconciliationCandidateView[];
};

/** Onay ekranı kuyruğu: her `suggested` durumundaki banka hareketi + o hareketin TÜM aday eşleşmeleri (hangi motor ürettiyse), güvene göre azalan. */
export async function listReconciliationQueue(): Promise<ReconciliationQueueItem[]> {
  const rows = await db
    .select({ m: reconciliationMatches, bt: bankTransactions, accountCode: bankAccounts.code, partnerName: partners.name })
    .from(reconciliationMatches)
    .innerJoin(bankTransactions, eq(bankTransactions.id, reconciliationMatches.bankTransactionId))
    .innerJoin(bankAccounts, eq(bankAccounts.id, bankTransactions.bankAccountId))
    .leftJoin(partners, eq(partners.id, reconciliationMatches.partnerId))
    .where(eq(reconciliationMatches.status, 'suggested'))
    .orderBy(desc(reconciliationMatches.confidence));

  const invoiceIds = Array.from(new Set(rows.flatMap((r) => r.m.invoiceIds ?? [])));
  const docNoById = invoiceIds.length ? new Map((await db.select({ id: invoices.id, docNo: invoices.docNo }).from(invoices).where(inArray(invoices.id, invoiceIds))).map((i) => [i.id, i.docNo])) : new Map<string, string>();

  const { loans, loanInstallments } = schema;
  const loanInstIds = Array.from(new Set(rows.map((r) => r.m.loanInstallmentId).filter((v): v is string => Boolean(v))));
  const loanCodeByInstId = new Map<string, string>();
  if (loanInstIds.length) {
    const loanRows = await db.select({ id: loanInstallments.id, code: loans.code }).from(loanInstallments).innerJoin(loans, eq(loans.id, loanInstallments.loanId)).where(inArray(loanInstallments.id, loanInstIds));
    for (const r of loanRows) loanCodeByInstId.set(r.id, r.code);
  }

  const byBt = new Map<string, ReconciliationQueueItem>();
  for (const r of rows) {
    let item = byBt.get(r.bt.id);
    if (!item) {
      item = { bankTransactionId: r.bt.id, bankAccountCode: r.accountCode, txDate: r.bt.txDate, description: r.bt.description, counterpartyName: r.bt.counterpartyName, amount: r.bt.amount, currency: r.bt.currency, candidates: [] };
      byBt.set(r.bt.id, item);
    }
    item.candidates.push({
      matchId: r.m.id, kind: r.m.kind, confidence: r.m.confidence, rationale: r.m.rationale, partnerName: r.partnerName,
      invoiceDocNos: (r.m.invoiceIds ?? []).map((id) => docNoById.get(id)).filter((v): v is string => Boolean(v)),
      expenseAccountCode: r.m.expenseAccountCode, loanCode: r.m.loanInstallmentId ? (loanCodeByInstId.get(r.m.loanInstallmentId) ?? null) : null, source: r.m.source,
    });
  }
  return Array.from(byBt.values()).sort((a, b) => Number(b.candidates[0]?.confidence ?? 0) - Number(a.candidates[0]?.confidence ?? 0));
}

export type ReconciliationSummary = { suggestedTotal: number; autoAppliedToday: number; approvedToday: number };
export async function getReconciliationSummaryToday(): Promise<ReconciliationSummary> {
  // Kök neden (tur 2 P1 muhasebe-banka-03 / muhasebe-mutabakat-02): `count(*)` her EŞLEŞMEyi
  // (reconciliation_matches) sayıyordu — bir banka hareketinin birden fazla adayı (öneri) olabilir,
  // onay ekranında ise hareket başına TEK kart gösterilir. Sonuç: banner "12 hareket onay bekliyor"
  // diyor, kuyrukta (listReconciliationQueue, hareket bazlı gruplu) 7 kart görünüyordu.
  // `count(distinct bank_transaction_id)` kuyruktaki gerçek kart sayısıyla birebir eşleşir.
  const [suggested] = await db.select({ cnt: sql<string>`count(distinct ${reconciliationMatches.bankTransactionId})` }).from(reconciliationMatches).where(eq(reconciliationMatches.status, 'suggested'));
  const [autoToday] = await db.select({ cnt: sql<string>`count(*)` }).from(reconciliationMatches).where(and(eq(reconciliationMatches.status, 'auto_applied'), sql`${reconciliationMatches.decidedAt} >= current_date`));
  const [approvedToday] = await db.select({ cnt: sql<string>`count(*)` }).from(reconciliationMatches).where(and(eq(reconciliationMatches.status, 'approved'), sql`${reconciliationMatches.decidedAt} >= current_date`));
  return { suggestedTotal: Number(suggested?.cnt ?? 0), autoAppliedToday: Number(autoToday?.cnt ?? 0), approvedToday: Number(approvedToday?.cnt ?? 0) };
}

export type ReconciliationHistoryRow = { id: string; txDate: string; description: string; amount: string; kind: string; status: string; confidence: string; decidedAt: Date | null; rationale: string | null };
export async function listReconciliationHistory(): Promise<ReconciliationHistoryRow[]> {
  const rows = await db
    .select({ m: reconciliationMatches, bt: bankTransactions })
    .from(reconciliationMatches)
    .innerJoin(bankTransactions, eq(bankTransactions.id, reconciliationMatches.bankTransactionId))
    .where(inArray(reconciliationMatches.status, ['auto_applied', 'approved', 'rejected']))
    .orderBy(desc(reconciliationMatches.decidedAt))
    .limit(100);
  return rows.map((r) => ({ id: r.m.id, txDate: r.bt.txDate, description: r.bt.description, amount: r.bt.amount, kind: r.m.kind, status: r.m.status, confidence: r.m.confidence, decidedAt: r.m.decidedAt, rationale: r.m.rationale }));
}

/* ==================================================================== */
/* /muhasebe/yevmiye                                                    */
/* ==================================================================== */

export type JournalEntryRow = { id: string; docNo: string; ledger: string; journalCode: string; entryDate: string; description: string; totalDebit: string; totalCredit: string; status: string; refType: string | null; refId: string | null; partnerName: string | null };

export async function listJournalEntries(opts: { ledger: 'VUK' | 'UFRS'; journalCode?: string; from?: string; to?: string } ): Promise<JournalEntryRow[]> {
  const conds = [eq(journalEntries.ledger, opts.ledger)];
  if (opts.from) conds.push(sql`${journalEntries.entryDate} >= ${opts.from}`);
  if (opts.to) conds.push(sql`${journalEntries.entryDate} <= ${opts.to}`);
  const rows = await db
    .select({ e: journalEntries, journalCode: journals.code, partnerName: partners.name })
    .from(journalEntries)
    .innerJoin(journals, eq(journals.id, journalEntries.journalId))
    .leftJoin(partners, eq(partners.id, journalEntries.partnerId))
    .where(opts.journalCode ? and(...conds, eq(journals.code, opts.journalCode)) : and(...conds))
    .orderBy(desc(journalEntries.entryDate), desc(journalEntries.createdAt))
    .limit(500);
  return rows.map((r) => ({ id: r.e.id, docNo: r.e.docNo, ledger: r.e.ledger, journalCode: r.journalCode, entryDate: r.e.entryDate, description: r.e.description, totalDebit: r.e.totalDebit, totalCredit: r.e.totalCredit, status: r.e.status, refType: r.e.refType, refId: r.e.refId, partnerName: r.partnerName }));
}

export type JournalLineRow = { id: string; accountCode: string; accountName: string | null; partnerName: string | null; description: string | null; debit: string; credit: string };
export type JournalEntryDetail = { entry: typeof journalEntries.$inferSelect; journalCode: string; lines: JournalLineRow[]; twin: { id: string; ledger: string; refType: string | null } | null; stockLinkedRefType: string | null };

export async function getJournalEntryDetail(id: string): Promise<JournalEntryDetail | null> {
  if (!isUuid(id)) return null;
  const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, id)).limit(1);
  if (!entry) return null;
  const [journal] = await db.select({ code: journals.code }).from(journals).where(eq(journals.id, entry.journalId)).limit(1);
  const lineRows = await db
    .select({ l: journalLines, accountName: accounts.name, partnerName: partners.name })
    .from(journalLines)
    .leftJoin(accounts, eq(accounts.id, journalLines.accountId))
    .leftJoin(partners, eq(partners.id, journalLines.partnerId))
    .where(eq(journalLines.entryId, id))
    .orderBy(asc(journalLines.sequence));
  // refType (P0 kök neden — kritik bulgu, ReverseJournalButton UI ikincil savunması): ikiz fişin
  // refType'i de gerekiyor — VUK fişi kaynaksız görünse bile UFRS ikizi stok kaynaklı olabilir
  // (ya da tersi), guard ikisini de kontrol eder (bkz. reverse-journal-button.tsx).
  let twin: { id: string; ledger: string; refType: string | null } | null = null;
  if (entry.twinEntryId) {
    const [t] = await db.select({ id: journalEntries.id, ledger: journalEntries.ledger, refType: journalEntries.refType }).from(journalEntries).where(eq(journalEntries.id, entry.twinEntryId)).limit(1);
    twin = t ?? null;
  }
  // stockLinkedRefType (P0 kök neden — kritik bulgu, ReverseJournalButton UI ikincil savunması):
  // `entry`/`twin`'den hangisi fiziksel stok hareketinden üretilmişse o refType burada hesaplanır
  // — 'use client' bileşeni (reverse-journal-button.tsx) `@plantero/core`'un aggregate index'ini
  // (db/audit bağımlılıkları, node:crypto dahil) ASLA import etmemeli, bu yüzden karar SUNUCUDA
  // (bu dosya `server-only`) verilir ve hazır bir bayrak olarak geçirilir.
  const stockLinkedRefType = (entry.refType && STOCK_LINKED_REF_TYPES.has(entry.refType) ? entry.refType : null) ?? (twin?.refType && STOCK_LINKED_REF_TYPES.has(twin.refType) ? twin.refType : null);

  return {
    entry, journalCode: journal?.code ?? '—',
    lines: lineRows.map((r) => ({ id: r.l.id, accountCode: r.l.accountCode, accountName: r.accountName, partnerName: r.partnerName, description: r.l.description, debit: r.l.debit, credit: r.l.credit })),
    twin,
    stockLinkedRefType,
  };
}

export async function listJournalsForForm() {
  return db.select({ id: journals.id, code: journals.code, name: journals.name }).from(journals).orderBy(asc(journals.code));
}

export async function listPostableAccountsForForm() {
  return db.select({ code: accounts.code, name: accounts.name, type: accounts.type, isPartnerAccount: accounts.isPartnerAccount }).from(accounts).where(eq(accounts.isPostable, true)).orderBy(asc(accounts.code));
}

/* ==================================================================== */
/* /muhasebe/hesap-plani + /muhasebe/mizan                              */
/* ==================================================================== */

export type ChartAccountRow = { code: string; name: string; type: string; parentCode: string | null; ifrsCode: string | null; isPostable: boolean; isPartnerAccount: boolean; balanceVuk: string; balanceUfrs: string };

export async function getChartOfAccounts(): Promise<ChartAccountRow[]> {
  const accts = await db.select().from(accounts).where(eq(accounts.isActive, true)).orderBy(asc(accounts.code));
  const balRows = await db
    .select({ code: journalLines.accountCode, ledger: journalLines.ledger, debit: sql<string>`coalesce(sum(${journalLines.debit}), 0)`, credit: sql<string>`coalesce(sum(${journalLines.credit}), 0)` })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(inArray(journalEntries.status, ['posted', 'reversed']))
    .groupBy(journalLines.accountCode, journalLines.ledger);
  const balByCode = new Map<string, { vuk: Decimal; ufrs: Decimal }>();
  for (const r of balRows) {
    const cur = balByCode.get(r.code) ?? { vuk: ZERO, ufrs: ZERO };
    const net = D(r.debit).minus(D(r.credit));
    if (r.ledger === 'VUK') cur.vuk = cur.vuk.plus(net); else cur.ufrs = cur.ufrs.plus(net);
    balByCode.set(r.code, cur);
  }
  return accts.map((a) => {
    const bal = balByCode.get(a.code) ?? { vuk: ZERO, ufrs: ZERO };
    return { code: a.code, name: a.name, type: a.type, parentCode: a.parentCode, ifrsCode: a.ifrsCode, isPostable: a.isPostable, isPartnerAccount: a.isPartnerAccount, balanceVuk: bal.vuk.toFixed(4), balanceUfrs: bal.ufrs.toFixed(4) };
  });
}

export type TrialBalanceRow = { code: string; name: string; type: string; debit: string; credit: string; balance: string };

export async function getTrialBalance(ledger: 'VUK' | 'UFRS'): Promise<TrialBalanceRow[]> {
  const rows = await db
    .select({ code: journalLines.accountCode, debit: sql<string>`coalesce(sum(${journalLines.debit}), 0)`, credit: sql<string>`coalesce(sum(${journalLines.credit}), 0)` })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(and(eq(journalLines.ledger, ledger), inArray(journalEntries.status, ['posted', 'reversed'])))
    .groupBy(journalLines.accountCode);
  const accountByCode = new Map((await db.select().from(accounts)).map((a) => [a.code, a]));
  return rows
    .map((r) => {
      const acc = accountByCode.get(r.code);
      return { code: r.code, name: acc?.name ?? r.code, type: acc?.type ?? 'asset', debit: r.debit, credit: r.credit, balance: D(r.debit).minus(D(r.credit)).toFixed(4) };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

/* ==================================================================== */
/* /muhasebe/kdv                                                        */
/* ==================================================================== */

export type VatPeriodRow = typeof vatPeriods.$inferSelect;
export async function listVatPeriods(): Promise<VatPeriodRow[]> {
  return db.select().from(vatPeriods).orderBy(desc(vatPeriods.period)).limit(24);
}

export async function getVatCarryforwardSeries(): Promise<Array<{ period: string; carriedToNext: string; outputVat: string; inputVat: string }>> {
  const rows = await db.select().from(vatPeriods).orderBy(asc(vatPeriods.period)).limit(24);
  return rows.map((r) => ({ period: r.period, carriedToNext: r.carriedToNext, outputVat: r.outputVat, inputVat: r.inputVat }));
}

/** Bu ay ve önceki 2 ayı — "Dönemi hesapla" seçici için (henüz hesaplanmamışlar dahil) */
export async function listComputableVatPeriods(): Promise<string[]> {
  const now = new Date();
  const out: string[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/* ==================================================================== */
/* /muhasebe/donemler                                                   */
/* ==================================================================== */

export async function listFiscalPeriods() {
  return coreListPeriods(db);
}

/* ==================================================================== */
/* /muhasebe/cariler/[id]/ekstre                                        */
/* ==================================================================== */

export type StatementLine = { date: string; kind: 'invoice' | 'payment'; docNo: string; description: string; debit: string; credit: string; runningBalance: string };
export type PartnerStatement = { partner: typeof partners.$inferSelect; lines: StatementLine[]; aging: Awaited<ReturnType<typeof coreGetAging>> | null };

export async function getPartnerStatement(partnerId: string): Promise<PartnerStatement | null> {
  const [partner] = await db.select().from(partners).where(eq(partners.id, partnerId)).limit(1);
  if (!partner) return null;

  const isCustomer = partner.kind === 'customer' || partner.kind === 'both';
  const rows = await db
    .select({ l: journalLines, e: journalEntries })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(and(eq(journalLines.ledger, 'VUK'), eq(journalLines.partnerId, partnerId), inArray(journalEntries.refType, ['invoice', 'payment']), inArray(journalEntries.status, ['posted', 'reversed'])))
    .orderBy(asc(journalEntries.entryDate), asc(journalEntries.createdAt));

  let running = ZERO;
  const lines: StatementLine[] = rows.map((r) => {
    const debit = D(r.l.debit);
    const credit = D(r.l.credit);
    running = running.plus(debit).minus(credit);
    return {
      date: r.e.entryDate, kind: r.e.refType === 'invoice' ? 'invoice' : 'payment', docNo: r.e.refNo ?? r.e.docNo,
      description: r.e.description, debit: debit.toFixed(4), credit: credit.toFixed(4), runningBalance: running.toFixed(4),
    };
  });
  const aging = isCustomer ? await coreGetAging(db, { partnerId, kind: 'sales' }) : null;
  return { partner, lines, aging };
}
