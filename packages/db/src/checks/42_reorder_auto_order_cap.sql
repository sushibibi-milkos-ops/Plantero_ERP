-- I42 — Kritik stok motoru otomatik onay TUTAR SINIRI, tedarikçi bazında birleştirilmiş
-- (multi-line) AI taslak PO'larında satır bazında ihlal edilemez.
--
-- Kök neden (veri-critic, Aşama-3 tur 2, kod incelemesiyle doğrulandı — bkz. rapor):
-- `apps/web/src/modules/purchasing/actions.ts::runReplenishmentAction` (satır ~252-257) bir
-- tedarikçiye ait AI taslağındaki TÜM satırların `reorder_rules` kayıtlarını toplayıp TEK bir
-- `autoOrderMaxAmount` üretiyor:
--     amounts = rulesForOrder.map(r => r.autoOrderMaxAmount).filter(a => a !== null)
--     autoOrderMaxAmount = (amounts.length === rulesForOrder.length && amounts.length > 0)
--         ? min(amounts) : null   -- <-- HERHANGİ bir satırın kuralı sınırsız (null) ise SONUÇ NULL
-- `reorder_rules.autoOrderMaxAmount = NULL` alan yorumu ("sınırsız otomatik onay — yalnızca beyaz
-- liste kontrol eder") TEK BİR ürün/depo kuralı için tasarlanmış bir politikadır; ama bu kod aynı
-- PO'da birleşen DİĞER kuralların (ör. "Etiket" ürünü için 20.000 TL sınırı olan bir kural)
-- SONLU sınırını da sessizce iptal ediyor — kombine PO tutarı Etiket kuralının kendi sınırının
-- kat kat üzerinde olsa bile `isAutoApproved=true` ile onaysız gönderiliyor.
-- Canlı doğrulama (paket-içi saf mantık kopyası ile, `packages/core/repro-cap-bug.mjs`, veri
-- MUTASYONU olmadan — mevcut seed'de bu iki-kural karışımı henüz yok): rulesForOrder=[{Etiket,
-- cap=20000},{Kapak,cap=null}] → computed autoOrderMaxAmount=null → orderAmount=80.000 TL
-- eligible=true (Etiket'in KENDİ 20.000 TL sınırı tamamen yok sayıldı).
--
-- Bu kural, hatanın DAVRANIŞINI (uygulama kodu) değil SONUCUNU (veritabanı) doğrular — bu yüzden
-- bugün mevcut seed'de her zaman 0 ihlaldir (hiçbir whitelisted kural bugün autoOrderMaxAmount=NULL
-- taşımıyor, bkz. reorder_rules tablosu). Regresyon güvenlik ağı: bir kural NULL sınıra çekilir çekilmez
-- VE aynı tedarikçiye ait sonlu sınırlı bir kuralla birleşen bir PO otomatik onaylanırsa, bu kural
-- ANINDA kırmızıya döner.
--
-- Düzeltme önerisi: aggregation'ı "tümü doluysa min, biri bile boşsa null" yerine "sonlu olanların
-- min'i (varsa) HER ZAMAN nihai sınır olsun; yalnızca TÜMÜ null ise nihai sınır null olsun" şekline
-- çevir: `amounts.length > 0 ? min(amounts) : null` (uzunluk eşitliği koşulunu kaldır).
SELECT
  'I42' AS rule,
  'auto_approved_po_exceeds_line_reorder_rule_cap' AS entity,
  pol.id::text AS id,
  rr.auto_order_max_amount::numeric(18, 4) AS expected,
  po.grand_total::numeric(18, 4) AS actual,
  (po.grand_total - rr.auto_order_max_amount)::numeric(18, 4) AS diff
FROM purchase_order_lines pol
JOIN purchase_orders po ON po.id = pol.order_id
JOIN reorder_rules rr ON rr.id = pol.reorder_rule_id
WHERE po.is_auto_approved = true
  AND rr.auto_order_max_amount IS NOT NULL
  AND po.grand_total > rr.auto_order_max_amount
ORDER BY diff DESC;
