-- I19 — Sipariş miktar tavanı (I8'in eksik yarısı)
--   a) sales_order_lines.delivered_qty ≤ qty (teslim ≤ sipariş — CLAUDE.md kural 3 / şema yorumu)
--   b) purchase_order_lines.received_qty ≤ qty (mal kabul ≤ satınalma siparişi)
--   c) purchase_order_lines.invoiced_qty ≤ received_qty (alış faturası ≤ mal kabul — I8/I10'un satınalma tarafı)

SELECT
  'I19' AS rule, 'sales_order_line_delivered_exceeds_ordered' AS entity, sol.id::text AS id,
  sol.qty::numeric(18, 4) AS expected,
  sol.delivered_qty::numeric(18, 4) AS actual,
  (sol.delivered_qty - sol.qty)::numeric(18, 4) AS diff
FROM sales_order_lines sol
WHERE sol.delivered_qty > sol.qty

UNION ALL

SELECT
  'I19', 'po_line_received_exceeds_ordered', pol.id::text,
  pol.qty::numeric(18, 4), pol.received_qty::numeric(18, 4),
  (pol.received_qty - pol.qty)::numeric(18, 4)
FROM purchase_order_lines pol
WHERE pol.received_qty > pol.qty

UNION ALL

SELECT
  'I19', 'po_line_invoiced_exceeds_received', pol.id::text,
  pol.received_qty::numeric(18, 4), pol.invoiced_qty::numeric(18, 4),
  (pol.invoiced_qty - pol.received_qty)::numeric(18, 4)
FROM purchase_order_lines pol
WHERE pol.invoiced_qty > pol.received_qty

ORDER BY id;
