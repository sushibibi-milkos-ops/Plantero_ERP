-- I35 — Kredi hesap planı bakiyesi: aktif her kredinin 300.xx (Banka Kredileri) alt hesap
-- bakiyesi (posted journal_lines, credit-debit), VUK ve UFRS için ayrı ayrı,
-- loans.remaining_principal'e eşit olmalı.
--
-- Kök neden notu: `accounts` tablosunda her kredi için özel açılmış bir alt hesap var
-- (300.01..300.07, isimleri loans.product_name ile birebir eşleşiyor) ve loans.remaining_principal
-- toplamı (bugün 5.653.346,57 TL) gerçek bir yükümlülüğü temsil ediyor, ama `packages/core/src`
-- içinde `loans`/`loan_installments` okuyan/yazan TEK satır kod yok (`grep -rln "loans\b" packages/core/src`
-- → 0 sonuç) ve `apps/web/src/app` altında kredi ekranı da yok — yani ne kredinin açılış bakiyesi
-- (300.xx'e alacak) ne de bir taksit ödemesi (300.xx'e borç + 780 faiz gideri + banka/kasa alacağı)
-- için tek bir yevmiye fişi hiç üretilmemiş. Sonuç: muhasebe defterlerinde (VUK da UFRS de) bu
-- 5,65 milyon TL'lik banka kredisi yükümlülüğü YOK — bilanço bu kadar eksik gösteriyor. Bu, I9-I18'i
-- döşeyen "tahsilat/banka" ortak bulgusunun (`payments`/`bank_transactions` kod yok) ve I31'in
-- ("channel_settlements" kod yok) aynı örüntüsünün kredi tarafındaki eşleniği.
--
-- Düzeltme önerisi: `packages/core/src/finance/loans.ts` yaz — (a) her aktif kredi için tek seferlik
-- açılış fişi (300.xx'e alacak, karşı taraf muhtemelen 102/varlık ya da özkaynak açılış hesabı,
-- VUK+UFRS ikiz), (b) `postLoanInstallmentPayment(loanId, seq)` → aynı transaction'da
-- `recordPayment`/`postJournalEntry` ile 300.xx borç (anapara) + 780 borç (faiz+BSMV) + banka/kasa
-- alacak fişi üretsin, `loan_installments.status='paid'`+`bankTransactionId`/`journalEntryId` doldursun.

WITH loan_ledger AS (
  SELECT
    l.id AS loan_id, l.code AS loan_code, l.remaining_principal, l.account_code, led.ledger
  FROM loans l
  CROSS JOIN (VALUES ('VUK'), ('UFRS')) AS led(ledger)
  WHERE l.is_active AND l.account_code IS NOT NULL
),
balances AS (
  SELECT jl.account_code, je.ledger, SUM(jl.credit - jl.debit) AS balance
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.entry_id
  WHERE je.status IN ('posted', 'reversed')
  GROUP BY jl.account_code, je.ledger
)
SELECT
  'I35' AS rule, 'loan_account_balance_mismatch' AS entity,
  (ll.loan_id::text || ':' || ll.ledger) AS id,
  ll.remaining_principal::numeric(18, 4) AS expected,
  COALESCE(b.balance, 0)::numeric(18, 4) AS actual,
  (COALESCE(b.balance, 0) - ll.remaining_principal)::numeric(18, 4) AS diff
FROM loan_ledger ll
LEFT JOIN balances b ON b.account_code = ll.account_code AND b.ledger::text = ll.ledger
WHERE abs(COALESCE(b.balance, 0) - ll.remaining_principal) > 0
ORDER BY id;
