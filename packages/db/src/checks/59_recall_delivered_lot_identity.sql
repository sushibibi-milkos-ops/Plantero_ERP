-- I59 — Geri çağırma "delivered" kalemi ile gerçekten sevk edilen lot birebir aynı olmalı.
--
-- `packages/core/src/quality/recall.ts::initiate()` bloklama döngüsünden SONRA `impact.deliveries`
-- listesi üzerinde ikinci bir döngüyle her etkilenen sevkiyat için bir `recall_items` satırı
-- (`hop:'delivered', action:'notify_customer'`) yazar. Bu satırın `lotId` alanı KÖK NEDEN olarak
-- `impact.lots[0]?.id ?? recall.rootLotId` ile dolduruluyor — yani zincirdeki LOTLARIN İLKİ (hemen
-- her zaman recall'ün KÖK/hammadde lotu) — sevk edilen delivery'nin GERÇEKTE taşıdığı lotla HİÇBİR
-- ilgisi yok. Sebep: `packages/core/src/lots/trace.ts::RecallImpact['deliveries']` tipi
-- `{id, docNo, status, qty}` — sevkiyatın hangi lotu taşıdığı bilgisini HİÇ taşımıyor, `initiate()`nin
-- bu döngüde doğru lotId'yi bulacak hiçbir verisi yok, bu yüzden sabit `impact.lots[0]` ile dolduruluyor.
--
-- Sonuç: birden fazla lot içeren HER geri çağırmada (kök hammadde + ondan üretilen ≥1 mamul lotu —
-- tipik bir üretim zinciri recall'ı) TÜM 'delivered' kalemlerinin `lotId`'si aynı (yanlış) lota
-- işaret eder. Bu doğrudan iki canlı sonucu doğurur:
--   (1) `recordRecallAction('return', ...)` (I57/I58 — return dalı) `item.lotId`'yi kullanarak
--       `postStockMove(kind:'recall_return', lotId: <YANLIŞ LOT>, ...)` çağırır — müşteriden fiilen
--       GERİ GELEN mamul lotu hiç envantere girmez, bunun yerine hiç fiziksel olarak hareket
--       etmemiş bir BAŞKA (genelde kök hammadde) lota hayali/phantom miktar eklenir. I57/I58'in
--       kendi formülleri yalnızca TOPLAM miktarı (ref_id=recall_item.id bazında) doğruladığından bu
--       lot-kimliği hatasını hiç yakalayamaz.
--   (2) `/kalite/geri-cagirma` ekranındaki "Sevk edilen lot" bilgisi tüm müşteriler için aynı (yanlış)
--       lot numarasını gösterir — CLAUDE.md'nin "lot izlenebilirliği hiçbir noktada kopmaz" ilkesinin
--       doğrudan ihlali, mandate #4 ("Müşteriye giden her lot delivery_lines.lotId ile bağlı") burada
--       recall'ün KENDİ iç kaydında kopuyor (delivery_lines'ın kendisi doğru kalır — I6 hâlâ geçer).
--
-- Canlı doğrulama (veri-critic, bu tur, rollback'li vitest transaction'ı, `packages/core`'dan
-- doğrudan): aynı hammadde lotundan İKİ ayrı iş emriyle İKİ farklı mamul lotu (A, B) üretildi, A
-- DN-...-A ile, B DN-...-B ile (2 ayrı sevkiyat belgesi) müşteriye sevk edildi. Kök hammadde lotu
-- üzerinde `simulate()`+`initiate()` çağrıldı → AYNI transaction'da hem DN-...-A hem DN-...-B için
-- üretilen `recall_items` satırlarının `lot_id`'si BİREBİR AYNI çıktı (her ikisi de kök hammadde
-- lotunun id'si) — ne A'nın ne B'nin gerçek id'siyle eşleşmedi. Bu SQL AYNI transaction'da anında
-- 2 ihlal verdi (`recall_item.lot_id`, her ikisi de delivery_lines'taki gerçek lotla uyuşmuyor). Test
-- verisi rollback ile hiç kalıcı yazılmadı; `packages/core`'a hiçbir değişiklik yapılmadı (veri-critic
-- yalnızca bu dosyayı ve docs/INVARIANTS.md'yi yazar).
--
-- Kapsam: fresh seed'de `recall_items` 0 satır (seed'in tek recall'ı 'simulation' durumunda kalır,
-- `initiate()` hiç çağrılmaz) — bu yüzden BUGÜN DORMANT, ama `/kalite/geri-cagirma` ekranından "Başlat"
-- düğmesine basan İLK gerçek kullanıcı, birden fazla lotlu HER recall'da anında bu ihlali üretir.
--
-- Kök neden dosyası: `packages/core/src/quality/recall.ts::initiate()` — `impact.deliveries` döngüsündeki
-- `lotId: impact.lots[0]?.id ?? recall.rootLotId` ataması.
-- Düzeltme önerisi: (a) `packages/core/src/lots/trace.ts::RecallImpact['deliveries']`'e `lotId` alanı
-- ekle (traceForward zaten her `byDelivery` girdisini TEK bir üst lot düğümünün (`lotNid`) altında
-- işliyor — `dels.set(rawId, {..., lotId: lot.lot.id})` ile taşınabilir, aynı delivery birden fazla
-- lot düğümünden erişilebiliyorsa `dels` zaten Map olduğundan yalnızca ilk eklenen kazanır — bu da
-- gerçek delivery_lines çok-lotlu ise ayrı bir bilinen sınırlama olarak belgelenmeli); (b) `initiate()`
-- bu alanı `impact.lots[0]` yerine kullanacak şekilde güncellensin.

SELECT
  'I59' AS rule, 'recall_delivered_item_lot_mismatch' AS entity, ri.id::text AS id,
  1::numeric(18, 4) AS expected,
  0::numeric(18, 4) AS actual,
  1::numeric(18, 4) AS diff
FROM recall_items ri
WHERE ri.hop = 'delivered'
  AND ri.delivery_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM delivery_lines dl
    WHERE dl.delivery_id = ri.delivery_id AND dl.lot_id = ri.lot_id
  )
ORDER BY id;
