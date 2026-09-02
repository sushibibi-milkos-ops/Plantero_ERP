-- I6 — Lot ileri izlenebilirlik
--   a) lot takipli üründe her delivery_lines satırının lot_id'si dolu
--   b) o lot 'released' durumunda olmalı (karantina/red/geri çağrılmış/süresi dolmuş lot sevk edilemez)
--   c) Σ tüketim + Σ sevk + Σ fire (iş emri + genel) + eldeki stok ≤ initial_qty (+ sayım fazlası)

SELECT
  'I6' AS rule, 'delivery_line_missing_lot' AS entity, dl.id::text AS id,
  1::numeric(18, 4) AS expected, 0::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM delivery_lines dl
JOIN products p ON p.id = dl.product_id
WHERE p.is_lot_tracked = true AND dl.lot_id IS NULL

UNION ALL

SELECT
  'I6', 'delivery_line_lot_not_released', dl.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM delivery_lines dl
JOIN stock_lots l ON l.id = dl.lot_id
WHERE l.status <> 'released'

UNION ALL

SELECT
  'I6', 'lot_qty_exceeds_initial', l.id::text,
  l.initial_qty::numeric(18, 4) AS expected,
  (COALESCE(c.qty, 0) + COALESCE(d.qty, 0) + COALESCE(s.qty, 0) + COALESCE(ws.qty, 0) + COALESCE(oh.qty, 0) - COALESCE(cg.qty, 0))::numeric(18, 4) AS actual,
  ((COALESCE(c.qty, 0) + COALESCE(d.qty, 0) + COALESCE(s.qty, 0) + COALESCE(ws.qty, 0) + COALESCE(oh.qty, 0) - COALESCE(cg.qty, 0)) - l.initial_qty)::numeric(18, 4) AS diff
FROM stock_lots l
LEFT JOIN (SELECT lot_id, SUM(qty) AS qty FROM work_order_consumptions GROUP BY lot_id) c ON c.lot_id = l.id
LEFT JOIN (SELECT lot_id, SUM(picked_qty) AS qty FROM delivery_lines WHERE lot_id IS NOT NULL GROUP BY lot_id) d ON d.lot_id = l.id
LEFT JOIN (SELECT lot_id, SUM(qty) AS qty FROM scraps WHERE lot_id IS NOT NULL GROUP BY lot_id) s ON s.lot_id = l.id
LEFT JOIN (SELECT lot_id, SUM(qty) AS qty FROM work_order_scraps WHERE lot_id IS NOT NULL GROUP BY lot_id) ws ON ws.lot_id = l.id
LEFT JOIN (SELECT lot_id, SUM(qty) AS qty FROM stock_quants WHERE lot_id IS NOT NULL GROUP BY lot_id) oh ON oh.lot_id = l.id
LEFT JOIN (SELECT lot_id, SUM(qty) AS qty FROM stock_moves WHERE kind = 'count_gain' AND lot_id IS NOT NULL GROUP BY lot_id) cg ON cg.lot_id = l.id
WHERE (COALESCE(c.qty, 0) + COALESCE(d.qty, 0) + COALESCE(s.qty, 0) + COALESCE(ws.qty, 0) + COALESCE(oh.qty, 0) - COALESCE(cg.qty, 0)) - l.initial_qty > 0

ORDER BY id;
