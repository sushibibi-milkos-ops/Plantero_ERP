import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import {
  bankAccounts, bankStatementImports, bankTransactions, reconciliationMatches, reconciliationLearnings,
  invoices, partners, type DbOrTx,
} from '@plantero/db';
import { D, toDb, round4 } from '../money.js';
import { businessDate } from '../dates.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import { writeAudit } from '../audit/index.js';
import { recordPayment } from './payments.js';
import type { ActorCtx } from '../types.js';

/**
 * Banka ekstresi içe aktarma + (eski) kural tabanlı fatura mutabakatı.
 *
 * KANONİK MOTOR (muhasebe + finans birleştirmesi): canlı mutabakat akışı artık TEK yoldan geçer —
 *   `@plantero/ai::runAiReconciliation` (orkestrasyon) → `accounting/reconciliation.ts::buildCandidates`
 *   → `@plantero/ai::matchBankTransaction` (AI varsa AI+kural, yoksa kural) → `accounting/reconciliation.ts::
 *   persistAndApply` / `approveReconciliationMatch` / `rejectReconciliationMatch` / `manualReconciliationMatch`.
 * Worker `reconciliation-nightly`, `/muhasebe/mutabakat`, `/muhasebe/banka` ve `/finans/banka` hepsi bunu
 * çağırır. Bu dosyadaki `runReconciliation`/`approveMatch`/`rejectMatch`/`manualMatch` yalnızca fatura
 * (kind='invoice') eşleştiren, tutar+cari adı+tarih skorlu ESKİ motordur; canlı ekranlar/worker onu artık
 * çağırmaz — yalnızca `packages/db/src/seed/finance-payments.ts` geriye dönük dolgusu (deterministik demo
 * verisi) ve kendi birim testleri kullanır. `importStatement` ise PAYLAŞILAN tek ekstre içe aktarma
 * noktasıdır (her iki modül de bunu kullanır).
 *
 * (I17, tur 15 P1 kök neden düzeltmesi) `postStockMove`/`postJournalEntry` örüntüsü: her mutasyon
 * kendi kayıt-bazlı `writeAudit` satırını BURADA (CORE katmanında) yazar, çağıran katmanın (actions.ts,
 * seed) yazıp yazmamasına bağlı kalmaz — `importStatement` içe aktardığı her `bank_transactions`
 * satırı için, `runReconciliation`/`manualMatch` oluşturduğu her `reconciliation_matches` satırı için,
 * `approveMatch`/`rejectMatch` verdiği her karar için ayrı bir audit izi bırakır. Çağıran katmandaki
 * tekil özet audit satırı (ör. "N hareket içe aktarıldı, M otomatik uygulandı") ek bağlam olarak kalabilir
 * ama artık tek kanıt değildir.
 */

/* ------------------------------------------------------------------ */
/* Ekstre içe aktarma                                                  */
/* ------------------------------------------------------------------ */

export type BankTxLineInput = {
  externalRef: string;
  txDate: string | Date;
  valueDate?: string | Date | null;
  amount: Decimal;
  currency?: string;
  balanceAfter?: Decimal | null;
  description: string;
  counterpartyName?: string | null;
  counterpartyIban?: string | null;
  txType?: string | null;
  raw?: unknown;
};

export type ImportStatementInput = {
  bankAccountId: string;
  source: 'open_banking' | 'mt940' | 'csv' | 'manual';
  fileName?: string | null;
  periodStart?: string | Date | null;
  periodEnd?: string | Date | null;
  openingBalance?: Decimal | null;
  closingBalance?: Decimal | null;
  lines: BankTxLineInput[];
};

export type ImportStatementResult = { importId: string; importedCount: number; duplicateCount: number };

/** Ekstre içe aktarır; `externalRef` ile çift kayıt önlenir (bank_transactions_ext_uq). */
export async function importStatement(tx: DbOrTx, input: ImportStatementInput, ctx: ActorCtx): Promise<ImportStatementResult> {
  const [account] = await tx.select().from(bankAccounts).where(eq(bankAccounts.id, input.bankAccountId)).limit(1);
  if (!account) throw new NotFoundError('Banka hesabı', input.bankAccountId);

  // (I30, tur 10 P1) Banka hesabı tek bir para biriminde tutulur — satır para birimi belirtilmişse hesabınkiyle
  // uyuşmalı; sessizce hesabın kuruna "düşürülmez" (aksi halde bank_transactions.currency ≠ bank_accounts.currency
  // olur ve gerçek ekstreyle mutabakat asla tutmaz).
  for (const line of input.lines) {
    if (line.currency && line.currency !== account.currency) {
      throw new ValidationError(`Ekstre satırı para birimi (${line.currency}) banka hesabının para birimiyle (${account.currency}) uyuşmuyor`, { bankAccountId: account.id, lineCurrency: line.currency, accountCurrency: account.currency, externalRef: line.externalRef });
    }
  }

  const [imp] = await tx
    .insert(bankStatementImports)
    .values({
      bankAccountId: account.id, source: input.source, fileName: input.fileName ?? null,
      periodStart: input.periodStart ? businessDate(input.periodStart) : null, periodEnd: input.periodEnd ? businessDate(input.periodEnd) : null,
      openingBalance: input.openingBalance ? toDb(input.openingBalance) : null, closingBalance: input.closingBalance ? toDb(input.closingBalance) : null,
      lineCount: input.lines.length, status: 'done', createdBy: ctx.userId ?? null,
    })
    .returning();
  const importId = imp!.id;

  let importedCount = 0;
  let duplicateCount = 0;
  for (const line of input.lines) {
    const [row] = await tx
      .insert(bankTransactions)
      .values({
        bankAccountId: account.id, importId, externalRef: line.externalRef, txDate: businessDate(line.txDate),
        valueDate: line.valueDate ? businessDate(line.valueDate) : null, amount: toDb(line.amount), currency: line.currency ?? account.currency,
        balanceAfter: line.balanceAfter ? toDb(line.balanceAfter) : null, description: line.description,
        counterpartyName: line.counterpartyName ?? null, counterpartyIban: line.counterpartyIban ?? null, txType: line.txType ?? null,
        raw: line.raw ?? null,
      })
      .onConflictDoNothing({ target: [bankTransactions.bankAccountId, bankTransactions.externalRef] })
      .returning({ id: bankTransactions.id });
    if (row) {
      importedCount++;
      // (I17) Her içe aktarılan hareket kendi kayıt-bazlı audit izini burada bırakır.
      await writeAudit(tx, {
        action: 'create',
        tableName: 'bank_transactions',
        recordId: row.id,
        summary: `Banka hareketi içe aktarıldı (${input.source}): ${line.description} — ${toDb(line.amount)} ${line.currency ?? account.currency} [${line.externalRef}]`,
        after: {
          bankAccountId: account.id, importId, externalRef: line.externalRef, txDate: businessDate(line.txDate),
          amount: toDb(line.amount), currency: line.currency ?? account.currency, description: line.description,
          counterpartyName: line.counterpartyName ?? null,
        },
      }, ctx);
    } else {
      duplicateCount++;
    }
  }

  await tx.update(bankStatementImports).set({ importedCount, duplicateCount }).where(eq(bankStatementImports.id, importId));
  if (input.closingBalance) {
    await tx.update(bankAccounts).set({ statementBalance: toDb(input.closingBalance), statementBalanceAt: new Date(), lastSyncedAt: new Date() }).where(eq(bankAccounts.id, account.id));
  }
  return { importId, importedCount, duplicateCount };
}

/* ------------------------------------------------------------------ */
/* Aday bulma + skorlama                                               */
/* ------------------------------------------------------------------ */

/** Türkçe karakterleri sadeleştirip küçük harfe çevirir, alfanümerik dışını atar (fuzzy karşılaştırma için) */
function normalize(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/[çc]/g, 'c').replace(/[ğg]/g, 'g').replace(/[ıi]/g, 'i').replace(/[öo]/g, 'o').replace(/[şs]/g, 's').replace(/[üu]/g, 'u')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export type InvoiceCandidate = {
  invoiceId: string;
  docNo: string;
  partnerId: string;
  partnerName: string;
  residual: Decimal;
  currency: string;
  dueDate: string;
  confidence: number;
  rationale: string;
};

/** Tutar + cari adı benzerliği + vade yakınlığı — 0..1 güven skoru (kural tabanlı) */
function scoreInvoiceCandidate(bt: { amount: string; description: string; counterpartyName: string | null; txDate: string }, invoice: { residual: string; dueDate: string; partnerName: string }): { score: number; rationale: string } {
  const absAmount = D(bt.amount).abs();
  const residual = D(invoice.residual);
  const diffPct = residual.gt(0) ? absAmount.minus(residual).abs().div(residual) : D(1);
  let amountScore = 0;
  let amountNote = 'tutar uyuşmuyor';
  if (diffPct.lte('0.0001')) { amountScore = 0.5; amountNote = 'tutar birebir'; }
  else if (diffPct.lte('0.01')) { amountScore = 0.4; amountNote = 'tutar ±%1 içinde'; }
  else if (diffPct.lte('0.05')) { amountScore = 0.15; amountNote = 'tutar ±%5 içinde'; }

  const haystack = normalize(`${bt.description} ${bt.counterpartyName ?? ''}`);
  const needle = normalize(invoice.partnerName);
  let nameScore = 0;
  let nameNote = 'cari adı eşleşmedi';
  if (needle && haystack.includes(needle)) { nameScore = 0.35; nameNote = 'cari adı tam eşleşti'; }
  else {
    const words = needle.split(' ').filter((w) => w.length >= 3);
    const hit = words.filter((w) => haystack.includes(w));
    if (words.length && hit.length / words.length >= 0.5) { nameScore = 0.18; nameNote = `cari adı kısmen eşleşti (${hit.join(', ')})`; }
  }

  const dueDays = Math.round((new Date(`${bt.txDate}T00:00:00Z`).getTime() - new Date(`${invoice.dueDate}T00:00:00Z`).getTime()) / 86_400_000);
  let dateScore = 0;
  let dateNote = 'tarih uzak';
  if (dueDays >= -5 && dueDays <= 30) { dateScore = 0.15; dateNote = 'vadeye yakın'; }
  else if (dueDays >= -30 && dueDays <= 60) { dateScore = 0.05; dateNote = 'vadeye makul uzaklıkta'; }

  const score = Math.min(1, amountScore + nameScore + dateScore);
  return { score, rationale: `${amountNote} + ${nameNote} + ${dateNote}` };
}

/** Bir banka hareketi için açık fatura adayları (en iyi 5, güvene göre azalan) */
export async function findInvoiceCandidates(tx: DbOrTx, bt: typeof bankTransactions.$inferSelect): Promise<InvoiceCandidate[]> {
  const direction: 'inbound' | 'outbound' = D(bt.amount).gte(0) ? 'inbound' : 'outbound';
  const kinds: Array<'sales' | 'purchase' | 'sales_return' | 'purchase_return'> = direction === 'inbound' ? ['sales'] : ['purchase'];
  const partnerKinds: Array<'customer' | 'supplier' | 'both' | 'bank' | 'other'> = direction === 'inbound' ? ['customer', 'both'] : ['supplier', 'both'];

  const rows = await tx
    .select({ i: invoices, partnerName: partners.name, partnerKind: partners.kind })
    .from(invoices)
    .innerJoin(partners, eq(partners.id, invoices.partnerId))
    .where(and(inArray(invoices.kind, kinds), inArray(invoices.status, ['posted', 'partially_paid']), sql`${invoices.residual} > 0`, eq(invoices.currency, bt.currency), inArray(partners.kind, partnerKinds)));

  const scored = rows.map((r) => {
    const { score, rationale } = scoreInvoiceCandidate({ amount: bt.amount, description: bt.description, counterpartyName: bt.counterpartyName, txDate: bt.txDate }, { residual: r.i.residual, dueDate: r.i.dueDate, partnerName: r.partnerName });
    return { invoiceId: r.i.id, docNo: r.i.docNo, partnerId: r.i.partnerId, partnerName: r.partnerName, residual: D(r.i.residual), currency: r.i.currency, dueDate: r.i.dueDate, confidence: score, rationale };
  });
  return scored.filter((c) => c.confidence > 0).sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

/* ------------------------------------------------------------------ */
/* Uygulama (öneri → tahsilat/ödeme + fiş)                              */
/* ------------------------------------------------------------------ */

type ApplyParams = {
  bankTransactionId: string;
  partnerId: string;
  invoiceId: string;
  amount: Decimal;
  bankAccountId: string;
};

async function applyInvoiceAllocation(tx: DbOrTx, p: ApplyParams, ctx: ActorCtx): Promise<{ paymentId: string }> {
  const [bt] = await tx.select().from(bankTransactions).where(eq(bankTransactions.id, p.bankTransactionId)).limit(1);
  if (!bt) throw new NotFoundError('Banka hareketi', p.bankTransactionId);
  const direction: 'inbound' | 'outbound' = D(bt.amount).gte(0) ? 'inbound' : 'outbound';
  const { payment } = await recordPayment(tx, {
    direction, method: 'bank_transfer', partnerId: p.partnerId, bankAccountId: p.bankAccountId, bankTransactionId: p.bankTransactionId,
    paymentDate: bt.txDate, currency: bt.currency, amount: p.amount, allocations: [{ invoiceId: p.invoiceId, amount: p.amount }],
    reference: bt.description, origin: 'system',
  }, ctx);
  return { paymentId: payment.id };
}

/** Onaylardan öğrenme: açıklama/karşı taraf deseni → cari (sonraki mutabakatlarda öneri güvenini artırır) */
export async function learnFromDecision(tx: DbOrTx, bt: { description: string; counterpartyName: string | null }, partnerId: string, matchKind: (typeof reconciliationMatches.$inferSelect)['kind']): Promise<void> {
  const pattern = normalize(bt.counterpartyName || bt.description).split(' ').slice(0, 4).join(' ');
  if (!pattern) return;
  const patternKind = bt.counterpartyName ? 'counterparty' : 'description';
  const [existing] = await tx.select().from(reconciliationLearnings).where(and(eq(reconciliationLearnings.pattern, pattern), eq(reconciliationLearnings.patternKind, patternKind), eq(reconciliationLearnings.partnerId, partnerId))).limit(1);
  if (existing) {
    await tx.update(reconciliationLearnings).set({ hits: sql`${reconciliationLearnings.hits} + 1`, lastUsedAt: new Date() }).where(eq(reconciliationLearnings.id, existing.id));
  } else {
    await tx.insert(reconciliationLearnings).values({ pattern, patternKind, partnerId, matchKind, hits: 1 });
  }
}

/** Otomatik uygulama eşiği (docs/modules/muhasebe.md: "güven ≥0.92 ve tek aday") */
export const AUTO_APPLY_THRESHOLD = 0.92;

export type RunReconciliationOpts = { bankAccountId?: string; importId?: string; since?: string | Date };
export type RunReconciliationResult = { evaluated: number; suggested: number; autoApplied: number };

/**
 * Eşleşmemiş banka hareketlerini tarar, her biri için aday(lar) üretir. Tek aday + güven ≥%92 ise
 * doğrudan tahsilat/ödeme + fiş üretilerek `auto_applied` işaretlenir; aksi halde en iyi adaylar
 * `suggested` olarak `reconciliation_matches`'e yazılır ve hareket `suggested` durumuna geçer
 * (onay ekranı — `/muhasebe/mutabakat` — bunları listeler).
 */
export async function runReconciliation(tx: DbOrTx, opts: RunReconciliationOpts, ctx: ActorCtx): Promise<RunReconciliationResult> {
  const conds = [eq(bankTransactions.status, 'unmatched')];
  if (opts.bankAccountId) conds.push(eq(bankTransactions.bankAccountId, opts.bankAccountId));
  if (opts.importId) conds.push(eq(bankTransactions.importId, opts.importId));
  if (opts.since) conds.push(gte(bankTransactions.txDate, businessDate(opts.since)));
  const unmatched = await tx.select().from(bankTransactions).where(and(...conds));

  let suggested = 0;
  let autoApplied = 0;
  for (const bt of unmatched) {
    const candidates = await findInvoiceCandidates(tx, bt);
    if (!candidates.length) continue;
    const best = candidates[0]!;
    const unique = candidates.length === 1 || best.confidence - (candidates[1]?.confidence ?? 0) >= 0.2;

    if (best.confidence >= AUTO_APPLY_THRESHOLD && unique) {
      const applyAmount = best.residual.lt(D(bt.amount).abs()) ? best.residual : D(bt.amount).abs();
      const { paymentId } = await applyInvoiceAllocation(tx, { bankTransactionId: bt.id, partnerId: best.partnerId, invoiceId: best.invoiceId, amount: applyAmount, bankAccountId: bt.bankAccountId }, ctx);
      const [matchRow] = await tx
        .insert(reconciliationMatches)
        .values({
          bankTransactionId: bt.id, kind: 'invoice', status: 'auto_applied', partnerId: best.partnerId, invoiceIds: [best.invoiceId],
          allocations: [{ invoiceId: best.invoiceId, amount: toDb(applyAmount) }], confidence: toDb(best.confidence), rationale: best.rationale,
          source: 'rule', decidedAt: new Date(), paymentId,
        })
        .returning({ id: reconciliationMatches.id });
      // (I17) Otomatik uygulanan her eşleşme kendi kayıt-bazlı audit izini burada bırakır.
      await writeAudit(tx, {
        action: 'create',
        tableName: 'reconciliation_matches',
        recordId: matchRow!.id,
        summary: `Mutabakat otomatik uygulandı: ${bt.description} → fatura ${best.docNo} (güven %${Math.round(best.confidence * 100)}, ${best.rationale})`,
        after: { bankTransactionId: bt.id, invoiceId: best.invoiceId, partnerId: best.partnerId, confidence: best.confidence, rationale: best.rationale, status: 'auto_applied', paymentId },
      }, ctx);
      await learnFromDecision(tx, bt, best.partnerId, 'invoice');
      autoApplied++;
    } else {
      for (const c of candidates.slice(0, 3)) {
        const applyAmount = c.residual.lt(D(bt.amount).abs()) ? c.residual : D(bt.amount).abs();
        const [matchRow] = await tx
          .insert(reconciliationMatches)
          .values({
            bankTransactionId: bt.id, kind: 'invoice', status: 'suggested', partnerId: c.partnerId, invoiceIds: [c.invoiceId],
            allocations: [{ invoiceId: c.invoiceId, amount: toDb(applyAmount) }],
            confidence: toDb(c.confidence), rationale: c.rationale, source: 'rule',
          })
          .returning({ id: reconciliationMatches.id });
        // (I17) Her üretilen öneri kendi kayıt-bazlı audit izini burada bırakır (onay/red beklemeden).
        await writeAudit(tx, {
          action: 'create',
          tableName: 'reconciliation_matches',
          recordId: matchRow!.id,
          summary: `Mutabakat önerisi üretildi: ${bt.description} → fatura ${c.docNo} (güven %${Math.round(c.confidence * 100)}, ${c.rationale})`,
          after: { bankTransactionId: bt.id, invoiceId: c.invoiceId, partnerId: c.partnerId, confidence: c.confidence, rationale: c.rationale, status: 'suggested' },
        }, ctx);
      }
      await tx.update(bankTransactions).set({ status: 'suggested' }).where(eq(bankTransactions.id, bt.id));
      suggested++;
    }
  }
  return { evaluated: unmatched.length, suggested, autoApplied };
}

/** Öneriyi onaylar: tahsilat/ödeme + fiş üretir, aynı harekete ait diğer önerileri geçersiz kılar. */
export async function approveMatch(tx: DbOrTx, matchId: string, ctx: ActorCtx): Promise<{ paymentId: string }> {
  const [match] = await tx.select().from(reconciliationMatches).where(eq(reconciliationMatches.id, matchId)).limit(1);
  if (!match) throw new NotFoundError('Mutabakat önerisi', matchId);
  if (match.status !== 'suggested') throw new DomainError('MATCH_NOT_SUGGESTED', `Öneri durumu ${match.status}; onaylanamaz`);
  if (match.kind !== 'invoice') throw new DomainError('MATCH_KIND_UNSUPPORTED', `${match.kind} türü onay akışında henüz desteklenmiyor`);
  const invoiceId = match.invoiceIds?.[0];
  const alloc = match.allocations?.[0];
  if (!invoiceId || !alloc || !match.partnerId) throw new ValidationError('Öneri eksik: fatura/tahsis bilgisi yok');

  const [bt] = await tx.select().from(bankTransactions).where(eq(bankTransactions.id, match.bankTransactionId)).limit(1);
  if (!bt) throw new NotFoundError('Banka hareketi', match.bankTransactionId);

  const { paymentId } = await applyInvoiceAllocation(tx, { bankTransactionId: bt.id, partnerId: match.partnerId, invoiceId, amount: D(alloc.amount), bankAccountId: bt.bankAccountId }, ctx);
  await tx.update(reconciliationMatches).set({ status: 'approved', decidedBy: ctx.userId ?? null, decidedAt: new Date(), paymentId }).where(eq(reconciliationMatches.id, matchId));
  await tx.update(reconciliationMatches).set({ status: 'superseded' }).where(and(eq(reconciliationMatches.bankTransactionId, bt.id), eq(reconciliationMatches.status, 'suggested')));
  // (I17) Onay kararı kendi kayıt-bazlı audit izini burada bırakır.
  await writeAudit(tx, {
    action: 'approve',
    tableName: 'reconciliation_matches',
    recordId: matchId,
    summary: `Mutabakat önerisi onaylandı: ${bt.description} → fatura ${invoiceId}, tahsilat/ödeme ${paymentId} üretildi`,
    after: { status: 'approved', paymentId, decidedBy: ctx.userId ?? null },
  }, ctx);
  await learnFromDecision(tx, bt, match.partnerId, 'invoice');
  return { paymentId };
}

/** Öneriyi reddeder; hareketin başka onaylı/otomatik önerisi yoksa `unmatched`'a döner. */
export async function rejectMatch(tx: DbOrTx, matchId: string, reason: string | null, ctx: ActorCtx): Promise<void> {
  const [match] = await tx.select().from(reconciliationMatches).where(eq(reconciliationMatches.id, matchId)).limit(1);
  if (!match) throw new NotFoundError('Mutabakat önerisi', matchId);
  if (match.status !== 'suggested') throw new DomainError('MATCH_NOT_SUGGESTED', `Öneri durumu ${match.status}; reddedilemez`);
  await tx.update(reconciliationMatches).set({ status: 'rejected', decidedBy: ctx.userId ?? null, decidedAt: new Date(), rationale: reason ? `${match.rationale ?? ''} — red: ${reason}` : match.rationale }).where(eq(reconciliationMatches.id, matchId));
  // (I17) Red kararı kendi kayıt-bazlı audit izini burada bırakır.
  await writeAudit(tx, {
    action: 'reject',
    tableName: 'reconciliation_matches',
    recordId: matchId,
    summary: `Mutabakat önerisi reddedildi${reason ? `: ${reason}` : ''}`,
    after: { status: 'rejected', decidedBy: ctx.userId ?? null, reason: reason ?? null },
  }, ctx);

  const remaining = await tx.select({ id: reconciliationMatches.id }).from(reconciliationMatches).where(and(eq(reconciliationMatches.bankTransactionId, match.bankTransactionId), inArray(reconciliationMatches.status, ['suggested', 'approved', 'auto_applied'])));
  if (!remaining.length) await tx.update(bankTransactions).set({ status: 'unmatched' }).where(eq(bankTransactions.id, match.bankTransactionId));
}

/** Elle eşleştirme: kullanıcı doğrudan cari + fatura seçer (öneri beklemeden) */
export async function manualMatch(tx: DbOrTx, bankTransactionId: string, input: { partnerId: string; invoiceId: string; amount: Decimal }, ctx: ActorCtx): Promise<{ paymentId: string }> {
  const [bt] = await tx.select().from(bankTransactions).where(eq(bankTransactions.id, bankTransactionId)).limit(1);
  if (!bt) throw new NotFoundError('Banka hareketi', bankTransactionId);
  if (bt.status === 'matched') throw new DomainError('BANK_TX_ALREADY_MATCHED', `${bt.description} zaten eşleşmiş`);

  const { paymentId } = await applyInvoiceAllocation(tx, { bankTransactionId: bt.id, partnerId: input.partnerId, invoiceId: input.invoiceId, amount: round4(input.amount), bankAccountId: bt.bankAccountId }, ctx);
  const [matchRow] = await tx
    .insert(reconciliationMatches)
    .values({
      bankTransactionId: bt.id, kind: 'invoice', status: 'approved', partnerId: input.partnerId, invoiceIds: [input.invoiceId],
      allocations: [{ invoiceId: input.invoiceId, amount: toDb(input.amount) }], confidence: toDb(1), rationale: 'Elle eşleştirildi', source: 'manual',
      decidedBy: ctx.userId ?? null, decidedAt: new Date(), paymentId,
    })
    .returning({ id: reconciliationMatches.id });
  // (I17) Elle eşleştirme kendi kayıt-bazlı audit izini burada bırakır.
  await writeAudit(tx, {
    action: 'create',
    tableName: 'reconciliation_matches',
    recordId: matchRow!.id,
    summary: `Banka hareketi elle eşleştirildi: ${bt.description} → fatura ${input.invoiceId}, tahsilat/ödeme ${paymentId} üretildi`,
    after: { bankTransactionId: bt.id, invoiceId: input.invoiceId, partnerId: input.partnerId, status: 'approved', source: 'manual', paymentId },
  }, ctx);
  await tx.update(reconciliationMatches).set({ status: 'superseded' }).where(and(eq(reconciliationMatches.bankTransactionId, bt.id), eq(reconciliationMatches.status, 'suggested')));
  await learnFromDecision(tx, bt, input.partnerId, 'invoice');
  return { paymentId };
}

/** Hareketi mutabakat dışı bırak (banka masrafı/harici — fatura ile ilişkilendirilmeyecek) */
export async function ignoreTransaction(tx: DbOrTx, bankTransactionId: string): Promise<void> {
  await tx.update(bankTransactions).set({ status: 'ignored' }).where(eq(bankTransactions.id, bankTransactionId));
}
