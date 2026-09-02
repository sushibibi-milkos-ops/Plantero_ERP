-- I2 — Stok defteri tutarlılığı
--   a) her stock_moves: round(qty × unit_cost, 4) = value (ledger 4 hanede değerler; numeric(18,4))
--   b) quant bakiyesi = Σ giriş − Σ çıkış (lokasyon+lot, stock_moves'tan türetilir)
--   c) quant.qty ≥ 0
--   d) reserved ≤ qty

WITH real_locations AS (
  SELECT id FROM locations WHERE usage IN ('internal', 'quarantine', 'rejected', 'transit')
),
inflow AS (
  SELECT product_id, lot_id, to_location_id AS location_id, SUM(qty) AS qty
  FROM stock_moves
  WHERE to_location_id IN (SELECT id FROM real_locations)
  GROUP BY product_id, lot_id, to_location_id
),
outflow AS (
  SELECT product_id, lot_id, from_location_id AS location_id, SUM(qty) AS qty
  FROM stock_moves
  WHERE from_location_id IN (SELECT id FROM real_locations)
  GROUP BY product_id, lot_id, from_location_id
),
computed AS (
  SELECT
    COALESCE(i.product_id, o.product_id) AS product_id,
    COALESCE(i.lot_id, o.lot_id) AS lot_id,
    COALESCE(i.location_id, o.location_id) AS location_id,
    COALESCE(i.qty, 0) - COALESCE(o.qty, 0) AS computed_qty
  FROM inflow i
  FULL OUTER JOIN outflow o
    ON o.product_id = i.product_id
    AND COALESCE(o.lot_id::text, '') = COALESCE(i.lot_id::text, '')
    AND o.location_id = i.location_id
)

SELECT
  'I2' AS rule, 'stock_move_value' AS entity, sm.id::text AS id,
  round(sm.qty * sm.unit_cost, 4)::numeric(18, 4) AS expected,
  sm.value::numeric(18, 4) AS actual,
  (sm.value - round(sm.qty * sm.unit_cost, 4))::numeric(18, 4) AS diff
FROM stock_moves sm
WHERE abs(sm.value - round(sm.qty * sm.unit_cost, 4)) > 0

UNION ALL

SELECT
  'I2', 'stock_quant_negative', sq.id::text,
  0::numeric(18, 4), sq.qty::numeric(18, 4), sq.qty::numeric(18, 4)
FROM stock_quants sq
WHERE sq.qty < 0

UNION ALL

SELECT
  'I2', 'stock_quant_overreserved', sq.id::text,
  sq.qty::numeric(18, 4), sq.reserved_qty::numeric(18, 4),
  (sq.reserved_qty - sq.qty)::numeric(18, 4)
FROM stock_quants sq
WHERE sq.reserved_qty > sq.qty

UNION ALL

SELECT
  'I2', 'stock_quant_balance',
  COALESCE(sq.id::text, c.product_id::text || '/' || c.location_id::text || '/' || COALESCE(c.lot_id::text, 'null')) AS id,
  COALESCE(c.computed_qty, 0)::numeric(18, 4) AS expected,
  COALESCE(sq.qty, 0)::numeric(18, 4) AS actual,
  (COALESCE(sq.qty, 0) - COALESCE(c.computed_qty, 0))::numeric(18, 4) AS diff
FROM computed c
FULL OUTER JOIN stock_quants sq
  ON sq.product_id = c.product_id
  AND COALESCE(sq.lot_id::text, '') = COALESCE(c.lot_id::text, '')
  AND sq.location_id = c.location_id
WHERE abs(COALESCE(sq.qty, 0) - COALESCE(c.computed_qty, 0)) > 0

ORDER BY id;
