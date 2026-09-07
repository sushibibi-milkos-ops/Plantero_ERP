-- I61 — Kritik kalite testi BAŞARISIZ olan lot "serbest" (released/passed) karara bağlanamaz.
--
-- CANLI OLARAK KANITLANDI (Tur 12, veri-critic, rollback'li transaction, `pnpm --filter @plantero/core test`
-- ile çalıştırılan geçici prob — kalıcılaştırılmadı, `pnpm db:reset` ile taze duruma dönüldü):
-- `packages/core/src/quality/checks.ts` içinde `recordResults()` her sonuç kalemi için `evaluatePass()`
-- ile `isPassed`i şablon `min_value`/`max_value`'suna göre HESAPLAR ve `qc_template_items.is_critical=true`
-- olan bir kalem `isPassed=false` çıkarsa `anyCritical=true` döndürür — ANCAK bu bayrak hiçbir yere
-- YAZILMAZ (yalnızca fonksiyonun dönüş değeri, `qc_checks` tablosunda saklanmaz) ve `decide()` bu bayrağı
-- hiç OKUMAZ. `decide()` yalnızca UI'dan gelen `input.decision` parametresine güvenir; `disposition`/
-- `result` doğrudan bu parametreden atanır (`result = input.decision === 'released' ? 'passed' : 'failed'`).
-- Egzersiz: "Aflatoksin" (min=0, max=5, is_critical=true) kalemine 40 (limit 5) değeri girildi —
-- `recordResults` doğru şekilde `isPassed=false`, `anyCritical=true` döndürdü, ama hemen ardından
-- `decide(checkId, { decision: 'released', releaseToLocationId: ... })` HİÇBİR HATA VERMEDEN başarılı
-- oldu: `check.result` 'passed' oldu, `lot.status` 'released' oldu, 20 kg tam miktar serbest lokasyona
-- taşındı — üretime/sevkiyata açık. `apps/web/src/modules/quality/components/check-detail.tsx` da
-- "Serbest Bırak" düğmesini yalnızca `releaseLocationId` seçilip seçilmediğine göre `disabled` eder
-- (satır ~236), kritik başarısızlık durumuna bakmaz — UI katmanında da hiçbir engel yok.
--
-- Bu SQL bugün (taze seed) 0 satır döner — seed verisinde kritik başarısız + released kombinasyonu
-- YOK — ama bu servis/UI açığı canlı olarak kanıtlandığı için savunma katmanı olarak kalıcılaştırılır:
-- ileride biri (gerçek kullanıcı ya da demo veri) bu yolu kullanırsa anında kırmızıya döner.
--
-- Kök neden dosyası: `packages/core/src/quality/checks.ts` — `decide()` (satır ~230+), `anyCritical`i
-- `recordResults`ten devralıp saklamıyor ve kontrol etmiyor.
-- Düzeltme önerisi: (a) `qc_checks`e kalıcı bir `any_critical_fail` (boolean) alanı ekleyip
-- `recordResults` içinde yazılsın (şema dondurulmuş — `schemaRequests`te belirtildi); (b) `decide()`
-- `input.decision === 'released'` iken bu bayrak true ise `DomainError('QC_CRITICAL_FAIL_BLOCKED', ...)`
-- ile reddetsin — tıpkı `enforceLotRules`in karantina dışı lotu reddetmesi gibi sert bir kapı; kritik
-- testi geçmeyen bir lotun serbest bırakılması yalnızca açık bir "istisna/waiver" kararıyla (ayrı
-- alan, ayrı yetki) mümkün olmalı, sessizce değil. (c) UI'da "Serbest Bırak" düğmesi `anyCritical`
-- true iken devre dışı bırakılıp kullanıcıya net bir uyarı gösterilsin.

SELECT 'I61' AS rule, 'qc_release_despite_critical_fail' AS entity, c.id::text AS id,
  0::numeric(18, 4) AS expected,
  1::numeric(18, 4) AS actual,
  1::numeric(18, 4) AS diff
FROM qc_checks c
WHERE c.result = 'passed'
  AND EXISTS (
    SELECT 1
    FROM qc_check_results r
    JOIN qc_template_items ti ON ti.id = r.template_item_id
    WHERE r.check_id = c.id AND r.is_passed = false AND ti.is_critical = true
  )

UNION ALL

-- Savunma katmanı (ikinci kademe, daha geniş): şablonsuz/kritik-işaretsiz bile olsa, HERHANGİ bir
-- sonuç kalemi isPassed=false iken check.result='passed' olması da mantıksız (recordResults'un kendi
-- `allPassed` hesabıyla çelişir) — bu satır kritik olmayan ama yine de "başarısız" kayıtlı bir kalemin
-- sessizce released'a karışmasını da yakalar (bugün 0 satır; seed'deki tek `is_passed=false` kaydı
-- zaten disposition='rejected').
SELECT 'I61', 'qc_release_despite_any_fail', c.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM qc_checks c
WHERE c.result = 'passed'
  AND EXISTS (SELECT 1 FROM qc_check_results r WHERE r.check_id = c.id AND r.is_passed = false)

ORDER BY id;
