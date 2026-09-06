-- I47 — Üretim kökenli lot miktar dengesi (docs/modules/kalite.md "/kalite/izlenebilirlik" vaadi:
--   "miktar dengesi (giriş = tüketim + sevk + fire + eldeki)").
--   Kök neden (Tur 8, veri-critic — I6'nın KENDİ kör noktası, CANLI OLARAK KANITLANDI): I6'nın
--   `lot_qty_exceeds_initial` alt kuralı (checks/06_lot_forward.sql) bu dengeyi `stock_moves`'tan değil,
--   `scraps`/`work_order_scraps` denormalize ara tablolarından kontrol ediyor. Ama
--   `packages/core/src/production/finish.ts::recordScrap()` `work_order_scraps` satırına HİÇBİR ZAMAN
--   `lot_id` yazmıyor (şemada nullable kolon var, servis doldurmuyor) — canlı doğrulama: fresh seed'deki
--   PL-260816-H1-01 (id 2d570b21-…) ve PL-260823-H2-01 (id 974f57d1-…) mamul lotlarının HER İKİSİ de
--   üretim sırasında WIP fire kaydetti (`work_order_scraps.qty` 0,6000 / 0,5000) ama ikisinde de
--   `work_order_scraps.lot_id IS NULL` — I6'nın `ws` LEFT JOIN'i bu iki lot için SESSİZCE 0 döner ve
--   kural gerçek fiziksel dengeyi hiç egzersiz etmeden yeşile düşer (`pnpm db:check` bu iki lot için
--   "0 ihlal" basar ama bu, dengenin doğrulanmış olmasından değil, kontrolün YANLIŞ tabloya bakmasından
--   kaynaklanır — bkz. bu turun raporu, canlı egzersiz: `work_order_scraps.lot_id` elle doldurulduğunda
--   I6 formülü WIP fireyi fiziksel çıkışmış gibi sayıp YANLIŞ pozitif üretirdi, çünkü o hareket zaten
--   sanaldan sanala olduğundan hiçbir zaman `initial_qty`'ye girmedi — bkz. altta).
--
--   Bu kural aynı dengeyi TEK kanonik kaynaktan (`stock_moves` + `stock_quants`, hiçbir denormalize ara
--   tabloya dokunmadan) yeniden kurar, yalnızca ÜRETİM KÖKENLİ lotlar için (`stock_lots.origin_work_order_id
--   IS NOT NULL` — hammadde/mal-kabul kökenli lotların dengesi zaten I6(c)'nin kendi receipt-kökenli
--   akışında kapsanıyor, o akış work_order_scraps'e hiç girmediğinden etkilenmiyor):
--
--     Σ giriş (production/byproduct/count_gain/return_in/recall_return)
--       = Σ çıkış (consumption/delivery/count_loss/return_out)
--       + Σ fire (yalnızca kaynağı GERÇEK/stoklu bir lokasyon — usage IN internal/quarantine/rejected/transit)
--       + eldeki (stock_quants)
--
--   `recordScrap()`'ın ürettiği WIP firesi (kaynak `production` — SANAL, ledger.ts VIRTUAL_USAGES,
--   `enforceDirection` bunu `direction:'wip'` işaretler) BİLEREK dışarıda bırakılır: bu hareket hiçbir
--   zaman `stock_quants`'a dokunmaz (yalnızca 659/151.01 maliyet fişi amaçlıdır) — fiziksel denklemde
--   sayılırsa (apps/web/src/modules/quality/queries.ts::getTraceForLot'un tur 8'de düzelttiği hatanın
--   birebir SQL karşılığı) her WIP fire kaydı denklemi kendi miktarı kadar sahte biçimde kaydırır.
--   Transfer/quarantine_release/quarantine_reject dahil edilmez: ikisi de fiziksel→fiziksel (STOCKED_USAGES
--   içinde) olduğundan toplam eldeki miktarı değiştirmez, yalnızca yeniden konumlandırır.

WITH moves AS (
  SELECT sm.lot_id, sm.kind, sm.qty, fl.usage AS from_usage
  FROM stock_moves sm
  JOIN locations fl ON fl.id = sm.from_location_id
  WHERE sm.lot_id IS NOT NULL
),
inflow AS (
  SELECT lot_id, SUM(qty) AS qty
  FROM moves
  WHERE kind IN ('production', 'byproduct', 'count_gain', 'return_in', 'recall_return')
  GROUP BY lot_id
),
outflow AS (
  SELECT lot_id, SUM(qty) AS qty
  FROM moves
  WHERE kind IN ('consumption', 'delivery', 'count_loss', 'return_out')
     OR (kind = 'scrap' AND from_usage IN ('internal', 'quarantine', 'rejected', 'transit'))
  GROUP BY lot_id
),
onhand AS (
  SELECT lot_id, SUM(qty) AS qty FROM stock_quants WHERE lot_id IS NOT NULL GROUP BY lot_id
)

SELECT
  'I47' AS rule, 'production_lot_qty_balance_mismatch' AS entity, l.id::text AS id,
  COALESCE(i.qty, 0)::numeric(18, 4) AS expected,
  (COALESCE(o.qty, 0) + COALESCE(oh.qty, 0))::numeric(18, 4) AS actual,
  ((COALESCE(o.qty, 0) + COALESCE(oh.qty, 0)) - COALESCE(i.qty, 0))::numeric(18, 4) AS diff
FROM stock_lots l
LEFT JOIN inflow i ON i.lot_id = l.id
LEFT JOIN outflow o ON o.lot_id = l.id
LEFT JOIN onhand oh ON oh.lot_id = l.id
WHERE l.origin_work_order_id IS NOT NULL
  AND (COALESCE(o.qty, 0) + COALESCE(oh.qty, 0) - COALESCE(i.qty, 0)) <> 0

ORDER BY id;
