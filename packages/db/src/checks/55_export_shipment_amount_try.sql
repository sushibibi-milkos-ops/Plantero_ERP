-- I55 — İhracat sevkiyatının TL karşılığı (export_shipments.amount_try), zorunlu denetim #9'un
-- ("dövizli faturada TL karşılığı = döviz × fiş tarihindeki kur") ihracat sevkiyat takip katmanındaki
-- eşleniği: fatura kesilmeden önceki her aşamada amount_try = (proforma_amount varsa proforma_amount,
-- yoksa bağlı sales_orders.grand_total) × exchange_rate olmalı; fatura bağlandıktan sonra ise
-- amount_try/exchange_rate BİREBİR bağlı invoices.grand_total_try/exchange_rate ile eşleşmeli.
--
-- CANLI OLARAK KANITLANDI (veri-critic, Aşama-4 tur-5, rollback'li transaction, packages/core'dan
-- doğrudan, hiçbir kalıcı veri değişmedi): `packages/core/src/export/shipments.ts::createFromOrder`
-- `exchangeRate`/`amountTry`'ı YALNIZCA sevkiyat AÇILIRKEN (o anki `sales_orders.grand_total` ×
-- `exchange_rate` ile) bir kez donduruyor (satır ~92-93, ~101). Aynı dosyadaki `generateProforma`
-- (satır ~152-172) daha sonra `proformaAmount`'u siparişin GÜNCEL toplamına yeniden çekiyor (kendi
-- yorumu: "siparişin GÜNCEL toplamından — satırlar değişmiş olabilir") ama `exchangeRate`/`amountTry`'a
-- HİÇ dokunmuyor — ikisi arasında sessiz bir senkron kopukluğu var. Egzersiz: taze bir EUR ihracat
-- siparişi (`docType='order'`, `status='draft'`, 10 adet × 20 EUR = 200 EUR, kur=38,50 → amountTry
-- beklenen 7.700,00 TL) üzerinde `createFromOrder` çağrıldı (shipment `amountTry=7.700,0000` ile
-- doğru şekilde açıldı) → sipariş hâlâ 'draft' olduğundan (`isEditable`, satırlarda henüz teslim/
-- fatura yok) `updateLines` ile satır miktarı 10→100'e (10 kat) çıkarıldı, `grandTotal` 200→2.000 EUR'ya
-- sıçradı → `generateProforma` çağrıldı: sonuç `proformaAmount=2.000,0000` (DOĞRU, güncel) ama
-- `amountTry` hâlâ eski `7.700,0000` (YANLIŞ) ve `exchangeRate` hâlâ `38,500000` — oysa doğru TL
-- karşılığı `2.000 × 38,50 = 77.000,0000` TL olmalıydı. Fark: **69.300,0000 TL** (tam olarak 9×200×38,50
-- — 10 katına çıkan miktarın 9 katlık payı hiç yansımamış). Bu tutar `reindex()` (aynı dosya, satır
-- ~44-47) üzerinden `documents` indeksine (`amount: s.amountTry`) — dolayısıyla `/kokpit` panolarındaki
-- "İhracat" KPI kartlarına ve `/ihracat/sevkiyatlar` liste ekranına — YANLIŞ (9× küçük) bir TL tutarı
-- olarak sızıyor; ETGB mikro ihracat limit kontrolü de (`checkEtgbLimit`, yalnızca oluşturma anında
-- çalışıyor) aynı staleness'tan aynı şekilde etkilenir (limitin üzerine çıkan bir sipariş, sevkiyat
-- açıldıktan SONRA büyütülürse rejim yeniden değerlendirilmez — ayrı bir bulgu, burada sayısal olarak
-- ölçülmüyor).
--
-- Kök neden dosyası: `packages/core/src/export/shipments.ts::generateProforma` — `proformaAmount`'u
-- güncellerken aynı transaction'da `exchangeRate`'i (fiş tarihine en yakın TCMB kuruyla, I20'nin
-- `exchange_rates` sorgu örüntüsünü izleyerek) yeniden çözüp `amountTry = round4(proformaAmount ×
-- exchangeRate)` olarak YENİDEN YAZMASI gerekiyor; ayrıca `advanceToCustoms`/`markShipped` gibi
-- proforma sonrası ama fatura öncesi aşamalarda da sipariş satırları hâlâ teorik olarak (draft kalan
-- bir sipariş üzerinden) değişebiliyorsa aynı yeniden hesaplama oraya da taşınmalı — en güvenli yol
-- `linkInvoice` öncesi HER durum geçişinde amountTry'ı bağlı sales_order/proformaAmount'tan taze
-- türetmek (I13/I20'nin invoice tarafında zaten yaptığı gibi, ledger'a yazmadan önce kaynağı
-- doğrulamak).
--
-- Kapsam:
--   a) invoice_id IS NULL, status <> 'cancelled': amount_try = round((proforma_amount>0 ise
--      proforma_amount, değilse bağlı sales_orders.grand_total) × exchange_rate, 4)
--   b) invoice_id DOLU: amount_try = invoices.grand_total_try VE exchange_rate = invoices.exchange_rate
--      (fatura sonradan iade/düzeltmeyle değişirse sevkiyat kaydının bunu takip etmemesi aynı
--      staleness sınıfının ikinci bir görünümü olur).
--
-- Fresh seed: 0 ihlal (hiçbir sevkiyat henüz proforma-sonrası satır düzenlemesi görmedi — bu kural şu
-- an saf bir regresyon güvenlik ağı, canlı egzersiz yukarıda ayrı bir rollback'li transaction'da
-- kanıtlandı).

WITH pre_invoice AS (
  SELECT
    es.id, es.exchange_rate::numeric AS exchange_rate, es.amount_try::numeric AS amount_try,
    CASE WHEN es.proforma_amount::numeric > 0 THEN es.proforma_amount::numeric ELSE so.grand_total::numeric END AS reference_amount
  FROM export_shipments es
  LEFT JOIN sales_orders so ON so.id = es.sales_order_id
  WHERE es.invoice_id IS NULL
    AND es.status <> 'cancelled'
    AND es.exchange_rate IS NOT NULL
    AND (es.proforma_amount::numeric > 0 OR so.id IS NOT NULL)
),
pre_invoice_mismatch AS (
  SELECT
    'I55' AS rule, 'export_shipment_amount_try_mismatch' AS entity, p.id::text AS id,
    round(p.reference_amount * p.exchange_rate, 4) AS expected,
    p.amount_try AS actual,
    (p.amount_try - round(p.reference_amount * p.exchange_rate, 4)) AS diff
  FROM pre_invoice p
  WHERE abs(p.amount_try - round(p.reference_amount * p.exchange_rate, 4)) > 0
),
invoiced_mismatch AS (
  SELECT
    'I55' AS rule, 'export_shipment_invoice_amount_try_mismatch' AS entity, es.id::text AS id,
    inv.grand_total_try::numeric AS expected,
    es.amount_try::numeric AS actual,
    (es.amount_try::numeric - inv.grand_total_try::numeric) AS diff
  FROM export_shipments es
  JOIN invoices inv ON inv.id = es.invoice_id
  WHERE abs(es.amount_try::numeric - inv.grand_total_try::numeric) > 0
     OR abs(es.exchange_rate::numeric - inv.exchange_rate::numeric) > 0.000001
)
SELECT * FROM pre_invoice_mismatch
UNION ALL
SELECT * FROM invoiced_mismatch
ORDER BY id;
