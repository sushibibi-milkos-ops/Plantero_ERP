import { and, eq, gt, inArray } from 'drizzle-orm';
import { approvals, bankTransactions, db, invoices, loanInstallments, loans, partners, reconciliationLearnings, reconciliationMatches } from '@plantero/db';
import { isAutoApplicable, matchBankTransaction, type ReconCandidates } from '@plantero/ai';

const BATCH_LIMIT = 200;

/**
 * Gece mutabakat ajanı: eşleşmemiş banka hareketlerini açık faturalar, cariler, kredi
 * taksitleri ve öğrenilmiş desenlerle eşleştirir; sonucu `reconciliation_matches`'a öneri
 * olarak yazar. Gerçek fişleştirme (postJournalEntry ile tahsilat/ödeme kaydı) muhasebe
 * modülünün onay akışında yapılır — burada yalnızca öneri üretilir, bakiye etkilenmez.
 */
export async function runReconciliationNightly(): Promise<Record<string, unknown>> {
  const unmatched = await db.select().from(bankTransactions).where(eq(bankTransactions.status, 'unmatched')).limit(BATCH_LIMIT);
  if (unmatched.length === 0) return { evaluated: 0, suggested: 0, autoApplicable: 0 };

  const openInvoices = await db
    .select({ id: invoices.id, docNo: invoices.docNo, partnerId: invoices.partnerId, partnerName: partners.name, residual: invoices.residual, dueDate: invoices.dueDate, kind: invoices.kind })
    .from(invoices)
    .innerJoin(partners, eq(partners.id, invoices.partnerId))
    .where(and(inArray(invoices.status, ['posted', 'partially_paid']), gt(invoices.residual, '0')));

  const allPartners = await db.select({ id: partners.id, name: partners.name }).from(partners).where(eq(partners.isActive, true));

  const openInstallments = await db
    .select({ id: loanInstallments.id, loanId: loanInstallments.loanId, loanCode: loans.code, dueDate: loanInstallments.dueDate, installment: loanInstallments.installment })
    .from(loanInstallments)
    .innerJoin(loans, eq(loans.id, loanInstallments.loanId))
    .where(inArray(loanInstallments.status, ['scheduled', 'overdue']));

  const learnings = await db.select().from(reconciliationLearnings);

  const candidates: ReconCandidates = {
    invoices: openInvoices.map((i) => ({ id: i.id, docNo: i.docNo, partnerId: i.partnerId, partnerName: i.partnerName, residual: i.residual, dueDate: i.dueDate, kind: i.kind as 'sales' | 'purchase' })),
    partners: allPartners,
    loanInstallments: openInstallments.map((i) => ({ id: i.id, loanId: i.loanId, loanCode: i.loanCode, dueDate: i.dueDate, installment: i.installment })),
    learnings: learnings.map((l) => ({
      pattern: l.pattern,
      patternKind: l.patternKind as 'description' | 'iban' | 'counterparty',
      partnerId: l.partnerId,
      expenseAccountCode: l.expenseAccountCode,
      matchKind: l.matchKind,
      hits: l.hits,
    })),
  };

  let suggested = 0;
  let autoApplicable = 0;

  for (const tx of unmatched) {
    const matches = await matchBankTransaction(
      { id: tx.id, description: tx.description, amount: tx.amount, counterpartyName: tx.counterpartyName, counterpartyIban: tx.counterpartyIban, txDate: tx.txDate, txType: tx.txType },
      candidates,
    );
    const top = matches[0];
    if (!top) continue;

    const autoOk = top.confidence >= 0.92 && isAutoApplicable(matches);

    await db.insert(reconciliationMatches).values({
      bankTransactionId: tx.id,
      kind: top.kind,
      status: autoOk ? 'auto_applied' : 'suggested',
      partnerId: top.partnerId ?? null,
      invoiceIds: top.invoiceIds,
      allocations: top.allocations,
      loanInstallmentId: top.loanInstallmentId ?? null,
      expenseAccountCode: top.expenseAccountCode ?? null,
      confidence: String(top.confidence),
      rationale: top.rationale,
      features: top.features,
      source: top.source,
    });

    // Banka hareketi 'suggested' işaretlenir; 'matched' yalnızca muhasebe modülünün onay akışında
    // gerçek tahsilat/ödeme (postJournalEntry) oluştuğunda set edilir (I11 bütünlük kuralı).
    await db.update(bankTransactions).set({ status: 'suggested' }).where(eq(bankTransactions.id, tx.id));

    if (autoOk) {
      autoApplicable++;
      await db.insert(approvals).values({
        kind: 'reconciliation',
        refTable: 'bank_transactions',
        refId: tx.id,
        title: `Otomatik mutabakat önerisi: ${tx.description.slice(0, 60)}`,
        summary: top.rationale,
        payload: { matchKind: top.kind, confidence: top.confidence },
        confidence: String(top.confidence),
        status: 'pending',
      });
    } else {
      suggested++;
    }
  }

  return {
    evaluated: unmatched.length,
    suggested,
    autoApplicable,
    note: 'Fişleştirme (postJournalEntry) muhasebe modülünün onay akışında yapılır; burada yalnızca öneri üretilir.',
  };
}
