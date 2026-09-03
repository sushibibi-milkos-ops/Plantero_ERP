-- I11 — Banka mutabakatı
--   a) her bank_transaction en fazla 1 approved/auto_applied match'e sahip olabilir
--   b) status='matched' olan bir hareketin bir ödeme (payment) veya muhasebe fişine bağlı olması gerekir
--   c) status='matched' olan bir hareketin onaylı/otomatik bir reconciliation_matches kaydı olmalı
--      (suggested/rejected kayıtlar bakiyeyi etkilemez, dolayısıyla 'matched' durumunu açıklayamaz)
--   d) matched_payment_id dolu bir hareketin |amount| = payment.amount_try (eşleşen tutar = ödeme tutarı)
--   e) kind='invoice' olan onaylı/otomatik bir reconciliation_matches kaydında Σ allocations.amount = |bt.amount|
--      (kısmi tahsis içeren AI önerileri dahil — onaylanmamış öneriler zaten (a)-(c) ile bakiyeyi etkilemez)

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

UNION ALL

SELECT
  'I11', 'bank_tx_matched_amount_mismatch', bt.id::text,
  abs(bt.amount)::numeric(18, 4) AS expected,
  p.amount_try::numeric(18, 4) AS actual,
  (p.amount_try - abs(bt.amount))::numeric(18, 4) AS diff
FROM bank_transactions bt
JOIN payments p ON p.id = bt.matched_payment_id
WHERE bt.matched_payment_id IS NOT NULL AND abs(p.amount_try - abs(bt.amount)) > 0

UNION ALL

SELECT
  'I11', 'reconciliation_match_allocation_amount_mismatch', rm.id::text,
  abs(bt.amount)::numeric(18, 4) AS expected,
  alloc.total::numeric(18, 4) AS actual,
  (alloc.total - abs(bt.amount))::numeric(18, 4) AS diff
FROM reconciliation_matches rm
JOIN bank_transactions bt ON bt.id = rm.bank_transaction_id
JOIN LATERAL (
  SELECT COALESCE(SUM((a->>'amount')::numeric), 0) AS total
  FROM jsonb_array_elements(COALESCE(rm.allocations, '[]'::jsonb)) a
) alloc ON true
WHERE rm.status IN ('approved', 'auto_applied')
  AND rm.kind = 'invoice'
  AND jsonb_array_length(COALESCE(rm.allocations, '[]'::jsonb)) > 0
  AND abs(alloc.total - abs(bt.amount)) > 0

ORDER BY id;
