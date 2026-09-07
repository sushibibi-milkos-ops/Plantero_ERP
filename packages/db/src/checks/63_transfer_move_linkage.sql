-- I63 — Depo transferi satırları (transfer_lines) ↔ bağlı stock_moves birebir tutarlı.
-- Şema yorumu (stock.ts): transfer_lines'ta stock_move_id kolonu YOK; bağlantı yalnızca
-- stock_moves.ref_type='transfer' + ref_line_id=transfer_lines.id üzerinden kurulur
-- (packages/core/src/stock/transfers.ts). I2/I8 yalnızca AGREGE quant/qty tutarlılığını
-- doğruluyor — satır seviyesinde "bu transfer satırının gerçekten kaydı var mı, miktarı/
-- maliyeti/lokasyonu satırla birebir eşleşiyor mu" hiçbir kural tarafından kontrol edilmiyordu.
--
-- Beklenen hareket sayısı:
--   - status='draft'                                  → 0 hareket (henüz işlenmemiş)
--   - aynı depo içi (from_warehouse_id = to_warehouse_id), status IN ('done')
--       → 1 hareket: from_location_id → to_location_id, qty = line.qty
--   - depolar arası (from_warehouse_id <> to_warehouse_id), status='in_transit'
--       → 1 hareket: from_location_id → transit lokasyonu, qty = line.qty
--   - depolar arası, status='done'
--       → 2 hareket (transit ayrılış + varış), her ikisi de qty = line.qty,
--         ilk bacağın to_location_id = ikinci bacağın from_location_id (transit),
--         ilk bacağın from_location_id = line.from_location_id, ikinci bacağın
--         to_location_id = line.to_location_id.
-- Her iki bacakta da unit_cost aynı olmalı (aynı transferin aynı kaleminin taşıması,
-- fiyat sıfır değersiz hareket olsa da tutarlı olmalı) ve toplam qty her bacakta line.qty'ye eşit.

WITH expected AS (
  SELECT
    tl.id AS line_id,
    tl.transfer_id,
    tl.qty AS line_qty,
    tl.from_location_id,
    tl.to_location_id,
    t.status,
    (t.from_warehouse_id <> t.to_warehouse_id) AS cross_wh,
    CASE
      WHEN t.status = 'draft' THEN 0
      WHEN t.status = 'cancelled' THEN 0
      WHEN t.from_warehouse_id = t.to_warehouse_id AND t.status = 'done' THEN 1
      WHEN t.from_warehouse_id <> t.to_warehouse_id AND t.status = 'in_transit' THEN 1
      WHEN t.from_warehouse_id <> t.to_warehouse_id AND t.status = 'done' THEN 2
      ELSE NULL -- bilinmeyen durum kombinasyonu (draft/counting dışı) — ayrıca yakalanır
    END AS expected_move_count
  FROM transfer_lines tl
  JOIN transfers t ON t.id = tl.transfer_id
),
actual AS (
  SELECT
    sm.ref_line_id AS line_id,
    count(*) AS move_count,
    sum(sm.qty) AS qty_sum,
    count(DISTINCT sm.unit_cost) AS distinct_unit_costs,
    max(sm.unit_cost) AS unit_cost
  FROM stock_moves sm
  WHERE sm.ref_type = 'transfer'
  GROUP BY sm.ref_line_id
),
joined AS (
  SELECT
    e.line_id, e.transfer_id, e.line_qty, e.status, e.cross_wh, e.expected_move_count,
    COALESCE(a.move_count, 0) AS actual_move_count,
    COALESCE(a.qty_sum, 0) AS actual_qty_sum,
    COALESCE(a.distinct_unit_costs, 0) AS distinct_unit_costs
  FROM expected e
  LEFT JOIN actual a ON a.line_id = e.line_id
)
SELECT
  'I63' AS rule, 'transfer_line_move_mismatch' AS entity, line_id::text AS id,
  expected_move_count::numeric(18, 4) AS expected,
  actual_move_count::numeric(18, 4) AS actual,
  (actual_move_count - expected_move_count)::numeric(18, 4) AS diff
FROM joined
WHERE expected_move_count IS NULL
   OR actual_move_count <> expected_move_count
   OR (expected_move_count > 0 AND abs(actual_qty_sum - line_qty * expected_move_count) > 0)
   OR (expected_move_count = 2 AND distinct_unit_costs > 1)
ORDER BY id;
