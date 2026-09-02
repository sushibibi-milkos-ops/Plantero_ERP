-- I14 — Üretim maliyeti
--   a) work_orders.total_cost = material_cost + overhead_cost
--   b) Σ work_order_consumptions.value = material_cost
--   c) Σ work_order_outputs.value = total_cost (yalnızca kapalı iş emirleri)
--   d) her çıktı lotunun unit_cost'u = value / qty

SELECT
  'I14' AS rule, 'wo_total_cost_mismatch' AS entity, wo.id::text AS id,
  (wo.material_cost + wo.overhead_cost)::numeric(18, 4) AS expected,
  wo.total_cost::numeric(18, 4) AS actual,
  (wo.total_cost - (wo.material_cost + wo.overhead_cost))::numeric(18, 4) AS diff
FROM work_orders wo
WHERE abs(wo.total_cost - (wo.material_cost + wo.overhead_cost)) > 0

UNION ALL

SELECT
  'I14', 'wo_material_cost_mismatch', wo.id::text,
  COALESCE(cons.v, 0)::numeric(18, 4), wo.material_cost::numeric(18, 4),
  (wo.material_cost - COALESCE(cons.v, 0))::numeric(18, 4)
FROM work_orders wo
LEFT JOIN (SELECT work_order_id, SUM(value) AS v FROM work_order_consumptions GROUP BY work_order_id) cons
  ON cons.work_order_id = wo.id
WHERE abs(wo.material_cost - COALESCE(cons.v, 0)) > 0

UNION ALL

SELECT
  'I14', 'wo_output_value_mismatch', wo.id::text,
  wo.total_cost::numeric(18, 4), COALESCE(outs.v, 0)::numeric(18, 4),
  (COALESCE(outs.v, 0) - wo.total_cost)::numeric(18, 4)
FROM work_orders wo
LEFT JOIN (SELECT work_order_id, SUM(value) AS v FROM work_order_outputs GROUP BY work_order_id) outs
  ON outs.work_order_id = wo.id
WHERE wo.status = 'closed' AND abs(COALESCE(outs.v, 0) - wo.total_cost) > 0

UNION ALL

SELECT
  'I14', 'wo_output_unit_cost_mismatch', o.id::text,
  (CASE WHEN o.qty = 0 THEN 0 ELSE o.value / o.qty END)::numeric(18, 4) AS expected,
  o.unit_cost::numeric(18, 4) AS actual,
  (o.unit_cost - (CASE WHEN o.qty = 0 THEN 0 ELSE o.value / o.qty END))::numeric(18, 4) AS diff
FROM work_order_outputs o
WHERE o.qty <> 0 AND abs(o.unit_cost - (o.value / o.qty)) > 0

ORDER BY id;
