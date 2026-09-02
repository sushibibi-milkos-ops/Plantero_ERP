-- I12 — KDV
--   391 (Hesaplanan KDV) = Σ satış fatura line_vat (dönem bazında, VUK)
--   191 (İndirilecek KDV) = Σ alış fatura line_vat (dönem bazında, VUK)

WITH sales_vat AS (
  SELECT to_char(i.invoice_date, 'YYYY-MM') AS period, SUM(il.line_vat) AS vat
  FROM invoice_lines il
  JOIN invoices i ON i.id = il.invoice_id
  WHERE i.kind = 'sales' AND i.status IN ('posted', 'partially_paid', 'paid')
  GROUP BY 1
),
purchase_vat AS (
  SELECT to_char(i.invoice_date, 'YYYY-MM') AS period, SUM(il.line_vat) AS vat
  FROM invoice_lines il
  JOIN invoices i ON i.id = il.invoice_id
  WHERE i.kind = 'purchase' AND i.status IN ('posted', 'partially_paid', 'paid')
  GROUP BY 1
),
ledger_391 AS (
  SELECT to_char(je.entry_date, 'YYYY-MM') AS period, SUM(jl.credit - jl.debit) AS bal
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.entry_id
  WHERE jl.account_code = '391' AND je.ledger = 'VUK' AND je.status IN ('posted', 'reversed')
  GROUP BY 1
),
ledger_191 AS (
  SELECT to_char(je.entry_date, 'YYYY-MM') AS period, SUM(jl.debit - jl.credit) AS bal
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.entry_id
  WHERE jl.account_code = '191' AND je.ledger = 'VUK' AND je.status IN ('posted', 'reversed')
  GROUP BY 1
)

SELECT
  'I12' AS rule, 'vat_391_output' AS entity, COALESCE(sv.period, l3.period) AS id,
  COALESCE(sv.vat, 0)::numeric(18, 4) AS expected,
  COALESCE(l3.bal, 0)::numeric(18, 4) AS actual,
  (COALESCE(l3.bal, 0) - COALESCE(sv.vat, 0))::numeric(18, 4) AS diff
FROM sales_vat sv
FULL OUTER JOIN ledger_391 l3 ON l3.period = sv.period
WHERE abs(COALESCE(l3.bal, 0) - COALESCE(sv.vat, 0)) > 0

UNION ALL

SELECT
  'I12', 'vat_191_input', COALESCE(pv.period, l1.period),
  COALESCE(pv.vat, 0)::numeric(18, 4), COALESCE(l1.bal, 0)::numeric(18, 4),
  (COALESCE(l1.bal, 0) - COALESCE(pv.vat, 0))::numeric(18, 4)
FROM purchase_vat pv
FULL OUTER JOIN ledger_191 l1 ON l1.period = pv.period
WHERE abs(COALESCE(l1.bal, 0) - COALESCE(pv.vat, 0)) > 0

ORDER BY id;
