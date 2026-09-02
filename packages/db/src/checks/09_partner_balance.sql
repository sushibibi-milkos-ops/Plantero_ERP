-- I9 — Cari bakiye
--   partners.balance = Σ satış faturaları (posted) − Σ tahsilat allocations (+iadeler) = 120.cari bakiyesi (VUK)
-- getPartnerBalance (packages/core/src/accounting/journal.ts) ile aynı yöntem: 120 + alt hesapları,
-- journal_lines.partner_id ile eşleşen, status IN ('posted','reversed'), ledger='VUK' satırlar.

WITH invoice_net AS (
  SELECT partner_id,
    SUM(CASE WHEN kind = 'sales' THEN grand_total_try WHEN kind = 'sales_return' THEN -grand_total_try ELSE 0 END) AS net
  FROM invoices
  WHERE status IN ('posted', 'partially_paid', 'paid') AND kind IN ('sales', 'sales_return')
  GROUP BY partner_id
),
allocated AS (
  SELECT i.partner_id, SUM(pa.amount_try) AS amt
  FROM payment_allocations pa
  JOIN invoices i ON i.id = pa.invoice_id
  JOIN payments p ON p.id = pa.payment_id
  WHERE p.status = 'posted' AND i.kind IN ('sales', 'sales_return')
  GROUP BY i.partner_id
),
computed AS (
  SELECT p.id AS partner_id,
    COALESCE(invoice_net.net, 0) - COALESCE(allocated.amt, 0) AS computed_balance
  FROM partners p
  LEFT JOIN invoice_net ON invoice_net.partner_id = p.id
  LEFT JOIN allocated ON allocated.partner_id = p.id
  WHERE p.kind IN ('customer', 'both')
),
ledger_120 AS (
  SELECT p.id AS partner_id,
    COALESCE(SUM(CASE
      WHEN (jl.account_code = '120' OR jl.account_code LIKE '120.%')
        AND jl.ledger = 'VUK' AND je.status IN ('posted', 'reversed')
      THEN jl.debit - jl.credit ELSE 0
    END), 0) AS ledger_balance
  FROM partners p
  LEFT JOIN journal_lines jl ON jl.partner_id = p.id
  LEFT JOIN journal_entries je ON je.id = jl.entry_id
  WHERE p.kind IN ('customer', 'both')
  GROUP BY p.id
)

SELECT
  'I9' AS rule, 'partner_balance_field' AS entity, p.id::text AS id,
  c.computed_balance::numeric(18, 4) AS expected,
  p.balance::numeric(18, 4) AS actual,
  (p.balance - c.computed_balance)::numeric(18, 4) AS diff
FROM partners p
JOIN computed c ON c.partner_id = p.id
WHERE abs(p.balance - c.computed_balance) > 0

UNION ALL

SELECT
  'I9', 'partner_balance_ledger_120', c.partner_id::text,
  c.computed_balance::numeric(18, 4), l.ledger_balance::numeric(18, 4),
  (l.ledger_balance - c.computed_balance)::numeric(18, 4)
FROM computed c
JOIN ledger_120 l ON l.partner_id = c.partner_id
WHERE abs(l.ledger_balance - c.computed_balance) > 0

ORDER BY id;
