-- I54 — Ar-Ge reçete devri onay bütünlüğü ("onaylanan rakam" ≠ "üretime giden rakam" olamaz).
--
-- `submitForApproval` (`packages/core/src/rnd/trials.ts`) bir `trial_recipe_versions` satırını
-- 'testing'e taşırken `approvals` kuyruğuna `kind='recipe_release'`, `status='pending'` bir kayıt
-- açar ve o ANDAKİ birim maliyeti `payload.unitCost`'a DONDURUR (bkz. dosya satır ~292-293) —
-- `/onaylar` ekranı onaylayan kişiye TAM OLARAK bu dondurulmuş rakamı gösterir.
--
-- CANLI OLARAK KANITLANDI (rollback'li transaction, fresh seed): `EDITABLE_STATUSES` sabiti
-- (`trials.ts`) {'draft','testing'} — yani versiyon onaya gönderildikten SONRA (`status='testing'`,
-- bekleyen bir `approvals.status='pending'` kaydı VARKEN) HÂLÂ tam yetkiyle düzenlenebilir kümede
-- kalıyor: `updateVersionDraft` bekleyen onaydan tamamen bağımsız çalışıyor, satır/miktar
-- değişikliğini kabul edip `simulateVersionCost` ile `unit_cost`/`material_cost`'u SESSİZCE yeniden
-- yazıyor — `approvals.payload`'ı hiç güncellemiyor, bekleyen onayı iptal/geçersiz de etmiyor.
-- Egzersiz: seed'deki `76af3d2f-...` onayı (status='pending', payload.unitCost='166.1701',
-- refId=`0dddb489-...`) dururken, aynı versiyonun bir satırının miktarı `updateVersionDraft` ile
-- doğrudan değiştirildi → `trial_recipe_versions.unit_cost` 166,1701 → 750,7062'ye (4,5×) sıçradı;
-- `approvals` satırı hâlâ 'pending' + `payload.unitCost` hâlâ eski '166.1701' olarak donuk kaldı.
-- Onaylayan kişi ekranda 166,17 TL görüp "Onayla" derse, `approveRecipeRelease` yalnızca durumu
-- 'approved' yapar ve `releaseToBom` GÜNCEL (750,71 TL'lik) satırları production BOM'una kopyalar —
-- onaylanan rakamla üretime giden rakam arasında hiçbir denetim/uyarı olmadan sessiz bir uçurum
-- oluşur. Test verisi kalıcılaştırılmadı (rollback), `pnpm db:reset` ile taze duruma dönüldü.
--
-- Kök neden dosyası: `packages/core/src/rnd/trials.ts` — `EDITABLE_STATUSES` sabiti (satır ~230)
-- 'testing'i (onaya gönderilmiş, karar bekleyen) 'draft' ile aynı serbestlikte düzenlenebilir sayıyor;
-- `updateVersionDraft` bekleyen bir onay olup olmadığını hiç kontrol etmiyor.
-- Düzeltme önerisi: (a) `EDITABLE_STATUSES`'tan 'testing'i çıkar — versiyon onaya gönderildikten
-- sonra kilitlensin, düzenlemek isteyen önce onayı geri çeksin/reddettirsin ya da `createNewVersion`
-- ile yeni bir versiyon açsın (CLAUDE.md kural 5'in "onaylanan ile uygulanan aynı olmalı" ruhuyla
-- uyumlu, en basit); veya (b) `updateVersionDraft` içinde maliyet gerçekten değişiyorsa VE bekleyen
-- bir onay varsa o onayı otomatik `status='rejected'`/`decisionNote='versiyon değişti, yeniden onay
-- gerekli'` yapıp version.status'ü 'draft'a geri düşürsün — sessiz drift hiçbir durumda kabul edilemez.

SELECT 'I54' AS rule, 'recipe_release_payload_drift' AS entity, a.id::text AS id,
  (a.payload->>'unitCost')::numeric(18, 4) AS expected,
  v.unit_cost AS actual,
  abs(coalesce((a.payload->>'unitCost')::numeric(18, 4), 0) - v.unit_cost) AS diff
FROM approvals a
JOIN trial_recipe_versions v ON v.id = a.ref_id
WHERE a.kind = 'recipe_release'
  AND a.ref_table = 'trial_recipe_versions'
  AND a.status = 'pending'
  AND abs(coalesce((a.payload->>'unitCost')::numeric(18, 4), 0) - v.unit_cost) > 0

UNION ALL

-- Savunma katmanı (defense-in-depth): onaylanmış ve üretim BOM'una devrolmuş her versiyonun
-- satır SAYISI hedef `bom_lines` ile birebir örtüşmeli — `releaseToBom` bunu inşa anında zaten
-- garanti ediyor (bkz. `createBomVersion` çağrısı, satır kopyası birebir), ama I54'ün ilk
-- yarısındaki gibi gelecekte biri `updateVersionDraft`'ı 'approved'/'released' durumuna da açarsa
-- (ör. EDITABLE_STATUSES yanlışlıkla genişletilirse) bu ikinci katman anında kırmızıya döner.
SELECT 'I54', 'recipe_release_bom_line_count_mismatch', v.id::text,
  (SELECT count(*) FROM trial_recipe_lines tl WHERE tl.version_id = v.id)::numeric(18, 4) AS expected,
  (SELECT count(*) FROM bom_lines bl WHERE bl.bom_id = v.released_bom_id)::numeric(18, 4) AS actual,
  abs(
    (SELECT count(*) FROM trial_recipe_lines tl WHERE tl.version_id = v.id)
    - (SELECT count(*) FROM bom_lines bl WHERE bl.bom_id = v.released_bom_id)
  )::numeric(18, 4) AS diff
FROM trial_recipe_versions v
WHERE v.status = 'released' AND v.released_bom_id IS NOT NULL
  AND (SELECT count(*) FROM trial_recipe_lines tl WHERE tl.version_id = v.id)
    <> (SELECT count(*) FROM bom_lines bl WHERE bl.bom_id = v.released_bom_id)

UNION ALL

-- Aynı katman, tutar bazlı: her onaylanmış/devrolmuş versiyonun kayıtlı `unit_cost`'u, kendi
-- satırlarından (`trial_recipe_lines`) `computeTrialCost` formülüyle YENİDEN hesaplandığında aynı
-- çıkmalı — satırlar `simulateVersionCost` dışında bir yoldan (ör. doğrudan SQL/veri düzeltmesi)
-- değiştirilip version özet alanı senkron kalmazsa burada yakalanır.
SELECT 'I54', 'trial_recipe_version_cost_formula_mismatch', v.id::text,
  v.unit_cost AS expected,
  (
    CASE WHEN (v.batch_qty * (CASE WHEN v.expected_yield_pct = 0 THEN 1 ELSE v.expected_yield_pct / 100 END)) = 0 THEN 0
    ELSE
      (
        (SELECT coalesce(sum(tl.qty * (1 + tl.scrap_pct / 100) * tl.unit_cost), 0) FROM trial_recipe_lines tl WHERE tl.version_id = v.id)
        + v.overhead_per_batch
      ) / (v.batch_qty * (CASE WHEN v.expected_yield_pct = 0 THEN 1 ELSE v.expected_yield_pct / 100 END))
      + v.overhead_per_unit
    END
  )::numeric(18, 4) AS actual,
  abs(
    v.unit_cost - (
      CASE WHEN (v.batch_qty * (CASE WHEN v.expected_yield_pct = 0 THEN 1 ELSE v.expected_yield_pct / 100 END)) = 0 THEN 0
      ELSE
        (
          (SELECT coalesce(sum(tl.qty * (1 + tl.scrap_pct / 100) * tl.unit_cost), 0) FROM trial_recipe_lines tl WHERE tl.version_id = v.id)
          + v.overhead_per_batch
        ) / (v.batch_qty * (CASE WHEN v.expected_yield_pct = 0 THEN 1 ELSE v.expected_yield_pct / 100 END))
        + v.overhead_per_unit
      END
    )
  )::numeric(18, 4) AS diff
FROM trial_recipe_versions v
WHERE abs(
    v.unit_cost - (
      CASE WHEN (v.batch_qty * (CASE WHEN v.expected_yield_pct = 0 THEN 1 ELSE v.expected_yield_pct / 100 END)) = 0 THEN 0
      ELSE
        (
          (SELECT coalesce(sum(tl.qty * (1 + tl.scrap_pct / 100) * tl.unit_cost), 0) FROM trial_recipe_lines tl WHERE tl.version_id = v.id)
          + v.overhead_per_batch
        ) / (v.batch_qty * (CASE WHEN v.expected_yield_pct = 0 THEN 1 ELSE v.expected_yield_pct / 100 END))
        + v.overhead_per_unit
      END
    )
  ) > 0.0001

ORDER BY id;
