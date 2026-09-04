-- I35 — Kredi hesap planı bakiyesi: aktif her kredinin 300.xx (Banka Kredileri) alt hesap
-- bakiyesi (posted journal_lines, credit-debit), VUK ve UFRS için ayrı ayrı, o kredinin ÖDENMEMİŞ
-- (status <> 'paid') taksitlerinin anapara (principal) toplamına eşit olmalı.
--
-- **Tur 7 düzeltmesi (P0, veri-critic — kendi kontrolündeki tasarım çelişkisi, CANLI OLARAK YAKALANDI)**:
-- Bu kural önceden `loans.remaining_principal` alanını "expected" olarak kullanıyordu. Ancak
-- `remaining_principal`, I34(c)'nin ZORUNLU kıldığı gibi, kredi takviminin (`loan_installments`)
-- TÜM satırlarının (durumdan BAĞIMSIZ) anapara toplamına eşit SABİT bir referans değerdir (Excel içe
-- aktarım anındaki toplam anapara — `packages/db/src/import/nakitakisi.ts`); canlı bir "kalan bakiye"
-- alanı DEĞİLDİR (schema donduğundan ayrı bir "canlı bakiye" kolonu yok — bkz.
-- `packages/core/src/finance/loans.ts` üst yorumu, satır 28-38). `postLoanInstallmentPayment` (aynı
-- dosya) bilinçli olarak bu alanı DEĞİŞTİRMEZ, tam da bu iki kuralın (eski I35 ile I34-c) BİRBİRİYLE
-- ÇELİŞMESİNİ önlemek için — ama bunun bedeli, taksit ödemesi POSTALANDIĞI ANDA eski I35'in anlıksız
-- kırmızıya düşmesiydi (I34-c ile eski I35 aynı anda yalnızca HİÇBİR taksit ödenmemişken tutarlı
-- olabiliyordu — yapısal olarak birbiriyle uyumsuz iki beklenti).
-- Canlı doğrulama: `db:reset` sonrası arka planda kredi L2 (`6b66455d-...`) için taksit #1
-- (`917947c5-...`, anapara 21.579,73 TL) banka mutabakatı (`reconciliation_matches`,
-- kind='loan_installment', `postLoanInstallmentPayment` üzerinden) ile ÖDENDİ işaretlendi — 300.02
-- hesabına gerçek bir borç kaydı (VUK+UFRS) düştü, `loans.remaining_principal` (I34-c gereği,
-- kasıtlı olarak) 1.500.000,00 TL'de sabit kaldı. Eski I35 anında **2 ihlal** verdi (VUK+UFRS,
-- diff=-21.579,73 — ledger < eski expected). Doğru "beklenen" değer, kredinin HENÜZ ÖDENMEMİŞ
-- taksitlerinin anapara toplamıdır (bu örnekte 1.478.420,27 TL) — ki bu TAM OLARAK gerçek 300.02
-- ledger bakiyesine eşittir; sorun kredi/muhasebe modülünde değil, eski I35'in "expected" formülündeydi.
-- **schemaRequests**: `loans` tablosuna canlı bir `outstanding_principal` (veya benzeri) kolonu
-- eklenmesi önerilir — böylece hem I34(c) (statik referans) hem I35 (canlı bakiye) kendi ayrı,
-- birbiriyle çelişmeyen alanlarını doğrulamış olur; bugünkü çözüm (`loan_installments.status`'tan
-- türetme) doğru ama her okuma tüm takvimi tarıyor, tek bir denormalize alan daha ucuz olurdu.

WITH loan_ledger AS (
  SELECT
    l.id AS loan_id, l.code AS loan_code, l.account_code, led.ledger,
    COALESCE((
      SELECT SUM(li.principal) FROM loan_installments li WHERE li.loan_id = l.id AND li.status <> 'paid'
    ), 0) AS expected_outstanding_principal
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
  ll.expected_outstanding_principal::numeric(18, 4) AS expected,
  COALESCE(b.balance, 0)::numeric(18, 4) AS actual,
  (COALESCE(b.balance, 0) - ll.expected_outstanding_principal)::numeric(18, 4) AS diff
FROM loan_ledger ll
LEFT JOIN balances b ON b.account_code = ll.account_code AND b.ledger::text = ll.ledger
WHERE abs(COALESCE(b.balance, 0) - ll.expected_outstanding_principal) > 0
ORDER BY id;
