-- I52 — İhracat packing list (export_packages) satırları, bağlı sevkiyatın irsaliye satırlarındaki
-- gerçek lot/miktar zinciriyle birebir örtüşmeli (mandate #3/#4 lot zincirinin ihracat ayağı — bir
-- lot müşteriye/gümrüğe packing list üzerinden GERÇEKTE sevk edilenden fazla veya farklı bir lot
-- numarasıyla "gitmiş" görünemez).
--
-- Üç alt kural:
--   a) export_packages.lot_id doluysa stock_lots'ta karşılığı OLMALI (yetim lot referansı).
--   b) export_packages.product_id, aynı satırın lot_id'sinin ait olduğu stock_lots.product_id ile
--      AYNI olmalı (paket, lotun gerçek ürününden farklı bir ürüne etiketlenmemiş).
--   c) bağlı sevkiyatın delivery_id'si doluysa: (shipment, product, lot) bazında
--      Σ export_packages.qty ≤ Σ delivery_lines.picked_qty (o delivery+product+lot için) — packing
--      list, gerçekte irsaliyeyle sevk edilenden FAZLA miktar beyan edemez (gümrük/ETGB beyanı
--      fiili sevkiyatı aşarsa bu bir belge sahteciliği/veri tutarsızlığıdır).
--
-- Fresh seed: 0 ihlal (EXP-2026-000001/EXP-2026-000002'nin tek satırlık paketleri kendi delivery'
-- lerindeki tek satırla birebir eşleşiyor — bkz. bu turun raporu, canlı SQL doğrulaması). Bu kural
-- şu an saf bir regresyon güvenlik ağıdır: `packages/core/src/export/**` packing list satırlarını
-- delivery_lines'tan bağımsız serbest girişe izin verirse (veya ileride "sevkiyat için düzenle"
-- ekranı eklenirse) anında kırmızıya düşer.

SELECT
  'I52' AS rule, 'export_package_orphan_lot' AS entity, ep.id::text AS id,
  1::numeric(18, 4) AS expected, 0::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM export_packages ep
WHERE ep.lot_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM stock_lots sl WHERE sl.id = ep.lot_id)

UNION ALL

SELECT
  'I52', 'export_package_product_lot_mismatch', ep.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM export_packages ep
JOIN stock_lots sl ON sl.id = ep.lot_id
WHERE sl.product_id IS DISTINCT FROM ep.product_id

UNION ALL

SELECT
  'I52', 'export_package_qty_exceeds_delivery' AS entity, x.shipment_id::text AS id,
  x.delivered_qty::numeric(18, 4) AS expected, x.packed_qty::numeric(18, 4) AS actual,
  (x.packed_qty - x.delivered_qty)::numeric(18, 4) AS diff
FROM (
  SELECT es.id AS shipment_id, ep.product_id, ep.lot_id,
    SUM(ep.qty) AS packed_qty,
    COALESCE((
      SELECT SUM(dl.picked_qty) FROM delivery_lines dl
      WHERE dl.delivery_id = es.delivery_id AND dl.product_id = ep.product_id
        AND dl.lot_id IS NOT DISTINCT FROM ep.lot_id
    ), 0) AS delivered_qty
  FROM export_shipments es
  JOIN export_packages ep ON ep.shipment_id = es.id
  WHERE es.delivery_id IS NOT NULL
  GROUP BY es.id, es.delivery_id, ep.product_id, ep.lot_id
) x
WHERE x.packed_qty > x.delivered_qty

ORDER BY id;
