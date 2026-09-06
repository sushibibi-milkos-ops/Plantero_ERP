-- I46 — Rezervasyon-sipariş bütünlüğü
--   Bir satış siparişi iptal edildiğinde (`sales_orders.status = 'cancelled'`/`'lost'`), o siparişten
--   doğan irsaliyenin (`deliveries.sales_order_id`) HÂLÂ aktif (henüz sevk edilmemiş/iptal edilmemiş:
--   'draft'/'reserved'/'picking'/'picked') kalması VE/VEYA bu irsaliyenin FEFO ile rezerve ettiği
--   fiziksel stoğun (`delivery_lines.from_location_id` dolu, `qty - picked_qty > 0`) serbest
--   bırakılmamış olması = KIRMIZI: iptal edilmiş, artık asla sevk edilmeyecek bir siparişin arkasında
--   fiziksel envanter süresiz kilitli kalır (başka hiçbir sipariş bu stoğu FEFO ile göremez/kullanamaz).
--
--   Kök neden (canlı egzersizle kanıtlandı — veri-critic Tur 8): `packages/core/src/sales/orders.ts::cancelOrder`
--   yalnızca `salesOrderLines.deliveredQty > 0 OR invoicedQty > 0` durumunda iptali engelliyor;
--   `stock/deliveries.ts::reserveFefo` ile zaten rezerve edilmiş ama henüz sevk edilmemiş ('reserved'/
--   'picking'/'picked' — deliveredQty hâlâ 0) bir irsaliyeyi HİÇ kontrol etmiyor ve iptal sırasında
--   ona dokunmuyor. `deliveries.status` şeması bir 'cancelled' değeri tanımlıyor (bkz.
--   `packages/db/src/schema/stock.ts` `deliveryStatusEnum`) ama `packages/core/src/stock/deliveries.ts`
--   içinde bu duruma geçiren HİÇBİR fonksiyon yok (`cancelDelivery` yazılmamış) — yani rezervasyonu
--   serbest bırakacak (`stock/ledger.ts::release`) hiçbir kod yolu mevcut değil. Canlı doğrulama: fresh
--   seed'deki `SO-2026-000003` (status='confirmed', irsaliyesi `DN-2026-000003` status='reserved',
--   2 satırda toplam 15+12=27 birim `stock_quants.reserved_qty` ile rezerve) üzerinde
--   `cancelOrder(tx, orderId, ctx, 'iptal')` doğrudan çağrıldı → **hatasız tamamlandı**, sipariş
--   `status='cancelled'` oldu → `DN-2026-000003` `status='reserved'`de KALDI, `sales_order_id` hâlâ
--   iptal edilen siparişi gösteriyor, `stock_quants.reserved_qty` (15,0000 ve 12,0000) HİÇ değişmedi
--   → bu SQL yazılmadan önce I1-I45'in HİÇBİRİ bunu yakalamadı (I2 yalnızca `reserved ≤ qty`'yi
--   kontrol ediyor, rezervasyonun arkasında hâlâ canlı bir belge olup olmadığını sormuyor) — test
--   verisi `pnpm db:reset` ile temizlendi.
--
--   Düzeltme önerisi: `packages/core/src/stock/deliveries.ts`'e bir `cancelDelivery(tx, deliveryId, ctx)`
--   eklenmeli — 'shipped'/'delivered' değilse tüm rezerve satırları için `stock/ledger.ts::release`
--   çağırıp `delivery.status='cancelled'` yapsın; `sales/orders.ts::cancelOrder` da `docType==='order'`
--   dalında, `deliveredQty>0`/`invoicedQty>0` kontrolünün yanına, siparişin AKTİF (henüz sevk/iptal
--   edilmemiş) irsaliyelerini bulup aynı transaction içinde `cancelDelivery` ile kapatmalı (veya böyle
--   bir irsaliye varsa da `ORDER_HAS_ACTIVITY` ile iptali engellemeli — hangisi iş kuralına uygunsa).

WITH orphan_deliveries AS (
  SELECT d.id, d.doc_no, d.status AS delivery_status, so.id AS order_id, so.doc_no AS order_doc_no, so.status AS order_status
  FROM deliveries d
  JOIN sales_orders so ON so.id = d.sales_order_id
  WHERE d.status IN ('draft', 'reserved', 'picking', 'picked')
    AND so.status IN ('cancelled', 'lost')
)
SELECT
  'I46' AS rule, 'orphan_active_delivery_on_cancelled_order' AS entity,
  (od.order_doc_no || '→' || od.doc_no || ' (sipariş=' || od.order_status || ', irsaliye=' || od.delivery_status || ')') AS id,
  0::numeric(18, 4) AS expected, 1::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM orphan_deliveries od

UNION ALL

SELECT
  'I46' AS rule, 'orphan_reserved_qty_on_cancelled_order' AS entity, dl.id::text AS id,
  0::numeric(18, 4) AS expected,
  round(dl.qty - dl.picked_qty, 4)::numeric(18, 4) AS actual,
  round(dl.qty - dl.picked_qty, 4)::numeric(18, 4) AS diff
FROM delivery_lines dl
JOIN orphan_deliveries od ON od.id = dl.delivery_id
WHERE dl.from_location_id IS NOT NULL
  AND round(dl.qty - dl.picked_qty, 4) > 0;
