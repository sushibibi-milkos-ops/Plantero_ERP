import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import {
  bankAccounts, bankTransactions, reconciliationMatches, reconciliationLearnings,
  invoices, partners, loans, loanInstallments, type DbOrTx,
} from '@plantero/db';
import { D, toDb, round4 } from '../money.js';
import { businessDate } from '../dates.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import { writeAudit } from '../audit/index.js';
import { postJournalEntry, type JournalLineInput } from '../accounting/journal.js';
import { recordPayment } from '../finance/payments.js';
import { postLoanInstallmentPayment } from '../finance/loans.js';
import type { ActorCtx } from '../types.js';

/**
 * AI Mutabakat Ajanı — `docs/modules/muhasebe.md` `/muhasebe/mutabakat` (sabah onay ekranı) +
 * `/muhasebe/banka`. `finance/bankReconciliation.ts` (tur 8) yalnızca fatura (kind='invoice')
 * eşleştirir ve kendi kural tabanlı skorlayıcısını kullanır — muhasebe modülü sözleşmesi daha geniş
 * bir kapsam ister: cari avans, kredi taksiti, gider/banka masrafı, öğrenilmiş desen, VE
 * `@plantero/ai matchBankTransaction` (varsa gerçek AI, yoksa kural tabanlı fallback — bkz.
 * `packages/ai/src/reconciliation.ts`). `packages/core` hiçbir entegrasyon/AI paketini import ETMEZ
 * (workspace bağımlılık kuralı — bkz. `einvoice.ts` başlık yorumu); bu yüzden eşleştirme SKORLAMASI
 * web katmanında (`apps/web/src/modules/accounting/actions.ts`) yapılır, bu dosya yalnızca:
 *
 *   1) aday verisini toplar (`buildCandidates`),
 *   2) web katmanının ürettiği sonuçları KALICI hale getirir + gerekiyorsa OTOMATİK UYGULAR
 *      (`persistAndApply` — güven ≥0.92 VE tek (belirsizliksiz) aday ise `auto_applied`),
 *   3) onay ekranının aksiyonlarını sağlar (`approveReconciliationMatch`/`rejectReconciliationMatch`/`manualReconciliationMatch`/`ignoreBankTransaction`).
 *
 * `finance/bankReconciliation.ts`'in kendi akışına (worker `reconciliation-nightly`, `/finans/banka`)
 * DOKUNULMAZ — aynı `bank_transactions`/`reconciliation_matches` tablolarını paylaşırlar (finans
 * modülünün ürettiği `kind='invoice'` öneriler de bu ekranın `approveReconciliationMatch`'i ile aynı biçimde
 * onaylanabilir/reddedilebilir — kind bazlı jenerik dispatch), yalnızca hâlâ `status='unmatched'`
 * kalan hareketleri (bir motorun zaten işlediği hareket ikinci motor tarafından bir daha
 * DEĞERLENDİRİLMEZ — `status` alanı doğal bir kilit görevi görür) işler; iki motor arasında yarış/
 * çakışma riski yoktur.
 */

/* ------------------------------------------------------------------ */
/* Aday türleri (web katmanının `@plantero/ai` çağrısına aktardığı şekil) */
/* ------------------------------------------------------------------ */

export type ReconciliationTx = {
  id: string; bankAccountId: string; description: string; amount: string; currency: string;
  counterpartyName: string | null; counterpartyIban: string | null; txDate: string; txType: string | null;
};

export type ReconciliationInvoiceCandidate = { id: string; docNo: string; partnerId: string; partnerName: string; residual: string; dueDate: string; kind: 'sales' | 'purchase' };
export type ReconciliationPartnerCandidate = { id: string; name: string };
export type ReconciliationLoanInstallmentCandidate = { id: string; loanId: string; loanCode: string; dueDate: string; installment: string };
export type ReconciliationLearningCandidate = { pattern: string; patternKind: 'description' | 'iban' | 'counterparty'; partnerId?: string | null; expenseAccountCode?: string | null; matchKind: string; hits: number };

export type ReconciliationCandidates = {
  tx: ReconciliationTx;
  invoices: ReconciliationInvoiceCandidate[];
  partners: ReconciliationPartnerCandidate[];
  loanInstallments: ReconciliationLoanInstallmentCandidate[];
  learnings: ReconciliationLearningCandidate[];
};

/** Bir banka hareketi için: açık faturalar (yönüne uygun), cariler, vadesi gelmemiş kredi taksitleri, öğrenilmiş desenler. */
export async function buildCandidates(tx: DbOrTx, bankTransactionId: string): Promise<ReconciliationCandidates> {
  const [bt] = await tx.select().from(bankTransactions).where(eq(bankTransactions.id, bankTransactionId)).limit(1);
  if (!bt) throw new NotFoundError('Banka hareketi', bankTransactionId);

  const isInbound = D(bt.amount).gt(0);
  const invKinds: Array<'sales' | 'purchase'> = isInbound ? ['sales'] : ['purchase'];
  const partnerKinds: Array<'customer' | 'supplier' | 'both'> = isInbound ? ['customer', 'both'] : ['supplier', 'both'];

  const invRows = await tx
    .select({ i: invoices, partnerName: partners.name })
    .from(invoices)
    .innerJoin(partners, eq(partners.id, invoices.partnerId))
    .where(and(inArray(invoices.kind, invKinds), inArray(invoices.status, ['posted', 'partially_paid']), eq(invoices.currency, bt.currency), sql`${invoices.residual} > 0`));

  const partnerRows = await tx
    .select({ id: partners.id, name: partners.name })
    .from(partners)
    .where(and(inArray(partners.kind, partnerKinds), eq(partners.isActive, true)));

  const loanRows = !isInbound
    ? await tx
        .select({ li: loanInstallments, loanCode: loans.code })
        .from(loanInstallments)
        .innerJoin(loans, eq(loans.id, loanInstallments.loanId))
        .where(and(eq(loanInstallments.status, 'scheduled'), eq(loans.isActive, true)))
    : [];

  const learningRows = await tx.select().from(reconciliationLearnings);

  return {
    tx: { id: bt.id, bankAccountId: bt.bankAccountId, description: bt.description, amount: bt.amount, currency: bt.currency, counterpartyName: bt.counterpartyName, counterpartyIban: bt.counterpartyIban, txDate: bt.txDate, txType: bt.txType },
    invoices: invRows.map((r) => ({ id: r.i.id, docNo: r.i.docNo, partnerId: r.i.partnerId, partnerName: r.partnerName, residual: r.i.residual, dueDate: r.i.dueDate, kind: r.i.kind as 'sales' | 'purchase' })),
    partners: partnerRows,
    loanInstallments: loanRows.map((r) => ({ id: r.li.id, loanId: r.li.loanId, loanCode: r.loanCode, dueDate: r.li.dueDate, installment: r.li.installment })),
    learnings: learningRows.map((r) => ({ pattern: r.pattern, patternKind: r.patternKind as 'description' | 'iban' | 'counterparty', partnerId: r.partnerId, expenseAccountCode: r.expenseAccountCode, matchKind: r.matchKind, hits: r.hits })),
  };
}

/** Toplu: bir hesabın/ithalatın hâlâ `unmatched` kalan hareketleri (web katmanı her biri için `buildCandidates` + AI çağırır). */
export async function listUnmatchedTransactions(tx: DbOrTx, opts: { bankAccountId?: string; importId?: string; since?: string | Date } = {}): Promise<Array<typeof bankTransactions.$inferSelect>> {
  const conds = [eq(bankTransactions.status, 'unmatched')];
  if (opts.bankAccountId) conds.push(eq(bankTransactions.bankAccountId, opts.bankAccountId));
  if (opts.importId) conds.push(eq(bankTransactions.importId, opts.importId));
  if (opts.since) conds.push(gte(bankTransactions.txDate, businessDate(opts.since)));
  return tx.select().from(bankTransactions).where(and(...conds));
}

/* ------------------------------------------------------------------ */
/* Eşleşme kalıcılaştırma + uygulama                                    */
/* ------------------------------------------------------------------ */

export type ReconciliationMatchKind = 'invoice' | 'partner_on_account' | 'loan_installment' | 'expense' | 'transfer' | 'marketplace_payout' | 'tax' | 'fee' | 'unknown';
export type ReconciliationMatchSource = 'ai' | 'rule' | 'learned' | 'manual';

export type ReconciliationMatchInput = {
  kind: ReconciliationMatchKind;
  partnerId?: string | null;
  invoiceIds?: string[];
  allocations?: Array<{ invoiceId: string; amount: Decimal | string }>;
  loanInstallmentId?: string | null;
  expenseAccountCode?: string | null;
  confidence: number; // 0-1
  rationale: string;
  features?: Record<string, unknown>;
  source: ReconciliationMatchSource;
};

/** Otomatik uygulama tetiklenebilen türler (transfer/marketplace_payout/tax/unknown yalnızca elle işlenir). */
const AUTO_APPLICABLE_KINDS: ReadonlySet<ReconciliationMatchKind> = new Set(['invoice', 'partner_on_account', 'loan_installment', 'expense', 'fee']);
/** Otomatik uygulama eşiği (muhasebe.md: "güven ≥0.92 ve tek aday") */
export const RECONCILIATION_AUTO_APPLY_THRESHOLD = 0.92;

/** En iyi aday güven ≥ eşik VE ikinciyle belirgin fark (≥0.15) varsa "tek/belirsizliksiz" sayılır. */
export function isAutoApplicable(matches: ReconciliationMatchInput[]): boolean {
  if (!matches.length) return false;
  const sorted = [...matches].sort((a, b) => b.confidence - a.confidence);
  const best = sorted[0]!;
  if (best.confidence < RECONCILIATION_AUTO_APPLY_THRESHOLD || !AUTO_APPLICABLE_KINDS.has(best.kind)) return false;
  const second = sorted[1];
  return !second || best.confidence - second.confidence >= 0.15;
}

function normalizePattern(s: string): string {
  return s
    .toLocaleUpperCase('tr')
    .replace(/[^A-ZÇĞİÖŞÜ0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)
    .join(' ');
}

/** Onaylardan öğrenme: açıklama/karşı taraf deseni → cari ya da gider hesabı. */
export async function learnReconciliationDecision(tx: DbOrTx, bt: { description: string; counterpartyName: string | null }, opts: { partnerId?: string | null; expenseAccountCode?: string | null; matchKind: ReconciliationMatchKind }): Promise<void> {
  const pattern = normalizePattern(bt.counterpartyName || bt.description);
  if (!pattern) return;
  const patternKind: 'counterparty' | 'description' = bt.counterpartyName ? 'counterparty' : 'description';
  const [existing] = await tx.select().from(reconciliationLearnings).where(and(eq(reconciliationLearnings.pattern, pattern), eq(reconciliationLearnings.patternKind, patternKind))).limit(1);
  if (existing) {
    await tx.update(reconciliationLearnings).set({ hits: sql`${reconciliationLearnings.hits} + 1`, lastUsedAt: new Date(), partnerId: opts.partnerId ?? existing.partnerId, expenseAccountCode: opts.expenseAccountCode ?? existing.expenseAccountCode }).where(eq(reconciliationLearnings.id, existing.id));
  } else {
    await tx.insert(reconciliationLearnings).values({ pattern, patternKind, partnerId: opts.partnerId ?? null, expenseAccountCode: opts.expenseAccountCode ?? null, matchKind: opts.matchKind, hits: 1 });
  }
}

type Bt = typeof bankTransactions.$inferSelect;

/** Bir eşleşmeyi fiilen uygular (tahsilat/ödeme + fiş, ya da gider fişi) ve `bank_transactions`'ı `matched` işaretler. */
async function applyMatch(tx: DbOrTx, bt: Bt, match: ReconciliationMatchInput, ctx: ActorCtx): Promise<{ paymentId?: string; journalEntryId?: string }> {
  const isInbound = D(bt.amount).gt(0);
  const absAmount = D(bt.amount).abs();

  if (match.kind === 'invoice' || match.kind === 'partner_on_account') {
    if (!match.partnerId) throw new ValidationError('Eşleşme için cari gerekli', { bankTransactionId: bt.id, kind: match.kind });
    const allocations = (match.allocations ?? []).filter((a) => match.invoiceIds?.includes(a.invoiceId) ?? true).map((a) => ({ invoiceId: a.invoiceId, amount: round4(D(a.amount)) }));
    const { payment } = await recordPayment(tx, {
      direction: isInbound ? 'inbound' : 'outbound', method: 'bank_transfer', partnerId: match.partnerId, bankAccountId: bt.bankAccountId,
      bankTransactionId: bt.id, paymentDate: bt.txDate, currency: bt.currency, amount: absAmount, allocations, reference: bt.description, origin: 'system',
    }, ctx);
    return { paymentId: payment.id, journalEntryId: payment.journalEntryId ?? undefined };
  }

  if (match.kind === 'loan_installment') {
    if (!match.loanInstallmentId) throw new ValidationError('Eşleşme için kredi taksidi gerekli', { bankTransactionId: bt.id });
    const [inst] = await tx.select().from(loanInstallments).where(eq(loanInstallments.id, match.loanInstallmentId)).limit(1);
    if (!inst) throw new NotFoundError('Kredi taksidi', match.loanInstallmentId);
    if (inst.status === 'paid') throw new DomainError('LOAN_INSTALLMENT_ALREADY_PAID', `${inst.id} taksidi zaten ödenmiş görünüyor; bu hareketle eşleştirilemez`, { loanInstallmentId: inst.id });
    const [account] = await tx.select({ accountCode: bankAccounts.accountCode }).from(bankAccounts).where(eq(bankAccounts.id, bt.bankAccountId)).limit(1);
    const { journalEntryId } = await postLoanInstallmentPayment(tx, { loanId: inst.loanId, seq: inst.seq, cashAccountCode: account?.accountCode, bankTransactionId: bt.id, paidAt: bt.txDate }, ctx);
    await tx.update(bankTransactions).set({ status: 'matched', journalEntryId: journalEntryId ?? null, matchedAt: new Date(), matchedBy: ctx.userId ?? null }).where(eq(bankTransactions.id, bt.id));
    return { journalEntryId };
  }

  if (match.kind === 'expense' || match.kind === 'fee') {
    if (!match.expenseAccountCode) throw new ValidationError('Eşleşme için gider hesabı gerekli', { bankTransactionId: bt.id });
    const [account] = await tx.select({ accountCode: bankAccounts.accountCode }).from(bankAccounts).where(eq(bankAccounts.id, bt.bankAccountId)).limit(1);
    if (!account) throw new NotFoundError('Banka hesabı', bt.bankAccountId);
    const lines: JournalLineInput[] = isInbound
      ? [{ accountCode: account.accountCode, debit: absAmount, description: bt.description }, { accountCode: match.expenseAccountCode, credit: absAmount, description: bt.description }]
      : [{ accountCode: match.expenseAccountCode, debit: absAmount, description: bt.description }, { accountCode: account.accountCode, credit: absAmount, description: bt.description }];
    const { vukId } = await postJournalEntry(tx, {
      ledger: 'both', journalCode: 'BNK', entryDate: new Date(bt.txDate), description: `Banka hareketi — ${bt.description} (${match.expenseAccountCode})`,
      refType: 'bank_transaction', refId: bt.id, refNo: bt.externalRef, lines, origin: 'system',
    }, ctx);
    await tx.update(bankTransactions).set({ status: 'matched', matchedExpenseAccountCode: match.expenseAccountCode, journalEntryId: vukId ?? null, matchedAt: new Date(), matchedBy: ctx.userId ?? null }).where(eq(bankTransactions.id, bt.id));
    return { journalEntryId: vukId };
  }

  throw new DomainError('MATCH_KIND_UNSUPPORTED', `${match.kind} türü şu an otomatik/onaylı uygulama desteklemiyor — yalnızca elle işaretlenebilir`, { kind: match.kind });
}

export type PersistAndApplyResult = { applied: boolean; matchId?: string; paymentId?: string; journalEntryId?: string; suggestedCount: number };

/**
 * Web katmanının `@plantero/ai matchBankTransaction` sonucunu kalıcı hale getirir: `isAutoApplicable`
 * ise en iyi adayı UYGULAR (`auto_applied`), aksi halde tüm adayları `suggested` olarak bırakır
 * (onay ekranı listeler). Her satır kendi kayıt-bazlı audit izini bırakır (I17 örüntüsü).
 */
export async function persistAndApply(tx: DbOrTx, bankTransactionId: string, matches: ReconciliationMatchInput[], ctx: ActorCtx): Promise<PersistAndApplyResult> {
  const [bt] = await tx.select().from(bankTransactions).where(eq(bankTransactions.id, bankTransactionId)).limit(1);
  if (!bt) throw new NotFoundError('Banka hareketi', bankTransactionId);
  if (bt.status !== 'unmatched') return { applied: false, suggestedCount: 0 };
  if (!matches.length) return { applied: false, suggestedCount: 0 };

  const top = matches.slice(0, 5);
  const autoApply = isAutoApplicable(top);

  if (autoApply) {
    const best = top[0]!;
    const applied = await applyMatch(tx, bt, best, ctx);
    const [row] = await tx
      .insert(reconciliationMatches)
      .values({
        bankTransactionId: bt.id, kind: best.kind, status: 'auto_applied', partnerId: best.partnerId ?? null,
        invoiceIds: best.invoiceIds ?? [], allocations: (best.allocations ?? []).map((a) => ({ invoiceId: a.invoiceId, amount: toDb(D(a.amount)) })),
        loanInstallmentId: best.loanInstallmentId ?? null, expenseAccountCode: best.expenseAccountCode ?? null,
        confidence: toDb(D(best.confidence)), rationale: best.rationale, features: best.features ?? {}, source: best.source,
        decidedAt: new Date(), paymentId: applied.paymentId ?? null,
      })
      .returning({ id: reconciliationMatches.id });
    await writeAudit(tx, {
      action: 'create', tableName: 'reconciliation_matches', recordId: row!.id,
      summary: `Mutabakat otomatik uygulandı: ${bt.description} (${best.kind}, güven %${Math.round(best.confidence * 100)}) — ${best.rationale}`,
      after: { bankTransactionId: bt.id, kind: best.kind, confidence: best.confidence, status: 'auto_applied', paymentId: applied.paymentId, journalEntryId: applied.journalEntryId },
    }, ctx);
    await learnReconciliationDecision(tx, bt, { partnerId: best.partnerId, expenseAccountCode: best.expenseAccountCode, matchKind: best.kind });
    return { applied: true, matchId: row!.id, paymentId: applied.paymentId, journalEntryId: applied.journalEntryId, suggestedCount: 0 };
  }

  let suggestedCount = 0;
  for (const m of top) {
    const [row] = await tx
      .insert(reconciliationMatches)
      .values({
        bankTransactionId: bt.id, kind: m.kind, status: 'suggested', partnerId: m.partnerId ?? null,
        invoiceIds: m.invoiceIds ?? [], allocations: (m.allocations ?? []).map((a) => ({ invoiceId: a.invoiceId, amount: toDb(D(a.amount)) })),
        loanInstallmentId: m.loanInstallmentId ?? null, expenseAccountCode: m.expenseAccountCode ?? null,
        confidence: toDb(D(m.confidence)), rationale: m.rationale, features: m.features ?? {}, source: m.source,
      })
      .returning({ id: reconciliationMatches.id });
    await writeAudit(tx, {
      action: 'create', tableName: 'reconciliation_matches', recordId: row!.id,
      summary: `Mutabakat önerisi üretildi: ${bt.description} (${m.kind}, güven %${Math.round(m.confidence * 100)}) — ${m.rationale}`,
      after: { bankTransactionId: bt.id, kind: m.kind, confidence: m.confidence, status: 'suggested' },
    }, ctx);
    suggestedCount++;
  }
  await tx.update(bankTransactions).set({ status: 'suggested' }).where(eq(bankTransactions.id, bt.id));
  return { applied: false, suggestedCount };
}

/* ------------------------------------------------------------------ */
/* Onay ekranı aksiyonları                                              */
/* ------------------------------------------------------------------ */

/** Onay ekranının listesi: `suggested` öneriler + hareket bilgisi (herhangi bir motorun ürettiği). */
export async function listPendingMatches(tx: DbOrTx, opts: { bankAccountId?: string } = {}) {
  const conds = [eq(reconciliationMatches.status, 'suggested')];
  const rows = await tx
    .select({ m: reconciliationMatches, bt: bankTransactions })
    .from(reconciliationMatches)
    .innerJoin(bankTransactions, eq(bankTransactions.id, reconciliationMatches.bankTransactionId))
    .where(opts.bankAccountId ? and(...conds, eq(bankTransactions.bankAccountId, opts.bankAccountId)) : and(...conds))
    .orderBy(sql`${bankTransactions.txDate} desc`, sql`${reconciliationMatches.confidence} desc`);
  return rows;
}

export async function approveReconciliationMatch(tx: DbOrTx, matchId: string, ctx: ActorCtx): Promise<{ paymentId?: string; journalEntryId?: string }> {
  const [match] = await tx.select().from(reconciliationMatches).where(eq(reconciliationMatches.id, matchId)).limit(1);
  if (!match) throw new NotFoundError('Mutabakat önerisi', matchId);
  if (match.status !== 'suggested') throw new DomainError('MATCH_NOT_SUGGESTED', `Öneri durumu ${match.status}; onaylanamaz`);
  const [bt] = await tx.select().from(bankTransactions).where(eq(bankTransactions.id, match.bankTransactionId)).limit(1);
  if (!bt) throw new NotFoundError('Banka hareketi', match.bankTransactionId);

  const input: ReconciliationMatchInput = {
    kind: match.kind, partnerId: match.partnerId, invoiceIds: match.invoiceIds ?? [],
    allocations: (match.allocations ?? []).map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })),
    loanInstallmentId: match.loanInstallmentId, expenseAccountCode: match.expenseAccountCode,
    confidence: Number(match.confidence), rationale: match.rationale ?? '', source: match.source as ReconciliationMatchSource,
  };
  const applied = await applyMatch(tx, bt, input, ctx);
  await tx.update(reconciliationMatches).set({ status: 'approved', decidedBy: ctx.userId ?? null, decidedAt: new Date(), paymentId: applied.paymentId ?? null }).where(eq(reconciliationMatches.id, matchId));
  await tx.update(reconciliationMatches).set({ status: 'superseded' }).where(and(eq(reconciliationMatches.bankTransactionId, bt.id), eq(reconciliationMatches.status, 'suggested')));

  await writeAudit(tx, {
    action: 'approve', tableName: 'reconciliation_matches', recordId: matchId,
    summary: `Mutabakat önerisi onaylandı: ${bt.description} (${match.kind})`,
    after: { status: 'approved', paymentId: applied.paymentId, journalEntryId: applied.journalEntryId, decidedBy: ctx.userId ?? null },
  }, ctx);
  await learnReconciliationDecision(tx, bt, { partnerId: match.partnerId, expenseAccountCode: match.expenseAccountCode, matchKind: match.kind });
  return applied;
}

export async function rejectReconciliationMatch(tx: DbOrTx, matchId: string, reason: string | null, ctx: ActorCtx): Promise<void> {
  const [match] = await tx.select().from(reconciliationMatches).where(eq(reconciliationMatches.id, matchId)).limit(1);
  if (!match) throw new NotFoundError('Mutabakat önerisi', matchId);
  if (match.status !== 'suggested') throw new DomainError('MATCH_NOT_SUGGESTED', `Öneri durumu ${match.status}; reddedilemez`);
  await tx.update(reconciliationMatches).set({ status: 'rejected', decidedBy: ctx.userId ?? null, decidedAt: new Date(), rationale: reason ? `${match.rationale ?? ''} — red: ${reason}` : match.rationale }).where(eq(reconciliationMatches.id, matchId));

  await writeAudit(tx, {
    action: 'reject', tableName: 'reconciliation_matches', recordId: matchId,
    summary: `Mutabakat önerisi reddedildi${reason ? `: ${reason}` : ''}`,
    after: { status: 'rejected', decidedBy: ctx.userId ?? null, reason: reason ?? null },
  }, ctx);

  const remaining = await tx.select({ id: reconciliationMatches.id }).from(reconciliationMatches).where(and(eq(reconciliationMatches.bankTransactionId, match.bankTransactionId), inArray(reconciliationMatches.status, ['suggested', 'approved', 'auto_applied'])));
  if (!remaining.length) await tx.update(bankTransactions).set({ status: 'unmatched' }).where(eq(bankTransactions.id, match.bankTransactionId));
}

export type ManualMatchInput = {
  kind: 'invoice' | 'partner_on_account' | 'loan_installment' | 'expense';
  partnerId?: string | null;
  invoiceId?: string | null;
  amount?: Decimal | string | null;
  loanInstallmentId?: string | null;
  expenseAccountCode?: string | null;
};

/** Kullanıcı doğrudan cari/fatura/kredi taksidi/gider hesabı seçer (öneri beklemeden). */
export async function manualReconciliationMatch(tx: DbOrTx, bankTransactionId: string, input: ManualMatchInput, ctx: ActorCtx): Promise<{ paymentId?: string; journalEntryId?: string }> {
  const [bt] = await tx.select().from(bankTransactions).where(eq(bankTransactions.id, bankTransactionId)).limit(1);
  if (!bt) throw new NotFoundError('Banka hareketi', bankTransactionId);
  if (bt.status === 'matched') throw new DomainError('BANK_TX_ALREADY_MATCHED', `${bt.description} zaten eşleşmiş`);

  const amount = input.amount ? round4(D(input.amount)) : D(bt.amount).abs();
  const matchInput: ReconciliationMatchInput = {
    kind: input.kind, partnerId: input.partnerId ?? null,
    invoiceIds: input.invoiceId ? [input.invoiceId] : [], allocations: input.invoiceId ? [{ invoiceId: input.invoiceId, amount }] : [],
    loanInstallmentId: input.loanInstallmentId ?? null, expenseAccountCode: input.expenseAccountCode ?? null,
    confidence: 1, rationale: 'Elle eşleştirildi', source: 'manual',
  };
  const applied = await applyMatch(tx, bt, matchInput, ctx);
  const [row] = await tx
    .insert(reconciliationMatches)
    .values({
      bankTransactionId: bt.id, kind: input.kind, status: 'approved', partnerId: input.partnerId ?? null,
      invoiceIds: matchInput.invoiceIds, allocations: (matchInput.allocations ?? []).map((a) => ({ invoiceId: a.invoiceId, amount: toDb(D(a.amount)) })),
      loanInstallmentId: input.loanInstallmentId ?? null, expenseAccountCode: input.expenseAccountCode ?? null,
      confidence: toDb(1), rationale: 'Elle eşleştirildi', source: 'manual', decidedBy: ctx.userId ?? null, decidedAt: new Date(), paymentId: applied.paymentId ?? null,
    })
    .returning({ id: reconciliationMatches.id });

  await writeAudit(tx, {
    action: 'create', tableName: 'reconciliation_matches', recordId: row!.id,
    summary: `Banka hareketi elle eşleştirildi: ${bt.description} (${input.kind})`,
    after: { bankTransactionId: bt.id, kind: input.kind, status: 'approved', source: 'manual', paymentId: applied.paymentId, journalEntryId: applied.journalEntryId },
  }, ctx);
  await tx.update(reconciliationMatches).set({ status: 'superseded' }).where(and(eq(reconciliationMatches.bankTransactionId, bt.id), eq(reconciliationMatches.status, 'suggested')));
  await learnReconciliationDecision(tx, bt, { partnerId: input.partnerId, expenseAccountCode: input.expenseAccountCode, matchKind: input.kind });
  return applied;
}

/** Hareketi mutabakat dışı bırakır (kesin tanınmayan/önemsiz hareket). */
export async function ignoreBankTransaction(tx: DbOrTx, bankTransactionId: string, ctx: ActorCtx): Promise<void> {
  const [bt] = await tx.select().from(bankTransactions).where(eq(bankTransactions.id, bankTransactionId)).limit(1);
  if (!bt) throw new NotFoundError('Banka hareketi', bankTransactionId);
  await tx.update(bankTransactions).set({ status: 'ignored' }).where(eq(bankTransactions.id, bankTransactionId));
  await writeAudit(tx, { action: 'update', tableName: 'bank_transactions', recordId: bankTransactionId, summary: `${bt.description}: mutabakat dışı bırakıldı`, after: { status: 'ignored' } }, ctx);
}
