-- I27 — Lot durumu ile üzerinde eldeki miktar taşıdığı lokasyonun kullanım amacı (usage) uyumlu olmalı.
-- (packages/core/src/stock/ledger.ts → enforceLotRules + enforceDirection zaten bunu üretim anında
-- engelliyor; bu kontrol veri bütünlüğünü hareket/lot tablolarından bağımsız, statik anlık durum
-- üzerinden ikinci kez doğrular — I16'nın "hareket" odaklı kontrolüne karşı burada "konum" odaklı.)
--
-- Kural (yalnızca eldeki miktarı qty <> 0 olan quant satırları):
--   status='quarantine' → yalnızca usage='quarantine' lokasyonunda olabilir
--   status='rejected'   → yalnızca usage='rejected' lokasyonunda olabilir
--   status IN ('recalled','expired') → 'internal' (satılabilir/kullanılabilir) lokasyonda OLAMAZ
--   status='released'   → asla usage IN ('quarantine','rejected') lokasyonunda olamaz

SELECT
  'I27' AS rule, 'quarantine_lot_outside_quarantine_location' AS entity, q.id::text AS id,
  0::numeric(18, 4) AS expected, q.qty AS actual, q.qty AS diff
FROM stock_quants q
JOIN stock_lots l ON l.id = q.lot_id
JOIN locations loc ON loc.id = q.location_id
WHERE q.qty <> 0
  AND l.status::text = 'quarantine'
  AND loc.usage::text <> 'quarantine'

UNION ALL

SELECT
  'I27', 'rejected_lot_outside_rejected_location', q.id::text,
  0::numeric(18, 4), q.qty, q.qty
FROM stock_quants q
JOIN stock_lots l ON l.id = q.lot_id
JOIN locations loc ON loc.id = q.location_id
WHERE q.qty <> 0
  AND l.status::text = 'rejected'
  AND loc.usage::text <> 'rejected'

UNION ALL

SELECT
  'I27', 'released_lot_in_quarantine_or_rejected_location', q.id::text,
  0::numeric(18, 4), q.qty, q.qty
FROM stock_quants q
JOIN stock_lots l ON l.id = q.lot_id
JOIN locations loc ON loc.id = q.location_id
WHERE q.qty <> 0
  AND l.status::text = 'released'
  AND loc.usage::text IN ('quarantine', 'rejected')

UNION ALL

SELECT
  'I27', 'bad_lot_status_in_internal_location', q.id::text,
  0::numeric(18, 4), q.qty, q.qty
FROM stock_quants q
JOIN stock_lots l ON l.id = q.lot_id
JOIN locations loc ON loc.id = q.location_id
WHERE q.qty <> 0
  AND l.status::text IN ('recalled', 'expired')
  AND loc.usage::text = 'internal'

ORDER BY id;
