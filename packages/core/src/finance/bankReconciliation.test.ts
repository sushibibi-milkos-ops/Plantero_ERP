import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { journals, invoices, bankAccounts, bankTransactions, reconciliationMatches, type Tx } from '@plantero/db';
import { postJournalEntry } from '../accounting/journal.js';
import { importStatement, runReconciliation, approveMatch, rejectMatch, manualMatch, findInvoiceCandidates, AUTO_APPLY_THRESHOLD } from './bankReconciliation.js';
import { withRollback, seedBase, ctx, d, today, type Base } from '../__tests__/helpers.js';
import { round4 } from '../money.js';

async function ensureJournals(tx: Tx) {
  for (const j of [
    { code: 'SAT', name: 'Satış Yevmiyesi', kind: 'sales' as const, defaultAccountCode: '600' },
    { code: 'BNK', name: 'Banka Yevmiyesi', kind: 'bank' as const, defaultAccountCode: '102' },
    { code: 'KUR', name: 'Kur Farkı Yevmiyesi', kind: 'fx' as const },
  ]) {
    await tx.insert(journals).values(j).onConflictDoNothing({ target: journals.code });
  }
}

async function makeInvoice(tx: Tx, opts: { partnerId: string; grandTotal: string; dueDate?: string }) {
  const grandTotal = round4(d(opts.grandTotal));
  const docNo = `TEST-INV-${Math.random().toString(36).slice(2, 8)}`;
  const [invoice] = await tx
    .insert(invoices)
    .values({
      docNo, kind: 'sales', status: 'posted', partnerId: opts.partnerId, invoiceDate: today(), dueDate: opts.dueDate ?? today(),
      currency: 'TRY', exchangeRate: '1', subtotal: grandTotal.toFixed(4), vatTotal: '0.0000', grandTotal: grandTotal.toFixed(4),
      grandTotalTry: grandTotal.toFixed(4), residual: grandTotal.toFixed(4), origin: 'manual',
    })
    .returning();
  await postJournalEntry(tx, {
    ledger: 'both', journalCode: 'SAT', entryDate: new Date(), description: `Test fatura ${docNo}`, refType: 'invoice', refId: invoice!.id,
    refNo: docNo, partnerId: opts.partnerId, lines: [{ accountCode: '120', debit: grandTotal, partnerId: opts.partnerId }, { accountCode: '600', credit: grandTotal }], origin: 'manual',
  }, ctx);
  return invoice!;
}

async function makeBankAccount(tx: Tx, code: string) {
  const [row] = await tx.insert(bankAccounts).values({ code, bankName: 'Test Banka', currency: 'TRY', accountCode: '102', connectorKind: 'manual' }).returning();
  return row!;
}

describe('finance/bankReconciliation', () => {
  it('importStatement: satırları içe aktarır, aynı externalRef ikinci kez tekrar edilmez', async () => {
    await withRollback(async (tx) => {
      const account = await makeBankAccount(tx, `BA-${Math.random().toString(36).slice(2, 6)}`);
      const line = { externalRef: 'EXT-001', txDate: today(), amount: d(1000), description: 'Test havale' };

      const first = await importStatement(tx, { bankAccountId: account.id, source: 'csv', lines: [line] }, ctx);
      expect(first.importedCount).toBe(1);
      expect(first.duplicateCount).toBe(0);

      const second = await importStatement(tx, { bankAccountId: account.id, source: 'csv', lines: [line] }, ctx);
      expect(second.importedCount).toBe(0);
      expect(second.duplicateCount).toBe(1);

      const rows = await tx.select().from(bankTransactions).where(eq(bankTransactions.bankAccountId, account.id));
      expect(rows).toHaveLength(1);
    });
  });

  it('findInvoiceCandidates: tutar + cari adı eşleşen fatura yüksek güvenle önerilir', async () => {
    await withRollback(async (tx) => {
      const b: Base = await seedBase(tx);
      await ensureJournals(tx);
      const invoice = await makeInvoice(tx, { partnerId: b.customer.id, grandTotal: '5000' });
      const account = await makeBankAccount(tx, `BA-${Math.random().toString(36).slice(2, 6)}`);
      const [bt] = await tx
        .insert(bankTransactions)
        .values({ bankAccountId: account.id, externalRef: 'EXT-CAND', txDate: today(), amount: '5000.0000', description: `Havale ${b.customer.name}` })
        .returning();

      const candidates = await findInvoiceCandidates(tx, bt!);
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0]!.invoiceId).toBe(invoice.id);
      expect(candidates[0]!.confidence).toBeGreaterThanOrEqual(AUTO_APPLY_THRESHOLD);
    });
  });

  it('runReconciliation: tek + yüksek güvenli aday otomatik uygulanır (auto_applied), fatura kapanır', async () => {
    await withRollback(async (tx) => {
      const b: Base = await seedBase(tx);
      await ensureJournals(tx);
      const invoice = await makeInvoice(tx, { partnerId: b.customer.id, grandTotal: '2500' });
      const account = await makeBankAccount(tx, `BA-${Math.random().toString(36).slice(2, 6)}`);
      await tx.insert(bankTransactions).values({ bankAccountId: account.id, externalRef: 'EXT-AUTO', txDate: today(), amount: '2500.0000', description: `Havale ${b.customer.name}` });

      const result = await runReconciliation(tx, { bankAccountId: account.id }, ctx);
      expect(result.autoApplied).toBe(1);
      expect(result.suggested).toBe(0);

      const [bt] = await tx.select().from(bankTransactions).where(eq(bankTransactions.bankAccountId, account.id));
      expect(bt!.status).toBe('matched');
      expect(bt!.matchedPaymentId).not.toBeNull();

      const [updatedInvoice] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id));
      expect(updatedInvoice!.status).toBe('paid');

      const matches = await tx.select().from(reconciliationMatches).where(eq(reconciliationMatches.bankTransactionId, bt!.id));
      expect(matches).toHaveLength(1);
      expect(matches[0]!.status).toBe('auto_applied');
    });
  });

  it('runReconciliation: belirsiz/düşük güvenli aday öneri olarak bırakılır (suggested), onayla akışı tahsilatı üretir', async () => {
    // NOT: gerçek (seed edilmiş) veritabanına karşı çalıştığından, tutar penceresi içinde başka
    // faturalardan da zayıf adaylar sızabilir — bu yüzden "kendi" adayımızı invoiceIds ile buluyoruz,
    // ilk satırı varsaymıyoruz (bkz. rejectMatch testindeki not).
    await withRollback(async (tx) => {
      const b: Base = await seedBase(tx);
      await ensureJournals(tx);
      const invoice = await makeInvoice(tx, { partnerId: b.customer.id, grandTotal: '3000', dueDate: '2030-06-01' });
      const account = await makeBankAccount(tx, `BA-${Math.random().toString(36).slice(2, 6)}`);
      // Cari adı eşleşir (nameScore) ama tutar ±%5 içinde tam değil ve vade uzak ⇒ toplam güven <0.92
      // (otomatik uygulanmaz) — ama cari adı YALNIZCA bu carinin özel adı olduğundan diğer (seed) faturalar
      // arasında en yüksek skoru garantiler (kirlenmeye dayanıklı).
      await tx.insert(bankTransactions).values({ bankAccountId: account.id, externalRef: 'EXT-LOW', txDate: today(), amount: '3090.0000', description: `Havale ${b.customer.name}` });

      const result = await runReconciliation(tx, { bankAccountId: account.id }, ctx);
      expect(result.suggested).toBeGreaterThanOrEqual(1);
      expect(result.autoApplied).toBe(0);

      const [bt] = await tx.select().from(bankTransactions).where(eq(bankTransactions.bankAccountId, account.id));
      expect(bt!.status).toBe('suggested');

      const candidateMatches = await tx.select().from(reconciliationMatches).where(eq(reconciliationMatches.bankTransactionId, bt!.id));
      const match = candidateMatches.find((m) => m.invoiceIds?.[0] === invoice.id);
      expect(match).toBeTruthy();
      expect(match!.status).toBe('suggested');

      const { paymentId } = await approveMatch(tx, match!.id, ctx);
      expect(paymentId).toBeTruthy();

      const [approvedMatch] = await tx.select().from(reconciliationMatches).where(eq(reconciliationMatches.id, match!.id));
      expect(approvedMatch!.status).toBe('approved');

      const [btAfter] = await tx.select().from(bankTransactions).where(eq(bankTransactions.id, bt!.id));
      expect(btAfter!.status).toBe('matched');
      expect(btAfter!.matchedPaymentId).toBe(paymentId);
    });
  });

  it('rejectMatch: reddedilen tek öneri sonrası hareket unmatched kalır', async () => {
    // NOT: runReconciliation gerçek (seed edilmiş) veritabanına karşı skorlama yaptığından, düşük güvenli
    // bir aday senaryosunda başka faturalardan da zayıf aday sızabilir (istenen davranış — birden çok
    // öneri varsa biri reddedilince hareket unmatched'a dönmemeli). Bu test rejectMatch'in KENDİ mantığını
    // (tek öneri → red → unmatched) izole doğrular: öneri elle, tek satır olarak kurulur.
    await withRollback(async (tx) => {
      const b: Base = await seedBase(tx);
      const invoice = await makeInvoice(tx, { partnerId: b.customer.id, grandTotal: '9000', dueDate: today() });
      const account = await makeBankAccount(tx, `BA-${Math.random().toString(36).slice(2, 6)}`);
      const [bt] = await tx.insert(bankTransactions).values({ bankAccountId: account.id, externalRef: 'EXT-REJ', txDate: today(), amount: '9100.0000', status: 'suggested', description: 'Bilinmeyen' }).returning();
      const [match] = await tx
        .insert(reconciliationMatches)
        .values({ bankTransactionId: bt!.id, kind: 'invoice', status: 'suggested', partnerId: b.customer.id, invoiceIds: [invoice.id], allocations: [{ invoiceId: invoice.id, amount: '9000.0000' }], confidence: '0.5000', rationale: 'test', source: 'rule' })
        .returning();

      await rejectMatch(tx, match!.id, 'yanlış aday', ctx);

      const [btAfter] = await tx.select().from(bankTransactions).where(eq(bankTransactions.id, bt!.id));
      expect(btAfter!.status).toBe('unmatched');
      const [matchAfter] = await tx.select().from(reconciliationMatches).where(eq(reconciliationMatches.id, match!.id));
      expect(matchAfter!.status).toBe('rejected');
    });
  });

  it('manualMatch: elle eşleştirme öneri beklemeden tahsilat üretir ve hareketi kapatır', async () => {
    await withRollback(async (tx) => {
      const b: Base = await seedBase(tx);
      await ensureJournals(tx);
      const invoice = await makeInvoice(tx, { partnerId: b.customer.id, grandTotal: '750' });
      const account = await makeBankAccount(tx, `BA-${Math.random().toString(36).slice(2, 6)}`);
      const [bt] = await tx.insert(bankTransactions).values({ bankAccountId: account.id, externalRef: 'EXT-MAN', txDate: today(), amount: '750.0000', description: 'İsimsiz havale' }).returning();

      const { paymentId } = await manualMatch(tx, bt!.id, { partnerId: b.customer.id, invoiceId: invoice.id, amount: d(750) }, ctx);
      expect(paymentId).toBeTruthy();

      const [btAfter] = await tx.select().from(bankTransactions).where(eq(bankTransactions.id, bt!.id));
      expect(btAfter!.status).toBe('matched');
      const [updatedInvoice] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id));
      expect(updatedInvoice!.status).toBe('paid');
    });
  });
});
