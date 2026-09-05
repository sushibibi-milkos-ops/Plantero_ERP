-- I40 — Geri çağırma/SKT SONRASI YENİ (meşru olmayan) sevkiyat/tüketim hareketi yasağı (zaman-duyarlı).
--
-- I6/I16 (kural 2 — CLAUDE.md: "Karantina/red lotu sevk edilemez ve üretime giremez") yalnızca
-- 'quarantine'/'rejected' için TÜM geçmişi kapsar, çünkü bu ikisi giriş-zamanlı statülerdir (lot hiçbir
-- zaman meşru "released" penceresi görmemiştir). 'recalled'/'expired' ise TERSİNE, lot zaten meşru
-- şekilde 'released' iken oluşmuş geçmiş sevk/tüketim kayıtlarının ÜZERİNE geriye dönük atanan terminal
-- durumlardır (recall'ün tüm amacı zaten sevk edilmiş bir lotu hedeflemektir — bkz.
-- packages/core/src/quality/recall.ts initiate()); bu yüzden I6/I16 bilinçli olarak bu geçmişi
-- kapsam dışı bırakır (aksi halde HER recall/SKT anında sahte-pozitif verirler — canlı doğrulandı).
--
-- Ama bu, recall/SKT SONRASINDA o lot için YENİ bir sevkiyat/tüketim oluşmasının kabul edilebilir
-- olduğu anlamına GELMEZ — enforceLotRules (packages/core/src/stock/ledger.ts, BAD_LOT_STATUSES)
-- bunu üretim anında zaten engeller; bu kural onu veriden bağımsız, ikinci kez doğrular: lot.status
-- 'recalled'/'expired' iken, lotun bu duruma geçtiği andan (stock_lots.updated_at — yalnızca bu iki
-- statüye geçişte set edilir: recall.ts initiate() / stock/expiry.ts scrapExpired()) SONRA hareket
-- eden (moved_at > updated_at) HERHANGİ bir delivery/consumption stock_moves kaydı = enforceLotRules
-- bypass edilmiş demektir (örn. eski/backdated bir işlem, doğrudan SQL, ya da bir regresyon).

SELECT
  'I40' AS rule, 'movement_after_lot_blocked' AS entity, sm.id::text AS id,
  EXTRACT(EPOCH FROM l.updated_at)::numeric(18, 4) AS expected,
  EXTRACT(EPOCH FROM sm.moved_at)::numeric(18, 4) AS actual,
  EXTRACT(EPOCH FROM (sm.moved_at - l.updated_at))::numeric(18, 4) AS diff
FROM stock_moves sm
JOIN stock_lots l ON l.id = sm.lot_id
WHERE sm.kind IN ('delivery', 'consumption')
  AND l.status IN ('recalled', 'expired')
  AND sm.moved_at > l.updated_at

ORDER BY id;
