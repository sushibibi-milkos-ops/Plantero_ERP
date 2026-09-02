-- I11 — Banka mutabakatı
--   a) her bank_transaction en fazla 1 approved/auto_applied match'e sahip olabilir
--   b) status='matched' olan bir hareketin bir ödeme (payment) veya muhasebe fişine bağlı olması gerekir
--   c) status='matched' olan bir hareketin onaylı/otomatik bir reconciliation_matches kaydı olmalı
--      (suggested/rejected kayıtlar bakiyeyi etkilemez, dolayısıyla 'matched' durumunu açıklayamaz)

SELECT
  'I11' AS rule, 'bank_tx_multiple_approved_matches' AS entity, rm.bank_transaction_id::text AS id,
  1::numeric(18, 4) AS expected, rm.cnt::numeric(18, 4) AS actual, (rm.cnt - 1)::numeric(18, 4) AS diff
FROM (
  SELECT bank_transaction_id, COUNT(*) AS cnt
  FROM reconciliation_matches
  WHERE status IN ('approved', 'auto_applied')
  GROUP BY bank_transaction_id
) rm
WHERE rm.cnt > 1

UNION ALL

SELECT
  'I11', 'bank_tx_matched_missing_link', bt.id::text,
  1::numeric(18, 4), 0::numeric(18, 4), 1::numeric(18, 4)
FROM bank_transactions bt
WHERE bt.status = 'matched' AND bt.matched_payment_id IS NULL AND bt.journal_entry_id IS NULL

UNION ALL

SELECT
  'I11', 'bank_tx_matched_missing_approved_match', bt.id::text,
  1::numeric(18, 4), 0::numeric(18, 4), 1::numeric(18, 4)
FROM bank_transactions bt
LEFT JOIN reconciliation_matches rm ON rm.bank_transaction_id = bt.id AND rm.status IN ('approved', 'auto_applied')
WHERE bt.status = 'matched' AND rm.id IS NULL

ORDER BY id;
