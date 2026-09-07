-- I60 — Geri çağırma "delivered" kalemleri EKSİKSİZ olmalı: zincire dahil (bloklanmış) bir lot
-- fiilen bir irsaliyeyle sevk edilmişse, o (delivery_id, lot_id) çifti için bir `recall_items`
-- ('hop'='delivered') satırı MUTLAKA olmalı. I59 yalnızca VAR OLAN 'delivered' satırlarının
-- lot_id'sinin delivery_lines'taki gerçek lotla eşleştiğini doğruluyor — hiç üretilmeyen (eksik)
-- bir satırı hiç yakalayamıyor. Bu kural I59'un tam simetriği: I59 "yanlış" satırı, I60 "kayıp"
-- satırı yakalar.
--
-- Kök neden (`packages/core/src/lots/trace.ts`, `class Graph`, metod `add()`): bir node zaten
-- `nodes` Map'inde varsa (`id = nodeId(kind, rawId)`) `add()` onu ASLA üzerine yazmaz, yalnızca
-- `depth` daha küçükse günceller — node'un GERİ KALAN tüm alanları (özellikle I59'un eklediği
-- `lotId`) İLK ekleyenin değerinde donar. `traceForward`'ın `visit(lot, depth)` kapanışı HER
-- ziyaret ettiği lot için kendi `delivery_lines` satırlarını sorgulayıp `g.add({id: delivery.id,
-- kind:'delivery', ..., lotId: lot.lot.id})` çağırır (satır ~246) — bu, delivery.id'yi node id
-- olarak kullanır. `stock/deliveries.ts::reserveFefo`'nun kendi dosya-başı sözleşmesi AÇIKÇA
-- itiraf ediyor: "FEFO birden çok lota düşerse satır bölünür (aynı salesOrderLineId, farklı
-- lotId/fromLocationId — yeni delivery_lines satırı)" — yani AYNI TEK irsaliyede (aynı
-- `deliveries.id`) FARKLI lotlardan gelen satırlar günlük operasyonda normaldir (büyük bir sipariş
-- satırı, eldeki ilk lot yetmeyince ikinci bir lota taşar). Geri çağırma zincirindeki İKİ farklı
-- mamul lotu (örn. aynı hammadde lotundan iki ayrı iş emriyle üretilmiş) FEFO ile AYNI irsaliyeye
-- düşerse: `traceForward` önce lot A'yı ziyaret eder → `g.add({id:delivery.id, ..., lotId:A})` →
-- yeni node yaratılır. Sonra lot B ziyaret edilir → AYNI `delivery.id` ile tekrar `g.add(...)`
-- çağrılır → `Graph.add()` node zaten var olduğu için (`existing` doluyken) hiçbir alanı GÜNCELLEMEZ
-- → node'un `lotId`'si hâlâ A, `qty`'si hâlâ yalnızca A'nın miktarı. B'den delivery node'una giden
-- `link()` KENARI grafiğe eklenir (kenar anahtarı `from->to` farklı olduğundan) ama
-- `simulateRecall`'daki `dels` Map'i yalnızca `res.nodes`'u okur (satır: "else if (n.kind ===
-- 'delivery') dels.set(rawId, {...lotId: n.lotId})") — kenarları HİÇ okumaz. Sonuç:
-- `impact.deliveries` bu irsaliyeyi TEK satır (yalnızca A) olarak görür, B'nin bu irsaliyeyle
-- taşınan payı (`initiate()`'in `for (const d of impact.deliveries)` döngüsü, satır ~166-182)
-- hiçbir `recall_items` satırına dönüşmez.
--
-- Sonuç (canlı doğrulama, veri-critic Tur 11, rollback'li vitest transaction'ı, `packages/core`'dan
-- doğrudan, I59'un kendi testiyle BİREBİR aynı üretim kurulumu — tek fark: iki mamul lotu 2 AYRI
-- irsaliye yerine TEK bir irsaliyeye (2 delivery_lines satırı, aynı deliveryId) sevk edildi):
-- `delivery_lines` (yer-gerçeği) 2 satır gösterdi (lot A 30 kg, lot B 30 kg — toplam 60 kg fiilen
-- müşteriye gitti), ama `initiate()` SONRASI `recall_items WHERE hop='delivered'` yalnızca 1 satır
-- ürettiği görüldü (lotId=A, qtyDelivered=30 — B'nin 30 kg'ı ve kendi lot kimliği TAMAMEN kayıp).
-- Bu SQL aynı anlık görüntüde 1 ihlal verir (B'nin (delivery, lot) çifti için satır yok). Sonuçları:
--   (1) O müşteri, gerçekte lot B'den de ürün almış olmasına rağmen, geri çağırma kaydında/`
--       /kalite/geri-cagirma` ekranında SADECE lot A'dan aldığı görünür — CLAUDE.md "lot izlenebilirliği
--       hiçbir noktada kopmaz" ilkesinin doğrudan ihlali, mandate #4'ün (I59'un da bahsettiği) BİR
--       DAHA farklı bir kırılma noktası.
--   (2) `recordRecallAction('return', ...)` bu eksik kalemi işleyecek BİR recall_item hiç
--       bulamayacağından, lot B'nin fiziksel iadesi kalite ekranından asla tetiklenemez — kalıcı
--       kör nokta.
--   (3) `buildDraftMessage`/bildirim akışı (aynı `impact.deliveries`i kullanır) müşteriye "geri
--       çağırılan miktar" olarak 60 kg yerine yalnızca 30 kg bildirir.
-- Test verisi rollback ile hiç kalıcı yazılmadı; `packages/core`'a hiçbir kalıcı değişiklik
-- yapılmadı (veri-critic yalnızca bu dosyayı ve docs/INVARIANTS.md'yi yazar).
--
-- Kapsam: fresh seed'de 0 ihlal (seed'in tek recall'ı 'simulation'da kalır, `initiate()` hiç
-- çağrılmaz — I59 ile aynı dormant durum) — ama `/kalite/geri-cagirma`'dan "Başlat"a basan bir
-- kullanıcı, zincirindeki ≥2 lotu FEFO'nun AYNI irsaliyeye düşürdüğü İLK recall'da bu ihlali üretir.
--
-- Kök neden dosyası: `packages/core/src/lots/trace.ts` — `class Graph`, metod `add()` (node
-- dedup'i yalnızca `depth`'i günceller, diğer tüm alanları — özellikle `lotId`/`qty` — İLK eklenenle
-- donduruyor) + `simulateRecall`'daki `dels` Map'inin yalnızca düğümleri okuyup kenarları hiç
-- okumaması.
-- Düzeltme önerisi: (a) en doğrudan — `Graph`'a delivery-kind düğümler için bir "merge" yolu ekle:
-- aynı `id` ile `add()` tekrar çağrıldığında (yalnızca `kind==='delivery'` iken) `qty`'yi TOPLA ve
-- BİRDEN FAZLA lot varsa `lotId` yerine bir `lotIds: string[]` dizisi tut; (b) `initiate()`'in
-- `impact.deliveries` döngüsünü `lotIds` üzerinde ikinci bir iç döngüyle her lot için AYRI bir
-- `recall_items` satırı (kendi gerçek `qtyDelivered` payıyla) yazacak şekilde güncelle — bu,
-- `recall_items`'ın bugünkü "irsaliye başına tek satır" tasarımından "irsaliye+lot başına tek satır"
-- tasarımına geçişi gerektirir (şema zaten `deliveryId`+`lotId` ikilisini taşıyabiliyor, ek kolon
-- gerekmiyor — yalnızca `initiate()`'in insert döngüsü değişmeli).

WITH member_lots AS (
  -- Recall'ün zincirine dahil (bloklanan) her lot — bu CTE, delivery-node dedup hatasından ETKİLENMEZ
  -- (lot node'ları `nodeId('lot', lotId)` ile tekildir, delivery node'ları gibi çakışmaz).
  SELECT DISTINCT ri.recall_id, ri.lot_id
  FROM recall_items ri
  WHERE ri.hop <> 'delivered'
),
actually_shipped AS (
  -- Zincir üyesi bir lotun GERÇEKTEN sevk edildiği (delivery_lines + gerçekleşmiş stock_moves ile
  -- doğrulanmış) her (recall, delivery, lot) üçlüsü — yer-gerçeği.
  SELECT DISTINCT ml.recall_id, dl.delivery_id, dl.lot_id
  FROM member_lots ml
  JOIN delivery_lines dl ON dl.lot_id = ml.lot_id
  JOIN stock_moves sm
    ON sm.ref_type = 'delivery' AND sm.ref_id = dl.delivery_id AND sm.lot_id = dl.lot_id AND sm.kind = 'delivery'
)
SELECT
  'I60' AS rule, 'recall_delivered_item_missing' AS entity,
  (s.recall_id::text || '/' || s.delivery_id::text || '/' || s.lot_id::text) AS id,
  1::numeric(18, 4) AS expected,
  0::numeric(18, 4) AS actual,
  1::numeric(18, 4) AS diff
FROM actually_shipped s
WHERE NOT EXISTS (
  SELECT 1 FROM recall_items ri2
  WHERE ri2.recall_id = s.recall_id AND ri2.hop = 'delivered' AND ri2.delivery_id = s.delivery_id AND ri2.lot_id = s.lot_id
)
ORDER BY id;
