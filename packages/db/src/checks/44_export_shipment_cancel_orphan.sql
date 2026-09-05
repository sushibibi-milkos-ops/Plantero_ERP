-- I44 — İhracat sevkiyatı İPTAL sonrası belge zinciri temizliği: `export/shipments.ts::cancelShipment`
-- yalnızca `salesOrders.exportShipmentId`'yi temizliyor (satır ~372) — kendi `invoiceId`/`deliveryId`
-- alanlarını VE karşı taraftaki `invoices.exportShipmentId`'yi hiç temizlemiyor. `linkInvoice`'ın
-- (linkInvoice, shipments.ts) hiçbir `assertStatus` kısıtı yok — 'customs' dahil herhangi bir
-- kapatılabilir (draft/proforma_sent/confirmed/packing/customs) durumda bir gerçek faturaya
-- bağlanabilir, sonra aynı sevkiyat `cancelShipment` ile iptal edilebilir. Sonuç: 'cancelled'
-- (mandate #5 "belge zinciri" ihlali — bir belge, kaynağı artık geçersiz/iptal edilmiş bir kayda
-- bağlı kalamaz) bir sevkiyat kaydı hâlâ gerçek/ödenmiş bir faturaya `invoiceId` ile işaret eder,
-- VE o fatura da `exportShipmentId` ile geriye bu artık-anlamsız sevkiyata işaret etmeye devam eder
-- — "bu fatura ihracat sevkiyat takibiyle bağlı" görünümü YALANDIR (takip iptal edilmiştir).
--
-- Canlı egzersizle kanıtlandı (veri-critic, Tur 5): fresh seed'deki `EXP-2026-000001`
-- (status='closed', invoiceId=`INV-2026-000012`) üzerinde, rollback'li bir transaction içinde
-- durumu geçici olarak 'customs'a çekilip `cancelShipment()` doğrudan çağrıldı → sonuç
-- `status='cancelled'` AMA `invoiceId` hâlâ dolu (`038ef1d6-...`) VE `invoices.exportShipmentId`
-- hâlâ aynı (artık cancelled) sevkiyatı gösteriyor (`1ed76025-...`) — hiçbir yerde temizlenmedi.
-- Test rollback ile geri alındı, kalıcı veri değişmedi. Fresh seed: 0 ihlal (henüz hiçbir sevkiyat
-- 'cancelled' değil) — bu, ileride canlı akışta (bir kullanıcı `/ihracat/sevkiyatlar/[id]`'den
-- fatura bağlanmış bir sevkiyatı iptal ettiğinde) tetiklenecek bir regresyon güvenlik ağıdır.
--
-- Kök neden dosyası: packages/core/src/export/shipments.ts::cancelShipment (satır ~364-375).
-- Düzeltme önerisi: cancelShipment içinde, `s.invoiceId` doluysa aynı transaction'da
-- `tx.update(invoices).set({exportShipmentId:null})...` VE kendi `invoiceId`/`deliveryId`
-- alanlarını da null'a çeksin (salesOrders.exportShipmentId'yi zaten temizlediği örüntüyü
-- invoiceId/deliveryId için de tekrarlasın) — ya da iş kuralı gerçekten "faturalanmış bir
-- sevkiyat iptal edilemez" ise, `assertStatus` listesine `invoiceId IS NOT NULL` durumunda
-- ek bir guard (DomainError) eklensin.

SELECT
  'I44' AS rule, 'export_shipment_cancelled_with_invoice' AS entity, es.id::text AS id,
  0::numeric(18, 4) AS expected, 1::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM export_shipments es
WHERE es.status = 'cancelled' AND es.invoice_id IS NOT NULL

UNION ALL

SELECT
  'I44', 'invoice_points_to_cancelled_shipment', i.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM invoices i
JOIN export_shipments es ON es.id = i.export_shipment_id
WHERE es.status = 'cancelled'

UNION ALL

SELECT
  'I44', 'sales_order_points_to_cancelled_shipment', so.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM sales_orders so
JOIN export_shipments es ON es.id = so.export_shipment_id
WHERE es.status = 'cancelled'

ORDER BY id;
