-- I21 — Devreden KDV (190) / Ödenecek KDV (360) tutarlılığı (I12'nin eksik parçası)
-- CLAUDE.md kural 8 / mandate zorunlu denetim #7: "devreden KDV (190) hesabı önceki ay + alış − satış ile tutarlı".
-- vat_periods (packages/db/src/schema/accounting.ts) bu hesabı tutmak için var.
--
-- Standart KDV mahsup mantığı (VUK/KDVK — bu, "tersi" değil, TEK doğru yöndür):
--   net = carried_from_prev (önceki aydan devreden KDV alacağı) + input_vat (bu ay indirilecek KDV)
--         − output_vat (bu ay hesaplanan/tahsil edilen KDV)
--   net ≥ 0  ⇒ indirilecek+devreden, hesaplananı KARŞILIYOR/AŞIYOR ⇒ işletmenin ÖDEYECEĞİ KDV YOK,
--              fark bir sonraki aya DEVREDEN KDV alacağı olarak taşınır: carried_to_next = net, payable = 0
--   net < 0  ⇒ hesaplanan KDV, indirilecek+devreden'i AŞIYOR ⇒ aradaki fark vergi dairesine
--              ÖDENECEK KDV'dir: payable = −net, carried_to_next = 0
--
-- **BULGU (veri-critic, Tur 4, P0, KIRMIZI, kök neden, CANLI OLARAK KANITLANDI — bu turda ilk kez
-- egzersiz edildi)**: `packages/db/src/seed/accounting-docs.ts` artık `closeVatPeriod('2026-08', ...)`
-- çağırıyor (daha önceki turlarda vat_periods HER ZAMAN BOŞTU — bu kontrol o zamana kadar veri
-- yokluğundan geçiyordu, bkz. aşağıdaki eski not) ve gerçek bir satır üretiyor: fresh seed'de
-- 2026-08 dönemi output_vat=442,5576 (satış KDV'si, %1 gıda), input_vat=35.080,0000 (alış KDV'si,
-- %20), carried_from_prev=0 ⇒ net = 0+35.080−442,5576 = **+34.637,4424** (yani indirilecek KDV
-- hesaplananın 79 katı — işletme net bir KDV ALACAKLISI, ödeyecek hiçbir şeyi yok). Ama
-- `packages/core/src/accounting/vat.ts::closeVatPeriod` bu değeri `payable = max(net,0) = 34.637,4424`
-- olarak `360` (Ödenecek KDV, ALACAK) hesabına, `carried_to_next = max(−net,0) = 0` olarak `190`'a
-- (hiç dokunmadan) yazıyor — YANİ TAM TERSİ: gerçekte var olmayan 34.637,44 TL'lik bir vergi
-- YÜKÜMLÜLÜĞÜ (360 alacak) bilançoya işlendi, gerçekte var olan 34.637,44 TL'lik devreden KDV
-- ALACAĞI (190 borç) hiç kaydedilmedi. `vat.ts`'in kendi dosya-başı yorumu bunu AÇIKÇA itiraf
-- ediyor ("standart KDV mahsup mantığının TERSİDİR... bu kontrolün kendi formülünü birebir
-- uygular, aksi halde db:check kırmızı kalır") — yani önceki bir tur bu SQL'i (o zamanki (b)/(c)
-- kuralları) YANLIŞ yazmış, sonraki core-katmanı ajanı da "kontrol dondurulmuş" varsayımıyla
-- servisi o yanlış formüle UYDURMUŞ. **Kanıt (bağımsız muhasebe mantığıyla, sıfırdan)**: yalnızca
-- alış yapıp hiç satış yapmayan bir ay düşünün (output_vat=0, input_vat=1000, carried_from_prev=0)
-- — gerçekte işletme vergi dairesine BORÇLANAMAZ (satış KDV'si tahsil etmediği için ödeyecek bir
-- şey yok), yalnızca 1000 TL'lik devreden bir alacağı vardır; eski formül bunu payable=1000
-- (360 ALACAK — "1000 TL borçlusun") olarak kaydederdi, ki bu muhasebesel olarak imkânsızdır.
-- (b)/(c)/(d) kuralları bu turda DÜZELTİLDİ (payable/carried_to_next etiketleri doğru yöne
-- çevrildi, 360 defter bakiyesi kontrolü (d) olarak eklendi) — artık mevcut fresh-seed verisiyle
-- KIRMIZI veriyor (aşağıdaki gerçek satır kimlikleri): journal_entries `42a0de9b-1d29-4cee-8f2a-
-- 94bc453e5006` (VUK) / `20b4b639-4bfd-4e0b-bac0-620b2520793d` (UFRS), her ikisi de `360` hesabına
-- 34.637,4424 TL yanlış alacak, `190`'a hiç kayıt yok.
-- **Kök neden dosyası**: `packages/core/src/accounting/vat.ts::closeVatPeriod` — `payable`/
-- `carriedToNext` atamaları (satır ~103-104) birbiriyle YER DEĞİŞTİRMELİ:
--   payable = max(net.neg(), ZERO); carriedToNext = max(net, ZERO);  (mevcut kod bunun tersini yapıyor)
-- ve dosya başındaki "checks/21 formülü değiştirilemez" varsayımı da yanlıştı — packages/db/src/
-- checks/*.sql veri-critic'in KENDİ yazma alanı, şema gibi dondurulmuş değil.
-- **Düzeltme önerisi**: (1) `vat.ts`'te iki `max(...)` atamasını takas et; (2) mevcut YANLIŞ
-- 2026-08 fişini (`42a0de9b.../20b4b639...`) `reverseJournalEntry` ile ters çevirip `vat_periods`
-- satırını sil, `closeVatPeriod` düzeltildikten sonra dönemi yeniden kapat (idempotent guard
-- `existing.journalEntryId` doluyken atladığı için düzeltme öncesi satır önce silinmeli).
--
-- (Eski not, artık GÜNCEL DEĞİL — yalnızca tarihsel referans için bırakıldı: "bu tabloyu dolduran
-- hiçbir servis yok ... vat_periods her zaman boş, dolayısıyla bu kural bugün 0 satır dönebilir
-- (veri yok ⇒ ihlal yok)" — artık dolduran servis var (`accounting-docs.ts` seed adımı) ve kural
-- gerçek veriyle egzersiz ediliyor.)

WITH ordered AS (
  SELECT
    vp.*,
    LAG(vp.carried_to_next) OVER (ORDER BY vp.period) AS prev_carried_to_next,
    LAG(vp.period) OVER (ORDER BY vp.period) AS prev_period
  FROM vat_periods vp
),
ledger_190 AS (
  SELECT
    to_char(je.entry_date, 'YYYY-MM') AS period,
    SUM(jl.debit - jl.credit) AS bal
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.entry_id
  WHERE (jl.account_code = '190' OR jl.account_code LIKE '190.%')
    AND jl.ledger = 'VUK' AND je.status IN ('posted', 'reversed')
  GROUP BY 1
),
ledger_360 AS (
  SELECT
    to_char(je.entry_date, 'YYYY-MM') AS period,
    SUM(jl.credit - jl.debit) AS bal
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.entry_id
  WHERE (jl.account_code = '360' OR jl.account_code LIKE '360.%')
    AND jl.ledger = 'VUK' AND je.status IN ('posted', 'reversed')
  GROUP BY 1
)

-- a) devreden KDV zinciri: bu ayın carried_from_prev = bir önceki takvim ayının carried_to_next
--    (yalnızca ardışık aylar için; ilk kayıtlı dönem veya araya boşluk düşen dönem kapsam dışı)
SELECT
  'I21' AS rule, 'vat_period_carry_chain_broken' AS entity, o.period AS id,
  o.prev_carried_to_next::numeric(18, 4) AS expected,
  o.carried_from_prev::numeric(18, 4) AS actual,
  (o.carried_from_prev - o.prev_carried_to_next)::numeric(18, 4) AS diff
FROM ordered o
WHERE o.prev_period IS NOT NULL
  AND to_char((to_date(o.prev_period || '-01', 'YYYY-MM-DD') + interval '1 month')::date, 'YYYY-MM') = o.period
  AND abs(o.carried_from_prev - o.prev_carried_to_next) > 0

UNION ALL

-- b) payable = greatest(output_vat − input_vat − carried_from_prev, 0)  (DÜZELTİLDİ, Tur 4 — bkz. üst not:
--    hesaplanan KDV, devreden+indirilecek'i AŞARSA fark ÖDENECEK KDV'dir; eski formül tam tersini yapıyordu)
SELECT
  'I21', 'vat_period_payable_formula_mismatch', vp.period,
  GREATEST(vp.output_vat - vp.input_vat - vp.carried_from_prev, 0)::numeric(18, 4) AS expected,
  vp.payable::numeric(18, 4) AS actual,
  (vp.payable - GREATEST(vp.output_vat - vp.input_vat - vp.carried_from_prev, 0))::numeric(18, 4) AS diff
FROM vat_periods vp
WHERE abs(vp.payable - GREATEST(vp.output_vat - vp.input_vat - vp.carried_from_prev, 0)) > 0

UNION ALL

-- c) carried_to_next = greatest(carried_from_prev + input_vat − output_vat, 0)  (DÜZELTİLDİ, Tur 4)
SELECT
  'I21', 'vat_period_carry_to_next_formula_mismatch', vp.period,
  GREATEST(vp.carried_from_prev + vp.input_vat - vp.output_vat, 0)::numeric(18, 4) AS expected,
  vp.carried_to_next::numeric(18, 4) AS actual,
  (vp.carried_to_next - GREATEST(vp.carried_from_prev + vp.input_vat - vp.output_vat, 0))::numeric(18, 4) AS diff
FROM vat_periods vp
WHERE abs(vp.carried_to_next - GREATEST(vp.carried_from_prev + vp.input_vat - vp.output_vat, 0)) > 0

UNION ALL

-- d) 190 defter bakiyesi (dönem sonu, VUK) = o dönemin carried_to_next'i ile eşit olmalı
SELECT
  'I21', 'vat_period_190_ledger_mismatch', vp.period,
  vp.carried_to_next::numeric(18, 4) AS expected,
  COALESCE(l190.bal, 0)::numeric(18, 4) AS actual,
  (COALESCE(l190.bal, 0) - vp.carried_to_next)::numeric(18, 4) AS diff
FROM vat_periods vp
LEFT JOIN ledger_190 l190 ON l190.period = vp.period
WHERE abs(COALESCE(l190.bal, 0) - vp.carried_to_next) > 0

UNION ALL

-- e) 360 defter bakiyesi (dönem sonu, VUK) = o dönemin payable'ı ile eşit olmalı (YENİ, Tur 4 —
--    (d)'nin simetriği; asıl canlı hatayı (360'a yanlışlıkla 34.637,44 TL yazılması) doğrudan
--    yakalayan satır budur — (b) yalnızca vat_periods tablosunun kendi iç formülünü doğruluyor,
--    bu ise o tabloda YAZANLA muhasebeye GERÇEKTEN İŞLENENİN birebir aynı olduğunu doğrular)
SELECT
  'I21', 'vat_period_360_ledger_mismatch', vp.period,
  vp.payable::numeric(18, 4) AS expected,
  COALESCE(l360.bal, 0)::numeric(18, 4) AS actual,
  (COALESCE(l360.bal, 0) - vp.payable)::numeric(18, 4) AS diff
FROM vat_periods vp
LEFT JOIN ledger_360 l360 ON l360.period = vp.period
WHERE abs(COALESCE(l360.bal, 0) - vp.payable) > 0

ORDER BY id;
