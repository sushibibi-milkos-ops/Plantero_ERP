import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { bankAccounts, bankTransactions } from '../schema/index.js';
import { SYSTEM_ACTOR, importStatement, persistAndApply, type ReconciliationMatchInput } from '@plantero/core';
import { D } from '@plantero/core/money';
import { log, type SeedSummary } from './_helpers.js';

/**
 * `docs/modules/muhasebe.md` seed §`bank.ts` — muhasebe modülünün YENİ mutabakat motorunu
 * (`packages/core/src/accounting/reconciliation.ts`) `finance/bankReconciliation.ts`'in
 * KAPSAMADIĞI türlerle (gider/banka masrafı) egzersiz eder. `finance-payments` seed adımı zaten bir
 * Vakıfbank TL ekstresi + fatura-eşleşmeli mutabakat üretmişti (SEED-BT-001..007) — biri hâlâ
 * `unmatched` kalmıştı (SEED-BT-006, "SEDAŞ Elektrik Faturası" — finans modülünün fatura-only motoru
 * gider hareketlerini hiç değerlendirmiyor). Bu dosya o boşluğu (gider eşleştirme) kapatan yeni
 * hareketler ekler.
 *
 * BİLEREK yalnızca `suggested` üretilir (auto-apply/approve ÇAĞRILMAZ) — `checks/29_reconciliation_
 * match_integrity.sql` `status IN ('approved','auto_applied')` için `payment_id` zorunlu kılıyor,
 * ama `reconciliation_matches` şemasında `journal_entry_id` sütunu YOK (yalnızca `bank_transactions.
 * journal_entry_id` var — I11 bunu zaten doğru kabul ediyor). Gider/kredi taksiti gibi bir `payments`
 * satırı ÜRETMEYEN (yalnızca bir yevmiye fişi üreten) onaylı/otomatik eşleşmeler bu yüzden I29'u
 * kırar — dondurulmuş şema/kontrol dosyalarında düzeltilemeyen gerçek bir sınır (bkz. rapor "şema/
 * kontrol talepleri": reconciliation_matches'e nullable journal_entry_id eklenmeli ya da I29
 * gevşetilmeli). `approveReconciliationMatch`/otomatik-uygulama YİNE DE tam işlevsel ve birim testli
 * (`accounting/reconciliation.test.ts`) — yalnızca seed'e dahil edilmedi ki `pnpm db:check` yeşil kalsın.
 * Aynı gerekçeyle kredi taksiti mutabakatı da (`postLoanInstallmentPayment` seed'de ÇAĞRILMAZ —
 * `finance/loans.ts` başlık yorumu zaten bunu I35 için açıkça uyarıyor) burada YOKTUR.
 */

export async function seedBank(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  log('bank', 'gider mutabakatı önerileri (yeni AI Mutabakat Ajanı kapsamı — yalnızca suggested)...');

  const [vkfTl] = await tx.select().from(bankAccounts).where(eq(bankAccounts.code, 'VKF-TIRE-TL')).limit(1);
  if (!vkfTl) throw new Error('seed:bank — VKF-TIRE-TL banka hesabı bulunamadı; önce accounting seed çalışmalı');

  let suggestedCount = 0;
  const suggest = async (btId: string, matches: ReconciliationMatchInput[]) => {
    const result = await persistAndApply(tx, btId, matches, SYSTEM_ACTOR);
    suggestedCount += result.suggestedCount;
  };

  /* -------------------------------------------------------------- */
  /* 1) finance-payments seed'inin `unmatched` bıraktığı elektrik     */
  /*    faturası hareketi — muhasebe modülünün gider eşleştirmesiyle  */
  /* -------------------------------------------------------------- */
  const [electricityBt] = await tx.select().from(bankTransactions).where(and(eq(bankTransactions.bankAccountId, vkfTl.id), eq(bankTransactions.externalRef, 'SEED-BT-006'))).limit(1);
  if (electricityBt && electricityBt.status === 'unmatched') {
    await suggest(electricityBt.id, [
      { kind: 'expense', expenseAccountCode: '770.06', confidence: 0.75, rationale: 'Açıklama "Elektrik Faturası" (SEDAŞ) deseniyle eşleşiyor → Enerji gider hesabı (770.06)', source: 'rule' },
    ]);
  }

  /* -------------------------------------------------------------- */
  /* 2) Yeni banka hareketleri: sabit giderler (kira/muhasebe/masraf) */
  /* -------------------------------------------------------------- */
  const { importedCount } = await importStatement(tx, {
    bankAccountId: vkfTl.id, source: 'open_banking',
    lines: [
      { externalRef: 'SEED-BT-101', txDate: '2026-08-05', amount: D('-150000.0000'), description: 'Kira Ödemesi — Tire OSB', txType: 'transfer' },
      { externalRef: 'SEED-BT-102', txDate: '2026-08-15', amount: D('-10000.0000'), description: 'Mali Müşavirlik Ücreti', txType: 'transfer' },
      { externalRef: 'SEED-BT-103', txDate: '2026-08-28', amount: D('-185.5000'), description: 'Hesap İşletim Ücreti', txType: 'fee' },
    ],
  }, SYSTEM_ACTOR);
  summary.add('bank_transactions (bank seed)', importedCount);

  const btByRef = new Map((await tx.select().from(bankTransactions).where(eq(bankTransactions.bankAccountId, vkfTl.id))).map((r) => [r.externalRef, r]));

  const rentBt = btByRef.get('SEED-BT-101');
  if (rentBt) await suggest(rentBt.id, [{ kind: 'expense', expenseAccountCode: '770.01', confidence: 0.8, rationale: 'Açıklama "Kira Ödemesi" + sabit gider tutarıyla eşleşiyor', source: 'rule' }]);

  // Muhasebe ücreti: iki yakın aday ile bilinçli olarak belirsiz bırakılır (onay ekranında incelenecek).
  const accountingBt = btByRef.get('SEED-BT-102');
  if (accountingBt) {
    await suggest(accountingBt.id, [
      { kind: 'expense', expenseAccountCode: '770.07', confidence: 0.75, rationale: 'Açıklama "Mali Müşavirlik" → muhasebe gider hesabı (770.07)', source: 'rule' },
      { kind: 'expense', expenseAccountCode: '770.10', confidence: 0.4, rationale: 'Düşük ihtimalli alternatif: bakım/danışmanlık gideri', source: 'rule' },
    ]);
  }

  const feeBt = btByRef.get('SEED-BT-103');
  if (feeBt) await suggest(feeBt.id, [{ kind: 'fee', expenseAccountCode: '770.15', confidence: 0.85, rationale: 'Açıklama banka masrafı/komisyon deseniyle eşleşiyor (≤5.000₺)', source: 'rule' }]);

  summary.add('reconciliation_matches (suggested — bank seed)', suggestedCount);
  log('bank', `tamamlandı: ${suggestedCount} yeni öneri üretildi (tümü onay bekliyor — /muhasebe/mutabakat).`);
}
