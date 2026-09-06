-- I50 — Satış iade faturası (sales_return) fiziksel stok girişi (return_in) eksikliği — regresyon
-- güvenlik ağı.
--
-- `packages/core/src/accounting/invoices.ts::createCreditNote` alış (purchase_return) dalı Tur 7'de
-- (I25) gerçek bir `postStockMove(kind:'return_out')` üretecek şekilde düzeltilmişti; SATIŞ
-- (sales_return) dalı Tur 8-11 boyunca yalnızca 610/391/120 muhasebe satırlarını tersine çeviriyordu,
-- müşteriden fiziksel olarak geri dönen malın stoğa girişini sağlayan `postStockMove(kind:'return_in')`
-- ÇAĞRISI hiç yoktu (bilinen sınır, fonksiyonun kendi başlık yorumunda işaretliydi). Bu boşluk fresh
-- seed'de hiç `sales_return` faturası üretilmediğinden her turda 0 ihlalle "dormant" kalıyordu ve
-- daha önce hiçbir I1-I49 kuralı bunu YAPISAL olarak izlemiyordu.
--
-- Tur 11 kalite modülü düzeltme turunda kök neden kapatıldı: `createCreditNote`'un `isSales` dalına,
-- kaynak satışın GERÇEKTEN sevk edilmiş (`deliveryLineId` dolu) satırları için kaynak `stock_moves
-- (kind='delivery')` hareketlerini bulup her birini KENDİ lot/lokasyon/miktarıyla
-- `postStockMove(kind:'return_in', fromLocationId:<müşteri sanal lokasyonu>, toLocationId:<hareketin
-- orijinal sevk lokasyonu>)` ile geri saran kod eklendi (I25'in alış dalının birebir simetriği;
-- `accounting/mapping.ts`'teki `return_in` eşlemesi INV borç/621 COGS alacak fişini otomatik atar).
-- Teslimatsız satış satırları (`deliveryLineId` boş — hizmet/doğrudan satış) atlanır: fiziksel mal
-- hiç sevk edilmediğinden iade edilecek bir şey yoktur. Bkz. `docs/INVARIANTS.md` I50 satırı ve
-- `packages/core/src/accounting/invoices.test.ts` (fiziksel iade + teslimatsız-atlama testleri) için
-- düzeltme öncesi/sonrası canlı doğrulama kanıtı.
--
-- Kural (bu dosya, artık her turda kalıcı olarak izliyor): `sales_return` (iptal edilmemiş) her
-- faturanın, stoklu ürün tipindeki (hizmet/sabit kıymet hariç — bunların fiziksel iadesi yok) her
-- satırı için, o faturaya (`ref_type='invoice', ref_id=invoice.id`, ürün bazında toplanmış)
-- `kind='return_in'` stok hareketi miktarı satır miktarına eşit olmalı. `ref_line_id` üzerinden değil
-- ürün bazında toplanır — satır düzeyinde değil fatura+ürün düzeyinde eşleştirme daha sağlam bir
-- kanıt yüzeyi sağlar.

SELECT
  'I50' AS rule, 'sales_return_missing_stock_in' AS entity, il.id::text AS id,
  il.qty::numeric(18, 4) AS expected,
  COALESCE(rm.qty, 0)::numeric(18, 4) AS actual,
  (COALESCE(rm.qty, 0) - il.qty)::numeric(18, 4) AS diff
FROM invoice_lines il
JOIN invoices i ON i.id = il.invoice_id
JOIN products p ON p.id = il.product_id
LEFT JOIN (
  SELECT ref_id, product_id, SUM(qty) AS qty
  FROM stock_moves
  WHERE kind = 'return_in' AND ref_type = 'invoice'
  GROUP BY ref_id, product_id
) rm ON rm.ref_id = i.id AND rm.product_id = il.product_id
WHERE i.kind = 'sales_return'
  AND i.status <> 'cancelled'
  AND p.type IN ('finished', 'semi_finished', 'raw_material', 'packaging', 'merchandise')
  AND il.qty > 0
  AND abs(COALESCE(rm.qty, 0) - il.qty) > 0

ORDER BY id;
