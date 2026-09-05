-- I16 — Karantina/red lotu müşteri veya üretim lokasyonuna hareket etmemiş
-- (packages/core/src/stock/ledger.ts → enforceLotRules zaten bunu engeller; bu kontrol veri bütünlüğünü
-- ikinci kez, hareket + zincir tablolarından bağımsız olarak doğrular.)
--
-- KAPSAM DÜZELTMESİ (canlı doğrulama — RC-2026-000001 initiate() sonrası): 'recalled' ve 'expired'
-- BİLİNÇLİ OLARAK bu listeden ÇIKARILDI. Bu ikisi lot zaten meşru şekilde 'released' iken sevk/tüketim
-- geçmişi oluştuktan SONRA geriye dönük atanan terminal durumlardır (recall'ün amacı tam olarak zaten
-- sevk edilmiş bir lotu hedeflemektir — packages/core/src/quality/recall.ts initiate()). Bu statüleri
-- burada `IN (...)` listesinde tutmak recall/SKT sonrası HER ZAMAN yanlış-pozitif üretir: initiate()
-- çağrıldığı anda o lota ait TÜM geçmiş delivery/consumption stock_moves + work_order_consumptions
-- satırları (lotun o hareketler sırasında 'released' olmasına rağmen) kırmızıya döner. 'rejected' ve
-- 'quarantine' ise giriş-zamanlı statülerdir — bir lotun HİÇBİR ZAMAN meşru "released" penceresi
-- olmadan bu durumdayken sevk/tüketilmiş olması her zaman gerçek bir ihlaldir, bu yüzden tam kapsamda
-- kalıyor. Recalled/expired lotun MEVCUT fiziksel konumu I27 ile, recall SONRASI oluşan YENİ (meşru
-- olmayan) hareketler ise I40 (moved_at > lot.updated_at zaman damgası) ile ayrıca kapsanır.

SELECT
  'I16' AS rule, 'stock_move_bad_lot_status' AS entity, sm.id::text AS id,
  0::numeric(18, 4) AS expected, 1::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM stock_moves sm
JOIN stock_lots l ON l.id = sm.lot_id
WHERE sm.kind IN ('delivery', 'consumption')
  AND l.status IN ('rejected', 'quarantine')

UNION ALL

SELECT
  'I16', 'delivery_line_bad_lot_status', dl.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM delivery_lines dl
JOIN stock_lots l ON l.id = dl.lot_id
WHERE l.status IN ('rejected', 'quarantine')

UNION ALL

SELECT
  'I16', 'wo_consumption_bad_lot_status', wc.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM work_order_consumptions wc
JOIN stock_lots l ON l.id = wc.lot_id
WHERE l.status IN ('rejected', 'quarantine')

ORDER BY id;
