-- I16 — Karantina/red/geri çağrılmış/süresi dolmuş lotu müşteri veya üretim lokasyonuna hareket etmemiş
-- (packages/core/src/stock/ledger.ts → enforceLotRules zaten bunu engeller; bu kontrol veri bütünlüğünü
-- ikinci kez, hareket + zincir tablolarından bağımsız olarak doğrular.)

SELECT
  'I16' AS rule, 'stock_move_bad_lot_status' AS entity, sm.id::text AS id,
  0::numeric(18, 4) AS expected, 1::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM stock_moves sm
JOIN stock_lots l ON l.id = sm.lot_id
WHERE sm.kind IN ('delivery', 'consumption')
  AND l.status IN ('rejected', 'recalled', 'expired', 'quarantine')

UNION ALL

SELECT
  'I16', 'delivery_line_bad_lot_status', dl.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM delivery_lines dl
JOIN stock_lots l ON l.id = dl.lot_id
WHERE l.status IN ('rejected', 'recalled', 'expired', 'quarantine')

UNION ALL

SELECT
  'I16', 'wo_consumption_bad_lot_status', wc.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM work_order_consumptions wc
JOIN stock_lots l ON l.id = wc.lot_id
WHERE l.status IN ('rejected', 'recalled', 'expired', 'quarantine')

ORDER BY id;
