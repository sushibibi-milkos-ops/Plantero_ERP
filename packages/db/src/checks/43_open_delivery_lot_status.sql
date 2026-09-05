-- I43 — Açık (henüz sevk edilmemiş) irsaliye satırı, engellenmiş durumdaki bir lota bağlı olamaz
--
--   I6'nın "delivery_line_lot_not_released" alt kuralı KASITLI olarak yalnızca 'quarantine'/'rejected'ı
--   kapsıyor ve 'recalled'/'expired'ı hariç tutuyor — çünkü o kural TÜM geçmiş (zaten sevk edilmiş)
--   irsaliye satırlarına bakıyor, ve recall/SKT lotun meşru şekilde 'released' iken sevk edilmiş
--   GEÇMİŞİNİ hedefler (bkz. 06_lot_forward.sql üst yorumu — bunu 'recalled'/'expired' ile kapsamak
--   geçmiş, meşru sevkiyatlarda her zaman yanlış-pozitif üretir).
--
--   Ama bu ayrım yalnızca KAPANMIŞ (shipped/delivered/cancelled) irsaliye satırları için geçerlidir.
--   HENÜZ SEVK EDİLMEMİŞ (status IN ('draft','reserved','picking','picked')) bir irsaliye satırı için
--   durum TERSİNE döner: bu satır gelecekte fiilen sevk edilecek bir SÖZ veriyor — lotu 'quarantine'/
--   'rejected' (hiç meşru "released" penceresi olmayan) VEYA 'recalled'/'expired' (releated penceresi
--   artık KAPANMIŞ) olan bir lota bağlı kalması, sistemin fiilen sevk EDEMEYECEĞİ bir stoğu hâlâ
--   "rezerve/hazırlanıyor" olarak göstermesi demektir.
--
--   CANLI OLARAK KANITLANDI (veri-critic, Aşama-3 Tur 3): fresh seed'deki RC-2026-000001 üzerinde
--   `packages/core/src/quality/recall.ts::initiate()` çağrıldığında (I27/I40'ın Tur 1 canlı egzersiziyle
--   birebir aynı olay), `initiate()` etkilenen lotların stok_quants'ını karantinaya taşıyor VE
--   `useReserved:true` ile quant.reserved_qty'yi doğru şekilde düşürüyor (Tur 2 P0 düzeltmesi — bkz.
--   ledger.ts), AMA bu rezervasyonu YARATAN `delivery_lines`/`deliveries` kaydına hiç dokunmuyor:
--   `DN-2026-000003` (status='reserved', henüz PICK edilmemiş, dl.qty=15) recall SONRASI da lot
--   `PL-260808-H1-12`'yi (artık status='recalled', karantinada) referans etmeye devam ediyor — bu
--   irsaliye artık FİİLEN sevk edilemez (enforceLotRules recalled lotu yalnızca scrap/return_out/
--   recall_return/count_loss dışına göndermeyi reddeder) ama ekranda/sorguda hâlâ "reserved" (aktif,
--   ilerleyen bir teslimat) olarak görünüyor — depo/satış ekibi bunu fark etmeden bekletebilir,
--   sales_order_line.delivered_qty asla ilerlemez, müşteri siparişi sessizce askıda kalır.
--   Kök neden dosyası: `packages/core/src/quality/recall.ts::initiate()` (ve SKT tarafında eşleniği
--   `packages/core/src/stock/expiry.ts::scrapExpired`, aynı boşluğu taşıyabilir).
--   Düzeltme önerisi: `initiate()` (ve `scrapExpired`) içinde, etkilenen her lot için status IN
--   ('draft','reserved','picking','picked') olan `delivery_lines` satırlarını da bulup ya irsaliyeyi/
--   satırı iptal edip sales_order_line'ı yeniden planlamaya (FEFO ile başka bir released lota) açacak
--   şekilde ya da en azından `deliveries.status='cancelled'` + bir bildirim/onay kalemi üreterek ele al —
--   sessizce askıda bırakma.

SELECT
  'I43' AS rule, 'open_delivery_line_blocked_lot' AS entity, dl.id::text AS id,
  0::numeric(18, 4) AS expected, 1::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM delivery_lines dl
JOIN deliveries d ON d.id = dl.delivery_id
JOIN stock_lots l ON l.id = dl.lot_id
WHERE d.status IN ('draft', 'reserved', 'picking', 'picked')
  AND l.status IN ('quarantine', 'rejected', 'recalled', 'expired')
ORDER BY id;
