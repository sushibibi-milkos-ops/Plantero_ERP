-- I8 — Miktar zinciri
--   a) sales_order_lines.delivered_qty = Σ delivery_lines.picked_qty (o satır için)
--   b) sales_order_lines.invoiced_qty ≤ delivered_qty
--   c) purchase_order_lines.received_qty = Σ receipt_lines.qty (o satır için)

WITH delivered AS (
  SELECT sales_order_line_id, SUM(picked_qty) AS qty
  FROM delivery_lines
  WHERE sales_order_line_id IS NOT NULL
  GROUP BY sales_order_line_id
),
received AS (
  SELECT purchase_order_line_id, SUM(qty) AS qty
  FROM receipt_lines
  WHERE purchase_order_line_id IS NOT NULL
  GROUP BY purchase_order_line_id
)

SELECT
  'I8' AS rule, 'sales_order_line_delivered_mismatch' AS entity, sol.id::text AS id,
  COALESCE(delivered.qty, 0)::numeric(18, 4) AS expected,
  sol.delivered_qty::numeric(18, 4) AS actual,
  (sol.delivered_qty - COALESCE(delivered.qty, 0))::numeric(18, 4) AS diff
FROM sales_order_lines sol
LEFT JOIN delivered ON delivered.sales_order_line_id = sol.id
WHERE abs(sol.delivered_qty - COALESCE(delivered.qty, 0)) > 0

UNION ALL

SELECT
  'I8', 'sales_order_line_invoiced_exceeds_delivered', sol.id::text,
  sol.delivered_qty::numeric(18, 4), sol.invoiced_qty::numeric(18, 4),
  (sol.invoiced_qty - sol.delivered_qty)::numeric(18, 4)
FROM sales_order_lines sol
WHERE sol.invoiced_qty > sol.delivered_qty

UNION ALL

SELECT
  'I8', 'po_line_received_mismatch', pol.id::text,
  COALESCE(received.qty, 0)::numeric(18, 4) AS expected,
  pol.received_qty::numeric(18, 4) AS actual,
  (pol.received_qty - COALESCE(received.qty, 0))::numeric(18, 4) AS diff
FROM purchase_order_lines pol
LEFT JOIN received ON received.purchase_order_line_id = pol.id
WHERE abs(pol.received_qty - COALESCE(received.qty, 0)) > 0

ORDER BY id;
