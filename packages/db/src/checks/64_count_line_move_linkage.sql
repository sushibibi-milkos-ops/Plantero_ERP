-- I64 — Sayım satırları (stock_count_lines) ↔ bağlı stock_moves (count_gain/count_loss) birebir tutarlı.
-- Şema yorumu (stock.ts): stock_count_lines'ta stock_move_id kolonu YOK; bağlantı yalnızca
-- stock_moves.ref_type='stock_count' + ref_line_id=stock_count_lines.id üzerinden kurulur
-- (packages/core/src/stock/counts.ts::postCount). I1/I2 yalnızca AGREGE stok/muhasebe bakiyesini
-- doğruluyor; I38 iş emri satırları için aynı deseni kontrol ediyor ama sayım satırlarını hiç kapsamıyor.
--
-- Kural:
--   - varyansı sıfır olan satır (counted_qty = system_qty) → hiç stock_move OLMAMALI (postCount
--     `if (variance.isZero()) continue;` ile atlıyor).
--   - varyans > 0 (sayılan > sistem) → tam 1 hareket, kind='count_gain', qty=variance,
--     unit_cost=line.unit_cost, value=variance*unit_cost, to_location_id=line.location_id.
--   - varyans < 0 (sayılan < sistem) → tam 1 hareket, kind='count_loss', qty=|variance|,
--     unit_cost=line.unit_cost, value=|variance|*unit_cost, from_location_id=line.location_id.
--   - counted_qty IS NULL (henüz sayılmamış satır) sayım 'posted' durumundaysa bu zaten I(submitReview
--     kuralı) ihlalidir — burada da varyans NULL olarak ele alınıp sıfır-olmayan hareket beklenmez,
--     ayrı bir P0 olarak "sayılmamış satırla posted sayım" satırı işaretlenir.
-- Yalnızca 'posted' sayımların satırları değerlendirilir (draft/counting/review/approved'te henüz
-- hareket üretilmemiş olması BEKLENEN durumdur, ihlal değildir).

WITH lines AS (
  SELECT
    scl.id AS line_id,
    scl.count_id,
    scl.product_id,
    scl.lot_id,
    scl.location_id,
    scl.system_qty,
    scl.counted_qty,
    scl.variance_qty,
    scl.unit_cost,
    sc.status AS count_status
  FROM stock_count_lines scl
  JOIN stock_counts sc ON sc.id = scl.count_id
  WHERE sc.status = 'posted'
),
actual AS (
  SELECT
    sm.ref_line_id AS line_id,
    count(*) AS move_count,
    sum(sm.qty) AS qty_sum,
    sum(sm.value) AS value_sum,
    array_agg(DISTINCT sm.kind::text) AS kinds,
    array_agg(DISTINCT sm.unit_cost) AS unit_costs
  FROM stock_moves sm
  WHERE sm.ref_type = 'stock_count'
  GROUP BY sm.ref_line_id
),
joined AS (
  SELECT
    l.line_id, l.count_id, l.variance_qty, l.unit_cost, l.counted_qty,
    CASE WHEN l.counted_qty IS NULL THEN NULL WHEN l.variance_qty = 0 THEN 0 ELSE 1 END AS expected_move_count,
    abs(l.variance_qty) AS expected_qty,
    (abs(l.variance_qty) * l.unit_cost)::numeric(18, 4) AS expected_value,
    CASE WHEN l.variance_qty > 0 THEN 'count_gain' WHEN l.variance_qty < 0 THEN 'count_loss' ELSE NULL END AS expected_kind,
    COALESCE(a.move_count, 0) AS actual_move_count,
    COALESCE(a.qty_sum, 0) AS actual_qty_sum,
    COALESCE(a.value_sum, 0) AS actual_value_sum,
    a.kinds,
    a.unit_costs
  FROM lines l
  LEFT JOIN actual a ON a.line_id = l.line_id
)
SELECT
  'I64' AS rule, 'count_line_move_mismatch' AS entity, line_id::text AS id,
  COALESCE(expected_move_count, -1)::numeric(18, 4) AS expected,
  actual_move_count::numeric(18, 4) AS actual,
  (actual_move_count - COALESCE(expected_move_count, -1))::numeric(18, 4) AS diff
FROM joined
WHERE expected_move_count IS NULL
   OR actual_move_count <> expected_move_count
   OR (expected_move_count = 1 AND abs(actual_qty_sum - expected_qty) > 0)
   OR (expected_move_count = 1 AND abs(actual_value_sum - expected_value) > 0)
   OR (expected_move_count = 1 AND NOT (kinds = ARRAY[expected_kind]))
   OR (expected_move_count = 1 AND array_length(unit_costs, 1) = 1 AND unit_costs[1] <> unit_cost)
ORDER BY id;
