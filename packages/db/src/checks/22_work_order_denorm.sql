-- I22 — İş emri denormalize alan tutarlılığı (consume.ts / finish.ts SQL-düzeyi artırımların doğrulaması)
--   a) work_order_materials.consumed_qty = Σ work_order_consumptions.qty (materyal bazında)
--   b) work_orders.scrap_qty = Σ work_order_scraps.qty (iş emri bazında)
--   c) work_orders.yield_pct = round(produced_qty / planned_qty × 100, 2) — planned_qty > 0 ve yield_pct dolu olduğunda
--      (computeYieldPct — packages/core/src/production/yield.ts)

WITH cons AS (
  SELECT material_id, SUM(qty) AS qty
  FROM work_order_consumptions
  WHERE material_id IS NOT NULL
  GROUP BY material_id
)
SELECT
  'I22' AS rule, 'wo_material_consumed_qty_mismatch' AS entity, wm.id::text AS id,
  COALESCE(c.qty, 0)::numeric(18, 4) AS expected,
  wm.consumed_qty::numeric(18, 4) AS actual,
  (wm.consumed_qty - COALESCE(c.qty, 0))::numeric(18, 4) AS diff
FROM work_order_materials wm
LEFT JOIN cons c ON c.material_id = wm.id
WHERE abs(wm.consumed_qty - COALESCE(c.qty, 0)) > 0

UNION ALL

SELECT
  'I22', 'wo_scrap_qty_mismatch', wo.id::text,
  COALESCE(s.qty, 0)::numeric(18, 4),
  wo.scrap_qty::numeric(18, 4),
  (wo.scrap_qty - COALESCE(s.qty, 0))::numeric(18, 4)
FROM work_orders wo
LEFT JOIN (SELECT work_order_id, SUM(qty) AS qty FROM work_order_scraps GROUP BY work_order_id) s
  ON s.work_order_id = wo.id
WHERE abs(wo.scrap_qty - COALESCE(s.qty, 0)) > 0

UNION ALL

SELECT
  'I22', 'wo_yield_pct_mismatch', wo.id::text,
  round(wo.produced_qty / NULLIF(wo.planned_qty, 0) * 100, 2)::numeric(18, 4) AS expected,
  wo.yield_pct::numeric(18, 4) AS actual,
  (wo.yield_pct - round(wo.produced_qty / NULLIF(wo.planned_qty, 0) * 100, 2))::numeric(18, 4) AS diff
FROM work_orders wo
WHERE wo.yield_pct IS NOT NULL AND wo.planned_qty > 0
  AND abs(wo.yield_pct - round(wo.produced_qty / NULLIF(wo.planned_qty, 0) * 100, 2)) > 0

ORDER BY id;
