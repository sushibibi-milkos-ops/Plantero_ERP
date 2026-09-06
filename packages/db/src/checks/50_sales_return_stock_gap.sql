-- I50 — Satış iade faturası (sales_return) fiziksel stok girişi (return_in) eksikliği.
--
-- `packages/core/src/accounting/invoices.ts::createCreditNote` alış (purchase_return) dalı Tur 7'de
-- (I25) gerçek bir `postStockMove(kind:'return_out')` üretecek şekilde düzeltildi — ama SATIŞ
-- (sales_return) dalı hâlâ yalnızca 610/391/120 muhasebe satırlarını tersine çeviriyor, müşteriden
-- fiziksel olarak geri dönen malın stoğa girişini sağlayan bir `postStockMove(kind:'return_in')`
-- ÇAĞRISI YOK (fonksiyonun kendi başlık yorumu: "Satış tarafının fiziksel iadesi (return_in) bu
-- servisin kapsamı DIŞINDADIR — bilinen sınır"). Bugüne kadar (Tur 8-11) fresh seed'de hiç
-- `sales_return` faturası ÜRETİLMEDİĞİ için bu boşluk her turda 0 ihlalle "dormant" kaldı ve daha
-- önce hiçbir I1-I49 kuralı bunu YAPISAL olarak izlemiyordu — CLAUDE.md'nin "lot izlenebilirliği
-- hiçbir noktada kopmaz" ve zorunlu denetim #3/#4'ün (sevkiyat → müşteri → iade zinciri) doğrudan
-- ihlali: bir kullanıcı `/muhasebe/faturalar/[id]` üzerinden gerçek bir satış iadesi kestiği an,
-- muhasebe 610/391/120'yi doğru tersine çevirir ama depo modülü malın fiziksel olarak geri geldiğini
-- HİÇBİR ZAMAN görmez — `stock_quants`/`stock_lots` eksik gösterir, ürün aslında elde olsa bile satışa
-- kapalı kalır (ya da tam tersi: sistem "elde yok" derken depoda fiilen duruyor olur).
--
-- Canlı doğrulama (Tur 11, rollback'li transaction): mevcut posted bir satış faturası (lot takipli
-- ürün satırı olan) üzerinde `createCreditNote` çağrıldı → 610/391/120 fişi doğru üretildi, invoice
-- satırları (qty, productId) kaynaktan birebir kopyalandı, ama AYNI transaction'da hiçbir
-- `stock_moves(kind='return_in', ref_type='invoice', ref_id=<yeni iade faturası>)` satırı oluşmadı —
-- bu SQL o anda invoice_line başına 1 ihlal üretti (aşağıdaki egzersizle birebir aynı sorgu).
--
-- Kural: `sales_return` (iptal edilmemiş) her faturanın, stoklu ürün tipindeki (hizmet/sabit kıymet
-- hariç — bunların fiziksel iadesi yok) her satırı için, o faturaya (`ref_type='invoice',
-- ref_id=invoice.id`, ürün bazında toplanmış) `kind='return_in'` stok hareketi miktarı satır
-- miktarına eşit olmalı. `ref_line_id` üzerinden değil ürün bazında toplanır — bugün henüz hiçbir
-- kod yolu `refLineId`'yi bu örüntüyle doldurmadığından (I25'in return_out'unun aksine), satır
-- düzeyinde değil fatura+ürün düzeyinde eşleştirme daha sağlam bir kanıt yüzeyi sağlar.
--
-- Kök neden dosyası: `packages/core/src/accounting/invoices.ts::createCreditNote` (isSales dalı,
-- satır ~223-229). Düzeltme önerisi: alış dalındaki örüntüyü birebir tekrarla — kaynak satışın
-- ürettiği `stock_moves(kind='delivery')` hareketlerini (delivery_lines üzerinden) bulup, iade
-- edilen miktar kadar `postStockMove(kind:'return_in', fromLocationId:<müşteri/sanal lokasyon>,
-- toLocationId:<orijinal sevk lokasyonu veya karantina — kalite kontrolsüz doğrudan satılabilire
-- almak riskli, ayrı bir 'sales_return' karantina lokasyonu düşünülebilir>, lotId:<orijinal lot>)`
-- üret; 620/153 vb. stok değer hesaplarını buna göre güncelle.

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
