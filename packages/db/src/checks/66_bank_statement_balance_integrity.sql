-- I66 — Zorunlu denetim #8 ("banka & mutabakat"): banka ekstresi bakiye bütünlüğü.
--
-- Kök neden (tur 15 P0, `packages/core/src/finance/bankReconciliation.ts::importStatement` +
-- `apps/web/src/modules/accounting/actions.ts::importBankStatementAction`): MT940 formatı
-- (`packages/integrations/src/bank/mt940.ts::parseMt940`) `:60F:`/`:62F:` alanlarını ZORUNLU üretir
-- (eksikse throw eder) — bankanın KENDİ KENDİNİ doğrulayan açılış/kapanış bakiyesi. Web action
-- yalnızca `.transactions`i `importStatement`e aktarır, `openingBalance`/`closingBalance`i hiç
-- okumaz/geçirmez; bu yüzden (a) `bank_statement_imports.opening_balance/closing_balance` gerçek
-- MT940 içe aktarımlarında NULL kalır ve (b) `bank_accounts.statement_balance` (kokpit/muhasebe/finans
-- KPI kartları VE `cashflowRecompute`/nakit akışı tahmininin başlangıç noktası) HİÇBİR ZAMAN
-- güncellenmez, ilk değerinde (genelde '0.0000') donuk kalır — canlı kanıt: rollback'li vitest
-- probu (`_critic_probe_i66.test.ts`, egzersiz sonrası silindi), bkz. Tur 15 veri-critic notu.
--
-- Üç katman:
--   a) mt940 kaynaklı bir importta opening/closing NULL ise → veri kaybı sinyali (birincil, P0 sınıfı)
--   b) opening/closing doluysa: opening_balance + Σ bank_transactions.amount (o import) = closing_balance
--      (savunma — ekstre kendi kendini doğrular; parser/aktarım hatası olursa burada yakalanır)
--   c) bank_accounts.statement_balance = o hesabın EN SON (tx_date/created_at'e göre) closing_balance'ı
--      dolu olan içe aktarımının closing_balance'ı (savunma — KPI/nakit akışı tahmininin donuk kalmadığını
--      doğrular; import'lar zamanla artarsa yalnızca en güncel olan referans alınır)

SELECT
  'I66' AS rule, 'bank_statement_import_mt940_balance_missing' AS entity, bsi.id::text AS id,
  1::numeric(18, 4) AS expected, 0::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM bank_statement_imports bsi
WHERE bsi.source = 'mt940' AND (bsi.opening_balance IS NULL OR bsi.closing_balance IS NULL)

UNION ALL

SELECT
  'I66', 'bank_statement_import_balance_arithmetic_mismatch', bsi.id::text,
  bsi.closing_balance::numeric(18, 4) AS expected,
  (bsi.opening_balance + COALESCE(tx.total, 0))::numeric(18, 4) AS actual,
  ((bsi.opening_balance + COALESCE(tx.total, 0)) - bsi.closing_balance)::numeric(18, 4) AS diff
FROM bank_statement_imports bsi
LEFT JOIN (SELECT import_id, SUM(amount) AS total FROM bank_transactions GROUP BY import_id) tx
  ON tx.import_id = bsi.id
WHERE bsi.opening_balance IS NOT NULL AND bsi.closing_balance IS NOT NULL
  AND abs((bsi.opening_balance + COALESCE(tx.total, 0)) - bsi.closing_balance) > 0

UNION ALL

SELECT
  'I66', 'bank_account_statement_balance_stale', ba.id::text,
  latest.closing_balance::numeric(18, 4) AS expected,
  ba.statement_balance::numeric(18, 4) AS actual,
  (ba.statement_balance - latest.closing_balance)::numeric(18, 4) AS diff
FROM bank_accounts ba
JOIN LATERAL (
  SELECT bsi.closing_balance
  FROM bank_statement_imports bsi
  WHERE bsi.bank_account_id = ba.id AND bsi.closing_balance IS NOT NULL
  ORDER BY COALESCE(bsi.period_end, bsi.created_at::date) DESC, bsi.created_at DESC
  LIMIT 1
) latest ON true
WHERE abs(ba.statement_balance - latest.closing_balance) > 0

ORDER BY id;
