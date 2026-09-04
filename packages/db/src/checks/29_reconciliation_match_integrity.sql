-- I29 — Mutabakat kaydı bütünlüğü (I11'in TERSİ yönü)
--   I11 şunu doğrular: bt.status='matched' ⇒ onaylı/otomatik bir reconciliation_matches VE payment/journal var.
--   Bu kural TERSİNİ doğrular: reconciliation_matches.status IN ('approved','auto_applied') ⇒
--     a) kind IN ('invoice','partner_on_account','marketplace_payout') ⇒ payment_id dolu olmalı
--        (packages/core/src/accounting/reconciliation.ts::applyMatch ilk iki kind için, ve ayrı bir yol
--        olan packages/core/src/sales/channelSettlements.ts kanal hakediş ödemesi eşleştirmesi
--        'marketplace_payout' için `recordPayment` çağırır, dönüşte paymentId döner)
--     b) kind IN ('loan_installment','expense','fee') ⇒ payment_id BOŞ, ama bağlı bank_transactions
--        satırının journal_entry_id'si dolu olmalı (applyMatch bu üç kind için DOĞRUDAN postJournalEntry/
--        postLoanInstallmentPayment çağırır ve `bank_transactions.journal_entry_id`'yi kendisi set eder —
--        payment_id hiç üretilmez, bu KASITLIDIR, eksiklik değildir)
--     c) her durumda bağlı bank_transactions satırı status='matched' olmalı
--     d) kind bu altı değerin dışındaysa (transfer/tax/unknown) approved/auto_applied durumuna hiç
--        ULAŞMAMALI — applyMatch bu kind'lar için DomainError('MATCH_KIND_UNSUPPORTED') fırlatır ve
--        channelSettlements.ts yalnızca 'marketplace_payout' üretir, yani böyle bir satırın varlığı
--        kendisi başlı başına bir tutarsızlıktır
--
-- **Tur 7 düzeltmesi (kendi kontrolündeki hata, İKİ AYRI CANLI OLAY — CANLI OLARAK YAKALANDI)**: eski (a)
-- kolu TÜM approved/auto_applied satırlarda payment_id zorunlu tutuyordu.
--   1) `packages/core/src/accounting/reconciliation.ts` (kanonik motor — bkz. 11_bank_reconciliation.sql
--      üst yorumu) `kind='loan_installment'` (ve 'expense'/'fee') için BİLİNÇLİ olarak payment_id
--      ÜRETMEZ — `postLoanInstallmentPayment`/doğrudan `postJournalEntry` ile yalnızca bir yevmiye fişi
--      atar ve onu `bank_transactions.journal_entry_id`'ye yazar (payments tablosuna hiç dokunmaz). Canlı
--      doğrulama: kredi L2 taksit #1 banka mutabakatıyla (kind='loan_installment', status='approved')
--      ödendi işaretlendiğinde (`ada857e1-...`) eski (a) kolu anında 1 ihlal verdi — ama
--      `bank_transactions.journal_entry_id` ZATEN doluydu ve status='matched' ZATEN doğruydu.
--   2) Ayrıca eski (d) kolu 'marketplace_payout'u desteklenmeyen kind sayıyordu — oysa
--      `channelSettlements.ts` bu kind'ı `recordPayment` ile payment_id ÜRETEREK, applyMatch'ten
--      TAMAMEN AYRI bir yoldan legalen kullanıyor (kanal hakediş ödemesi mutabakatı, I31/I32'nin
--      kapsadığı akış). Seed'in kendi ürettiği (`1170dd46-...`, kind='marketplace_payout', payment_id
--      dolu) bir satır bile eski (d) koluyla anında 1 ihlal veriyordu — seed verisi hiç değişmeden.
-- Düzeltme: (a) kolu artık invoice/partner_on_account/marketplace_payout'u kapsıyor, (b) kolu
-- loan_installment/expense/fee için journal_entry_id'yi zorunlu kılıyor, (d) kolu yalnızca gerçekten
-- desteklenmeyen (transfer/tax/unknown) kind'ları yakalıyor.

SELECT
  'I29' AS rule, 'reconciliation_match_missing_payment' AS entity, rm.id::text AS id,
  1::numeric(18, 4) AS expected, 0::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM reconciliation_matches rm
WHERE rm.status IN ('approved', 'auto_applied') AND rm.kind IN ('invoice', 'partner_on_account', 'marketplace_payout') AND rm.payment_id IS NULL

UNION ALL

SELECT
  'I29', 'reconciliation_match_missing_journal_entry', rm.id::text,
  1::numeric(18, 4), 0::numeric(18, 4), 1::numeric(18, 4)
FROM reconciliation_matches rm
JOIN bank_transactions bt ON bt.id = rm.bank_transaction_id
WHERE rm.status IN ('approved', 'auto_applied') AND rm.kind IN ('loan_installment', 'expense', 'fee') AND bt.journal_entry_id IS NULL

UNION ALL

SELECT
  'I29', 'reconciliation_match_bank_tx_not_matched', rm.id::text,
  1::numeric(18, 4), 0::numeric(18, 4), 1::numeric(18, 4)
FROM reconciliation_matches rm
JOIN bank_transactions bt ON bt.id = rm.bank_transaction_id
WHERE rm.status IN ('approved', 'auto_applied') AND bt.status <> 'matched'

UNION ALL

SELECT
  'I29', 'reconciliation_match_unsupported_kind_applied', rm.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM reconciliation_matches rm
WHERE rm.status IN ('approved', 'auto_applied')
  AND rm.kind NOT IN ('invoice', 'partner_on_account', 'loan_installment', 'expense', 'fee', 'marketplace_payout')

ORDER BY id;
