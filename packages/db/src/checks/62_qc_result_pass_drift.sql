-- I62 — qc_check_results.is_passed, kayıtlı ölçüm değeri + şablon min/max sınırından YENİDEN
-- hesaplandığında aynı çıkmalı (I54'teki "onaylanan ≠ üretime giden" drift kalıbının kalite modülü
-- karşılığı — savunma katmanı).
--
-- `packages/core/src/quality/checks.ts::evaluatePass()` `isPassed`i YAZMA anında hesaplayıp
-- `qc_check_results.is_passed`e DONDURUR. `qc_template_items.min_value`/`max_value` daha sonra
-- (`templates.ts` üzerinden) değiştirilirse — ör. bir spesifikasyon güncellemesi/düzeltmesi — zaten
-- kaydedilmiş `qc_check_results` satırları SESSİZCE eski (yanlış) `is_passed` değerini taşımaya devam
-- eder; ekranda "uygun" görünen bir ölçüm artık güncel sınırlara göre uygun olmayabilir (ya da tersi).
-- Bugün (taze seed) 0 satır — şablonlar seed'den sonra hiç değiştirilmedi — ama I54 hattındaki gibi
-- ileride bir şablon düzenlemesi bu tutarsızlığı canlı olarak üretebilir; bu yüzden kalıcı bir
-- savunma sorgusu olarak eklenir.
--
-- Kök neden dosyası (gelecekte tetiklenirse): `packages/core/src/quality/templates.ts` (şablon
-- kalemi min/max güncellemesi) — mevcut `qc_check_results` satırlarını yeniden değerlendirmiyor.
-- Düzeltme önerisi: şablon min/max değişikliğinde, o kalemi kullanan `pending` DIŞINDAKİ kayıtlı
-- sonuçları dokunmadan bırakmak (tarihsel doğruluk — o anki sınıra göre karar verildi) YERİNE, en
-- azından şablonun `version`lanmasını sağlayıp `qc_check_results`in hangi şablon SÜRÜMÜNE göre
-- değerlendirildiğini saklamak (bugün `template_item_id` var ama sürüm yok) — aksi halde bu sorgu
-- her şablon düzeltmesinde geçmiş kayıtları "yanlış" gösterip gürültü üretir; asıl düzeltme normatif
-- bir tasarım kararı gerektirir (rapora yazıldı, `schemaRequests`).

SELECT 'I62' AS rule, 'qc_result_is_passed_numeric_drift' AS entity, r.id::text AS id,
  (
    (ti.min_value IS NULL OR r.value_numeric >= ti.min_value)
    AND (ti.max_value IS NULL OR r.value_numeric <= ti.max_value)
  )::int::numeric(18, 4) AS expected,
  COALESCE(r.is_passed::int, -1)::numeric(18, 4) AS actual,
  1::numeric(18, 4) AS diff
FROM qc_check_results r
JOIN qc_template_items ti ON ti.id = r.template_item_id
WHERE r.value_numeric IS NOT NULL
  AND r.is_passed IS DISTINCT FROM (
    (ti.min_value IS NULL OR r.value_numeric >= ti.min_value)
    AND (ti.max_value IS NULL OR r.value_numeric <= ti.max_value)
  )

UNION ALL

SELECT 'I62', 'qc_result_is_passed_boolean_drift', r.id::text,
  r.value_bool::int::numeric(18, 4), COALESCE(r.is_passed::int, -1)::numeric(18, 4), 1::numeric(18, 4)
FROM qc_check_results r
JOIN qc_template_items ti ON ti.id = r.template_item_id
WHERE r.value_bool IS NOT NULL AND ti.kind = 'boolean'
  AND r.is_passed IS DISTINCT FROM (r.value_bool = true)

ORDER BY id;
