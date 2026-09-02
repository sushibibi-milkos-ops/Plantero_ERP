-- I4 — Yevmiye bütünlüğü
--   a) Σdebit = Σcredit (satır toplamı)
--   b) journal_entries.total_debit / total_credit denormalize alanları satır toplamlarıyla eşleşmeli
--   c) kapalı döneme (fiscal_periods.is_closed) düşen kayıt yok
--   d) twin_entry_id çift yönlü ve farklı defter (VUK ↔ UFRS)

WITH line_totals AS (
  SELECT jl.entry_id, SUM(jl.debit) AS sum_debit, SUM(jl.credit) AS sum_credit
  FROM journal_lines jl
  GROUP BY jl.entry_id
)

SELECT
  'I4' AS rule, 'journal_entry_lines_unbalanced' AS entity, je.id::text AS id,
  lt.sum_debit::numeric(18, 4) AS expected, lt.sum_credit::numeric(18, 4) AS actual,
  (lt.sum_debit - lt.sum_credit)::numeric(18, 4) AS diff
FROM journal_entries je
JOIN line_totals lt ON lt.entry_id = je.id
WHERE je.status <> 'cancelled' AND abs(lt.sum_debit - lt.sum_credit) > 0

UNION ALL

SELECT
  'I4', 'journal_entry_total_debit_mismatch', je.id::text,
  lt.sum_debit::numeric(18, 4), je.total_debit::numeric(18, 4),
  (je.total_debit - lt.sum_debit)::numeric(18, 4)
FROM journal_entries je
JOIN line_totals lt ON lt.entry_id = je.id
WHERE je.status <> 'cancelled' AND abs(je.total_debit - lt.sum_debit) > 0

UNION ALL

SELECT
  'I4', 'journal_entry_total_credit_mismatch', je.id::text,
  lt.sum_credit::numeric(18, 4), je.total_credit::numeric(18, 4),
  (je.total_credit - lt.sum_credit)::numeric(18, 4)
FROM journal_entries je
JOIN line_totals lt ON lt.entry_id = je.id
WHERE je.status <> 'cancelled' AND abs(je.total_credit - lt.sum_credit) > 0

UNION ALL

SELECT
  'I4', 'journal_entry_in_closed_period', je.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM journal_entries je
JOIN fiscal_periods fp ON je.entry_date BETWEEN fp.start_date AND fp.end_date
WHERE fp.is_closed = true AND je.status <> 'cancelled'

UNION ALL

SELECT
  'I4', 'journal_entry_twin_broken', je.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM journal_entries je
JOIN journal_entries twin ON twin.id = je.twin_entry_id
WHERE je.twin_entry_id IS NOT NULL
  AND (twin.twin_entry_id IS DISTINCT FROM je.id OR twin.ledger = je.ledger)

ORDER BY id;
