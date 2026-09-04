-- I36 — İhracat sevkiyat zinciri: docs/modules/ihracat.md ve packages/db/src/schema/export.ts
-- (export_shipments / export_documents / export_packages) her satış siparişi is_export=true
-- işaretlendiğinde `/ihracat/sevkiyatlar`'da bir sevkiyat kaydı (proforma/packing list/belge
-- takibi zincirinin başlangıcı) doğar demeyi şart koşar. Zorunlu denetim #9 (mandate) "İhracat"
-- kalemi bu zinciri kapsar; yalnızca fatura-içi kur çarpımını (I13/I20) değil, satış siparişi →
-- sevkiyat → belge → gümrük/ETGB zincirinin VAR OLMASINI da doğrular.
--
-- Kapsam: draft/cancelled olmayan (sent/accepted/confirmed/delivered/invoiced) her
-- sales_orders.is_export=true satırı.
--   a) hiçbir export_shipments.sales_order_id ona işaret etmiyorsa → sevkiyat zinciri hiç kurulmamış
--   b) export_shipments.sales_order_id doluysa ama sales_orders'ta karşılığı yoksa → yetim referans
--   c) export_shipments.invoice_id doluysa ama invoices'ta karşılığı yoksa → yetim referans
--
-- Bulgu (bu tur): packages/core/src/export/**, apps/web/src/modules/export/**,
-- apps/web/src/app/(app)/ihracat/**, packages/db/src/seed/export.ts hiçbiri yok
-- (yalnızca schema/export.ts + nav.ts + status.ts referansları var). export_shipments/
-- export_documents/export_packages tabloları fresh seed sonrası 0 satır; SO-2026-000023
-- (is_export=true, status='invoiced', EUR, INV-2026-000012 ile faturalanmış) hiçbir sevkiyata
-- bağlı değil. nav.ts'teki "İhracat" bölümü (Sevkiyatlar/Belgeler/Kurlar, hepsi export.view
-- izniyle /ihracat/* linkli) ve status.ts'teki export_shipment/proforma/packing_list belge
-- yönlendiricileri (documentHref) tamamı 404 verir — Tur 10'da muhasebe/finans için tespit
-- edilen "nav var, route yok" örüntüsünün ihracat modülündeki eşleniği.

SELECT
  'I36' AS rule, 'export_so_missing_shipment' AS entity, so.id::text AS id,
  1::numeric(18, 4) AS expected, 0::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM sales_orders so
LEFT JOIN export_shipments es ON es.sales_order_id = so.id
WHERE so.is_export = true
  AND so.status NOT IN ('draft', 'cancelled')
  AND es.id IS NULL

UNION ALL

SELECT
  'I36', 'export_shipment_orphan_sales_order', es.id::text,
  1::numeric(18, 4), 0::numeric(18, 4), 1::numeric(18, 4)
FROM export_shipments es
LEFT JOIN sales_orders so ON so.id = es.sales_order_id
WHERE es.sales_order_id IS NOT NULL AND so.id IS NULL

UNION ALL

SELECT
  'I36', 'export_shipment_orphan_invoice', es.id::text,
  1::numeric(18, 4), 0::numeric(18, 4), 1::numeric(18, 4)
FROM export_shipments es
LEFT JOIN invoices i ON i.id = es.invoice_id
WHERE es.invoice_id IS NOT NULL AND i.id IS NULL

ORDER BY id;
