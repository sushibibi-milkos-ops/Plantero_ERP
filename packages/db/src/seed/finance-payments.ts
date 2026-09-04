import { and, eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { invoices, partners, bankAccounts, exchangeRates, reconciliationMatches, bankTransactions } from '../schema/index.js';
import { D, SYSTEM_ACTOR, writeAudit, recordPayment, importStatement, runReconciliation, approveMatch, getAccountBalance } from '@plantero/core';
import { log, type SeedSummary } from './_helpers.js';

/**
 * Tahsilat/ödeme + banka mutabakatı geriye dönük dolgusu — docs/modules/finans.md, docs/INVARIANTS.md
 * tur 8 P0 bulgusu (I9/I10/I11/I13/I18: `payments`/`payment_allocations`/`bank_transactions` fresh seed
 * sonrası 0 satırdı, bu üç tabloyu YAZAN hiçbir servis yoktu). `packages/core/src/finance/{payments,
 * bankReconciliation}.ts` yazıldıktan sonra buradaki geriye dönük dolgu, satın-alma modülünün I23/I24
 * seed-backfill örüntüsünü izler: en az birkaç fatura gerçekten tahsil/ödenmiş, birkaç banka hareketi
 * gerçekten mutabık kılınmış (otomatik + onaylı + gerçekten eşleşmemiş) hale getirilir — böylece I9/I10/
 * I11/I13/I18 hem "tahsilat" hem "kalan" dalını gerçekten egzersiz eder (yalnızca veri yokluğundan
 * geçmez). Canlı akış (bir kullanıcının `/finans/tahsilat` formundan tahsilat girmesi ya da
 * `/finans/banka`'dan öneri onaylaması) `packages/core/src/finance/*` üzerinden buradakiyle AYNI
 * servisleri kullanır — bu dosya yalnızca geçmişe dönük demo veri üretir, yeni bir yazma yolu açmaz.
 *
 * Bu adım `sales`'ten SONRA, `purchasing-backfill`'den ÖNCE çalışır (bkz. `seed/index.ts`) — o ana kadar
 * hem satış (sales seed) hem alış (stock seed'inin otomatik faturaladığı) faturaların tamamı zaten var.
 */

async function auditCreate(tx: DbOrTx, tableName: string, recordId: string | undefined, summary: string): Promise<void> {
  await writeAudit(tx, { action: 'create', tableName, recordId: recordId ?? null, summary }, SYSTEM_ACTOR);
}

async function invoiceByDocNo(tx: DbOrTx, docNo: string) {
  const [row] = await tx.select().from(invoices).where(eq(invoices.docNo, docNo)).limit(1);
  if (!row) throw new Error(`seed:finance-payments — fatura bulunamadı: ${docNo}`);
  return row;
}
async function partnerById(tx: DbOrTx, id: string) {
  const [row] = await tx.select().from(partners).where(eq(partners.id, id)).limit(1);
  if (!row) throw new Error(`seed:finance-payments — cari bulunamadı: ${id}`);
  return row;
}
async function bankAccountByCode(tx: DbOrTx, code: string) {
  const [row] = await tx.select().from(bankAccounts).where(eq(bankAccounts.code, code)).limit(1);
  if (!row) throw new Error(`seed:finance-payments — banka hesabı bulunamadı: ${code}`);
  return row;
}

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * I33 / tur 13 P0 kök neden düzeltmesi: bu seed'in tüm tarih formülleri faturanın VADE tarihine göre
 * ("vadeden N gün önce/sonra") hesaplanıyordu, `CURRENT_DATE`'e göre DEĞİL — sipariş tarihleri
 * `2026-08-01…TODAY` aralığına yayıldığından (bkz. `sales.ts`), 30 günlük vade + "vadeden 2 gün önce
 * tahsilat" bugünden onlarca gün İLERİDE bir "tahsilat/ödeme/banka hareketi" üretiyordu — canlı
 * `recordPayment` artık bunu zaten reddediyor (packages/core/src/finance/payments.ts). Bu yardımcı,
 * doğal (vadeye göre) tarih bugünü aşarsa onu bugünün bir gün gerisine sabitler; vade zaten geçmişse
 * doğal tarih aynen kullanılır — yalnızca `due_date < bugün` olan faturalar "vadesinden önce tahsil
 * edilmiş" kurgusuna tam olarak girer, geleceğe düşenler bugünün gerisine sıkıştırılır.
 */
const TODAY = new Date().toISOString().slice(0, 10);
const capFuture = (iso: string): string => (iso > TODAY ? addDays(TODAY, -1) : iso);

/** Bir faturayı doğrudan (banka hareketi olmadan — "geçmişte manuel girilmiş") tam ya da kısmi tahsil/öder */
async function directPay(tx: DbOrTx, docNo: string, opts: { partialAmount?: string; bankAccountId?: string; method?: 'bank_transfer' | 'cash' } = {}) {
  const invoice = await invoiceByDocNo(tx, docNo);
  const direction = invoice.kind === 'sales' ? 'inbound' : 'outbound';
  const amount = opts.partialAmount ? D(opts.partialAmount) : D(invoice.residual);
  const { payment } = await recordPayment(tx, {
    direction, method: opts.method ?? 'bank_transfer', partnerId: invoice.partnerId, bankAccountId: opts.bankAccountId ?? null,
    paymentDate: capFuture(addDays(invoice.dueDate, -2)), currency: invoice.currency, amount,
    allocations: [{ invoiceId: invoice.id, amount }], origin: 'manual',
    note: 'Seed geriye dönük dolgu — geçmiş tahsilat/ödeme kaydı',
  }, SYSTEM_ACTOR);
  await auditCreate(tx, 'payments', payment.id, `${direction === 'inbound' ? 'Tahsilat' : 'Ödeme'} ${payment.docNo} (seed backfill): ${docNo}`);
  return payment;
}

export async function seedFinancePayments(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  log('finance-payments', 'geçmişe dönük tahsilat/ödeme + banka mutabakatı dolgusu...');

  const vkfTl = await bankAccountByCode(tx, 'VKF-TIRE-TL');
  const qnbTl = await bankAccountByCode(tx, 'QNB-ODEMIS-TL');

  let paymentCount = 0;

  /* -------------------------------------------------------------- */
  /* 1) Satış faturaları — doğrudan (banka akışı dışı) tahsilat      */
  /* -------------------------------------------------------------- */
  for (const docNo of ['INV-2026-000001', 'INV-2026-000002', 'INV-2026-000003', 'INV-2026-000004', 'INV-2026-000005', 'INV-2026-000006', 'INV-2026-000008']) {
    await directPay(tx, docNo, { bankAccountId: vkfTl.id });
    paymentCount++;
  }
  // Kısmi tahsilat (partially_paid dalı — I10 residual/status tutarlılığı gerçek veriyle egzersiz edilir)
  await directPay(tx, 'INV-2026-000007', { partialAmount: '1000.0000', bankAccountId: vkfTl.id });
  paymentCount++;

  // Dövizli fatura: tahsilat KENDİ tarihinde farklı bir TCMB kuruyla yapılır ⇒ gerçek kur farkı fişi
  // doğar (I13 b/c — fx_difference + fx_journal_entry_id, o zamana kadar hiçbir kod yolu bunu üretmiyordu).
  const eurInvoice = await invoiceByDocNo(tx, 'INV-2026-000012');
  const eurPaymentDate = capFuture(addDays(eurInvoice.dueDate, 1));
  await tx
    .insert(exchangeRates)
    .values({ currency: 'EUR', rateDate: eurPaymentDate, buying: '38.500000', selling: '38.700000', source: 'TCMB' })
    .onConflictDoUpdate({ target: [exchangeRates.currency, exchangeRates.rateDate], set: { buying: '38.500000', selling: '38.700000' } });
  const { payment: eurPayment } = await recordPayment(tx, {
    direction: 'inbound', method: 'bank_transfer', partnerId: eurInvoice.partnerId, bankAccountId: (await bankAccountByCode(tx, 'VKF-TIRE-EUR')).id,
    paymentDate: eurPaymentDate, currency: 'EUR', amount: D(eurInvoice.residual), allocations: [{ invoiceId: eurInvoice.id, amount: D(eurInvoice.residual) }],
    origin: 'manual', note: 'Seed geriye dönük dolgu — dövizli tahsilat, kur farkı fişi doğurur',
  }, SYSTEM_ACTOR);
  await auditCreate(tx, 'payments', eurPayment.id, `Tahsilat ${eurPayment.docNo} (seed backfill, kur farkı: ${eurPayment.fxDifference}): INV-2026-000012`);
  paymentCount++;

  /* -------------------------------------------------------------- */
  /* 2) Alış faturaları — doğrudan ödeme                             */
  /* -------------------------------------------------------------- */
  for (const docNo of ['PINV-2026-000001', 'PINV-2026-000002', 'PINV-2026-000003']) {
    await directPay(tx, docNo, { bankAccountId: vkfTl.id });
    paymentCount++;
  }
  await directPay(tx, 'PINV-2026-000004', { partialAmount: '21840.0000', bankAccountId: vkfTl.id });
  paymentCount++;

  summary.add('payments (doğrudan)', paymentCount);

  /* -------------------------------------------------------------- */
  /* 3) Banka ekstresi + AI Mutabakat Ajanı — CANLI akışın demo veri  */
  /*    üzerinden çalıştırılması (import → skorla → otomatik/öneri)  */
  /* -------------------------------------------------------------- */
  const inv9 = await invoiceByDocNo(tx, 'INV-2026-000009');
  const p9 = await partnerById(tx, inv9.partnerId);
  const inv10 = await invoiceByDocNo(tx, 'INV-2026-000010');
  const p10 = await partnerById(tx, inv10.partnerId);
  const inv11 = await invoiceByDocNo(tx, 'INV-2026-000011');
  const p11 = await partnerById(tx, inv11.partnerId);
  const inv13 = await invoiceByDocNo(tx, 'INV-2026-000013');
  const pinv6 = await invoiceByDocNo(tx, 'PINV-2026-000006');
  const pinv6Partner = await partnerById(tx, pinv6.partnerId);

  const { importedCount } = await importStatement(tx, {
    bankAccountId: vkfTl.id, source: 'open_banking',
    lines: [
      // Tutar birebir + cari adı + vadeye yakın ⇒ otomatik uygulanır (auto_applied)
      // (I33) `runReconciliation`/`approveMatch` otomatik uygulanan hareketler için `recordPayment`'ı
      // hareketin `txDate`'iyle çağırır — o da artık bugünden ileri tarihi reddeder; bu yüzden
      // `txDate`'ler de `capFuture` ile bugünün gerisine sabitlenir (aksi halde seed burada patlar).
      { externalRef: 'SEED-BT-001', txDate: capFuture(inv9.dueDate), amount: D(inv9.residual), description: `Havale — ${p9.name}`, counterpartyName: p9.name, txType: 'havale' },
      { externalRef: 'SEED-BT-002', txDate: capFuture(inv10.dueDate), amount: D(inv10.residual), description: `EFT — ${p10.name}`, counterpartyName: p10.name, txType: 'eft' },
      { externalRef: 'SEED-BT-003', txDate: capFuture(inv11.dueDate), amount: D(inv11.residual), description: `Havale — ${p11.name}`, counterpartyName: p11.name, txType: 'havale' },
      // Tedarikçiye ödeme yönünde otomatik eşleşme (negatif tutar = çıkış)
      { externalRef: 'SEED-BT-004', txDate: capFuture(pinv6.dueDate), amount: D(pinv6.residual).neg(), description: `EFT — ${pinv6Partner.name}`, counterpartyName: pinv6Partner.name, txType: 'eft' },
      // Belirsiz: tutar ±%1 içinde ama cari adı yok, tarih uzak ⇒ düşük güven, öneri olarak kalır
      { externalRef: 'SEED-BT-005', txDate: capFuture(addDays(inv13.dueDate, 45)), amount: D('2700.0000'), description: 'Havale', txType: 'havale' },
      // Gerçekten eşleşmeyen hareketler (banka masrafı / tanınmayan pazaryeri hakedişi) — mutabakat
      // dışında kalır; bu modülün kapsamı gider/kredi taksiti eşleştirmeyi kapsamıyor (bkz. issues).
      { externalRef: 'SEED-BT-006', txDate: capFuture(addDays(inv13.dueDate, 10)), amount: D('-450.7500'), description: 'SEDAŞ Elektrik Faturası', txType: 'fee' },
      { externalRef: 'SEED-BT-007', txDate: capFuture(addDays(inv13.dueDate, 12)), amount: D('5000.0000'), description: 'Trendyol Hakediş — tanımsız dönem', txType: 'marketplace_payout' },
    ],
  }, SYSTEM_ACTOR);

  const reconResult = await runReconciliation(tx, { bankAccountId: vkfTl.id }, SYSTEM_ACTOR);
  await auditCreate(tx, 'bank_transactions', undefined, `Mutabakat (seed backfill): ${importedCount} hareket içe aktarıldı, ${reconResult.autoApplied} otomatik uygulandı, ${reconResult.suggested} öneri üretildi`);
  // `runReconciliation`/`approveMatch` (core) kendi audit satırını yazmaz (sözleşme: purchasing/orders.ts
  // ile aynı örüntü — audit yalnızca çağıran katmanda üretilir). Otomatik uygulanan her tahsilat/ödeme
  // için (I17: son 24 saatteki her `payments` kaydının audit_log karşılığı olmalı) burada tek tek yazılır.
  const autoApplied = await tx
    .select({ paymentId: reconciliationMatches.paymentId })
    .from(reconciliationMatches)
    .where(and(eq(reconciliationMatches.status, 'auto_applied'), sql`${reconciliationMatches.bankTransactionId} IN (SELECT id FROM bank_transactions WHERE bank_account_id = ${vkfTl.id})`));
  for (const m of autoApplied) {
    if (m.paymentId) await auditCreate(tx, 'payments', m.paymentId, 'Tahsilat/ödeme AI Mutabakat Ajanı tarafından otomatik uygulandı (seed backfill)');
  }

  // Belirsiz öneriyi (SEED-BT-005) onayla — "öneri → onay → tahsilat + fiş" zincirinin de gerçekten
  // egzersiz edildiğini kanıtlar (yalnızca otomatik dal değil).
  const [ambiguousBt] = await tx.select().from(bankTransactions).where(and(eq(bankTransactions.bankAccountId, vkfTl.id), eq(bankTransactions.externalRef, 'SEED-BT-005'))).limit(1);
  if (ambiguousBt) {
    const [match] = await tx.select().from(reconciliationMatches).where(and(eq(reconciliationMatches.bankTransactionId, ambiguousBt.id), eq(reconciliationMatches.status, 'suggested'))).limit(1);
    if (match) {
      const { paymentId } = await approveMatch(tx, match.id, SYSTEM_ACTOR);
      await auditCreate(tx, 'reconciliation_matches', match.id, `Mutabakat önerisi onaylandı (seed backfill): ${match.id} → tahsilat ${paymentId}`);
      await auditCreate(tx, 'payments', paymentId, 'Tahsilat mutabakat önerisi onaylanarak kaydedildi (seed backfill)');
    }
  }

  const [bankTxCount] = await tx.select({ cnt: sql<string>`count(*)` }).from(bankTransactions).where(eq(bankTransactions.bankAccountId, vkfTl.id));
  summary.add('bank_transactions', Number(bankTxCount?.cnt ?? 0));
  const [matchCount] = await tx.select({ cnt: sql<string>`count(*)` }).from(reconciliationMatches);
  summary.add('reconciliation_matches', Number(matchCount?.cnt ?? 0));

  /* -------------------------------------------------------------- */
  /* 4) Banka hesabı ekstre bakiyeleri — gösterim için gerçekçi       */
  /* -------------------------------------------------------------- */
  const vkfLedger = await getAccountBalance(tx, { accountCode: vkfTl.accountCode, ledger: 'VUK' });
  await tx.update(bankAccounts).set({ statementBalance: vkfLedger.toFixed(4), statementBalanceAt: new Date(), lastSyncedAt: new Date() }).where(eq(bankAccounts.id, vkfTl.id));
  // QNB hesabında kasıtlı bir ekstre/defter farkı bırakılır (henüz senkronize edilmemiş banka masrafı
  // senaryosu) — `/finans/banka` kartındaki "Fark" göstergesinin veri üzerinde de doğrulanabilmesi için.
  await tx.update(bankAccounts).set({ statementBalance: '1250.0000', statementBalanceAt: new Date() }).where(eq(bankAccounts.id, qnbTl.id));

  log('finance-payments', `tamamlandı: ${paymentCount} doğrudan tahsilat/ödeme, ${importedCount} banka hareketi, ${reconResult.autoApplied} otomatik eşleşme.`);
}
