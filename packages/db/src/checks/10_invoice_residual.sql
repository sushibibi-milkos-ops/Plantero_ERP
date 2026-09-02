-- I10 — Fatura tutarlılığı
--   a) residual = grand_total − paid_amount
--   b) Σ payment_allocations.amount = paid_amount
--   c) status tutarlı (residual/paid_amount ile)

WITH alloc AS (
  SELECT invoice_id, SUM(amount) AS amt
  FROM payment_allocations
  GROUP BY invoice_id
)

SELECT
  'I10' AS rule, 'invoice_residual_mismatch' AS entity, i.id::text AS id,
  (i.grand_total - i.paid_amount)::numeric(18, 4) AS expected,
  i.residual::numeric(18, 4) AS actual,
  (i.residual - (i.grand_total - i.paid_amount))::numeric(18, 4) AS diff
FROM invoices i
WHERE i.status <> 'cancelled' AND abs(i.residual - (i.grand_total - i.paid_amount)) > 0

UNION ALL

SELECT
  'I10', 'invoice_paid_amount_mismatch', i.id::text,
  COALESCE(alloc.amt, 0)::numeric(18, 4), i.paid_amount::numeric(18, 4),
  (i.paid_amount - COALESCE(alloc.amt, 0))::numeric(18, 4)
FROM invoices i
LEFT JOIN alloc ON alloc.invoice_id = i.id
WHERE i.status <> 'cancelled' AND abs(i.paid_amount - COALESCE(alloc.amt, 0)) > 0

UNION ALL

SELECT
  'I10', 'invoice_status_inconsistent', i.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM invoices i
WHERE i.status NOT IN ('draft', 'cancelled')
  AND (
    (i.residual <= 0 AND i.status <> 'paid')
    OR (i.residual > 0 AND i.paid_amount > 0 AND i.status <> 'partially_paid')
    OR (i.paid_amount = 0 AND i.residual > 0 AND i.status <> 'posted')
  )

ORDER BY id;
