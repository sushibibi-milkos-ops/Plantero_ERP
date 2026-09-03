-- I5 — Lot geri izlenebilirlik
--   a) her mamul lotu (origin='production') → origin_work_order_id dolu
--   b) o iş emrinin ≥1 gerçek tüketimi (work_order_consumptions) var
--   c) her tüketim lotunun origin_receipt_id VEYA origin_work_order_id'si dolu (zincir kopmaz)

SELECT
  'I5' AS rule, 'production_lot_missing_wo' AS entity, l.id::text AS id,
  1::numeric(18, 4) AS expected, 0::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM stock_lots l
WHERE l.origin = 'production' AND l.origin_work_order_id IS NULL

UNION ALL

SELECT
  'I5', 'production_wo_missing_consumption', l.id::text,
  1::numeric(18, 4), 0::numeric(18, 4), 1::numeric(18, 4)
FROM stock_lots l
LEFT JOIN work_order_consumptions c ON c.work_order_id = l.origin_work_order_id
WHERE l.origin = 'production' AND l.origin_work_order_id IS NOT NULL
GROUP BY l.id
HAVING COUNT(c.id) = 0

UNION ALL

SELECT
  'I5', 'consumption_lot_missing_origin', wc.id::text,
  1::numeric(18, 4), 0::numeric(18, 4), 1::numeric(18, 4)
FROM work_order_consumptions wc
JOIN stock_lots l ON l.id = wc.lot_id
-- Yalnızca origin='receipt'|'production' lotlarında origin_receipt_id/origin_work_order_id zorunludur
-- (zincirin bir üst halkasına bağlanmaları gerekir). 'opening' (açılış envanteri), 'count' (sayım
-- fazlası) ve 'return' (iade) meşru kök kökenlerdir — tanım gereği üst belgeleri yoktur; bunları da
-- eksik saymak, açılış stoğundan yapılan (tamamen normal) her üretim tüketimini yanlışlıkla I5 ihlali
-- olarak işaretlerdi.
WHERE l.origin IN ('receipt', 'production') AND l.origin_receipt_id IS NULL AND l.origin_work_order_id IS NULL

ORDER BY id;
