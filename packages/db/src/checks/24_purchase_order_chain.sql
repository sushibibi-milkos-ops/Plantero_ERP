-- I24 — Satın alma sipariş zinciri: her mal kabul (receipt) bir satın alma siparişine (purchase_orders)
-- bağlı olmalı; PO'suz kabul yalnızca origin='manual' işaretli, gerçekten sipariş dışı (numune/acil) durum
-- için istisna sayılabilir — ama docs/modules/tedarik.md ve packages/db/src/schema/stock.ts
-- (receipts.purchase_order_id, receipt_lines.purchase_order_line_id) PO zincirini şart koşar.
--
-- Kapsam: draft/cancelled olmayan her mal kabul.
--   a) receipts.purchase_order_id NULL → PO zinciri hiç kurulmamış (kural ihlali)
--   b) purchase_order_id doluysa ama purchase_orders'ta karşılığı yoksa → yetim referans
--   c) receipt_lines.purchase_order_line_id doluysa ama purchase_order_lines'ta karşılığı yoksa → yetim referans
--
-- Bulgu (tur 6): packages/core/src/purchasing/{orders.ts,replenishment.ts,whitelist.ts} ve
-- apps/web/src/app/(app)/satin-alma hiç yazılmamış; purchase_orders tablosu 0 satır (reorder_rules da 0
-- satır — kritik stok motoru hiç çalışmamış). Bu yüzden seed'in ürettiği TÜM mal kabuller (9/9)
-- origin='manual' + purchase_order_id=NULL ile PO zincirinden bağımsız oluşturuluyor — I23'ün faturalama
-- boşluğuyla aynı kök nedenin (satın alma modülü hiç kurulmamış) sipariş tarafı yansıması.

SELECT
  'I24' AS rule, 'receipt_missing_purchase_order' AS entity, r.id::text AS id,
  1::numeric(18, 4) AS expected, 0::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM receipts r
WHERE r.status NOT IN ('draft', 'cancelled') AND r.purchase_order_id IS NULL

UNION ALL

SELECT
  'I24', 'receipt_orphan_purchase_order', r.id::text,
  1::numeric(18, 4), 0::numeric(18, 4), 1::numeric(18, 4)
FROM receipts r
LEFT JOIN purchase_orders po ON po.id = r.purchase_order_id
WHERE r.purchase_order_id IS NOT NULL AND po.id IS NULL

UNION ALL

SELECT
  'I24', 'receipt_line_orphan_po_line', rl.id::text,
  1::numeric(18, 4), 0::numeric(18, 4), 1::numeric(18, 4)
FROM receipt_lines rl
LEFT JOIN purchase_order_lines pol ON pol.id = rl.purchase_order_line_id
WHERE rl.purchase_order_line_id IS NOT NULL AND pol.id IS NULL

ORDER BY id;
