-- I38 — İş emri gerçekleşme kayıtları (work_order_consumptions/outputs/scraps) ↔ bağlı stock_moves
-- birebir tutarlı.
-- Şema yorumu (production.ts): "Her satır bir stock_move üretir" — work_order_consumptions.stock_move_id,
-- work_order_outputs.stock_move_id, work_order_scraps.stock_move_id doğrudan FK'siz uuid alanlar (şema
-- dondurulmuş olduğundan foreign key eklenemiyor, yalnızca uygulama kodu bağlıyor). I14/I15/I22 yalnızca
-- iş emri/work_order_materials seviyesinde AGREGE tutarları (Σvalue, Σqty) muhasebe/WIP bakiyesiyle
-- karşılaştırıyor — hiçbiri satır düzeyinde stock_move_id linkinin VAR olduğunu ve karşı tarafla (qty,
-- value, unit_cost, lot_id, product_id, hareket türü) birebir eşleştiğini doğrulamıyor. Bu, toplamda
-- birbirini götüren (bir satırda +X, başka satırda -X) satır-seviyesi hatalara veya kopuk/çift sayılan
-- bağlantılara karşı kördür. postStockMove tek stok yazma noktası olduğundan (packages/core/src/stock/ledger.ts),
-- her gerçekleşme satırının kendi stock_move'una qty/value/unit_cost/lot/product bazında TAM eşit olması gerekir.

WITH cons AS (
  SELECT
    'I38' AS rule, 'wo_consumption_move_mismatch' AS entity, wc.id::text AS id,
    wc.value::numeric(18, 4) AS expected, COALESCE(sm.value, 0)::numeric(18, 4) AS actual,
    (COALESCE(sm.value, 0) - wc.value)::numeric(18, 4) AS diff
  FROM work_order_consumptions wc
  LEFT JOIN stock_moves sm ON sm.id = wc.stock_move_id
  WHERE wc.stock_move_id IS NULL
     OR sm.id IS NULL
     OR sm.kind <> 'consumption'
     OR abs(wc.qty - sm.qty) > 0
     OR abs(wc.value - sm.value) > 0
     OR abs(wc.unit_cost - sm.unit_cost) > 0
     OR wc.lot_id IS DISTINCT FROM sm.lot_id
     OR wc.product_id IS DISTINCT FROM sm.product_id
),
outs AS (
  SELECT
    'I38' AS rule, 'wo_output_move_mismatch' AS entity, o.id::text AS id,
    o.value::numeric(18, 4) AS expected, COALESCE(sm.value, 0)::numeric(18, 4) AS actual,
    (COALESCE(sm.value, 0) - o.value)::numeric(18, 4) AS diff
  FROM work_order_outputs o
  LEFT JOIN stock_moves sm ON sm.id = o.stock_move_id
  WHERE o.stock_move_id IS NULL
     OR sm.id IS NULL
     OR sm.kind NOT IN ('production', 'byproduct')
     OR (o.is_byproduct AND sm.kind <> 'byproduct')
     OR (NOT o.is_byproduct AND sm.kind <> 'production')
     OR abs(o.qty - sm.qty) > 0
     OR abs(o.value - sm.value) > 0
     OR abs(o.unit_cost - sm.unit_cost) > 0
     OR o.lot_id IS DISTINCT FROM sm.lot_id
     OR o.product_id IS DISTINCT FROM sm.product_id
),
scraps AS (
  SELECT
    'I38' AS rule, 'wo_scrap_move_mismatch' AS entity, s.id::text AS id,
    s.value::numeric(18, 4) AS expected, COALESCE(sm.value, 0)::numeric(18, 4) AS actual,
    (COALESCE(sm.value, 0) - s.value)::numeric(18, 4) AS diff
  FROM work_order_scraps s
  LEFT JOIN stock_moves sm ON sm.id = s.stock_move_id
  WHERE s.stock_move_id IS NULL
     OR sm.id IS NULL
     OR sm.kind <> 'scrap'
     OR abs(s.qty - sm.qty) > 0
     OR abs(s.value - sm.value) > 0
     OR abs(s.unit_cost - sm.unit_cost) > 0
     OR (s.lot_id IS NOT NULL AND s.lot_id IS DISTINCT FROM sm.lot_id)
     OR s.product_id IS DISTINCT FROM sm.product_id
)

SELECT * FROM cons
UNION ALL
SELECT * FROM outs
UNION ALL
SELECT * FROM scraps
ORDER BY id;
