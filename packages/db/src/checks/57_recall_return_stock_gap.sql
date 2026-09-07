-- I57 — Geri çağırma "iade" (return) aksiyonunun fiziksel stok girişi eksikliği — I50'nin
-- (satış iade faturası fiziksel stok girişi) geri çağırma modülündeki eşleniği, ama I50'den FARKLI
-- OLARAK bugüne kadar hiç düzeltilmemiş bir kök neden.
--
-- `packages/core/src/quality/recall.ts::recordRecallAction` dört aksiyon kabul eder: 'block',
-- 'notify', 'return', 'destroy'. `action==='destroy'` dalı gerçek bir `postStockMove(kind:'scrap', ...)`
-- üretir (imha edilen miktar fiziksel olarak scrap lokasyonuna taşınır, muhasebeye 689/152 fişi
-- otomatik düşer — `accounting/mapping.ts` üzerinden). Ama `action==='return'` dalının KENDİSİ hiç yok —
-- fonksiyon yalnızca `recall_items` satırını `{action:'return', actionStatus:'done'}` olarak
-- işaretleyip döner; ne `postStockMove` çağrısı ne de başka bir stok/muhasebe etkisi üretir.
--
-- `stock_move_kind` enum'ı ve `stock/ledger.ts::VIRTUAL_USAGE` eşlemesi (`recall_return: {direction:'in',
-- virtualUsage:['customer']}`) ile `accounting/mapping.ts` (case 'recall_return': INV borç/COGS alacak)
-- BU AKSİYON İÇİN tasarlanmış — yani veri modeli/muhasebe eşlemesi hazır, yalnızca `recordRecallAction`
-- bunu hiç çağırmıyor. Sonuç: bir operatör ekranda "müşteriden iade alındı, işlem: Tamamlandı" görür,
-- `recall_items.qty_delivered` (müşteride olduğu bilinen miktar) hâlâ eski değerinde durur, ürün asla
-- stoğa geri girmez (envanter kalıcı olarak eksik kayıtlı kalır) ve satışın COGS'u asla ters çevrilmez —
-- I27'nin Tur 1'de `initiate()` için bulduğu "actionStatus='done' yalancı güvence üretiyor" örüntüsünün
-- birebir aynısı, bu kez `recordRecallAction('return', ...)` için.
--
-- Canlı doğrulama (veri-critic, bu tur, rollback'li transaction, `packages/core`'dan doğrudan):
-- fresh seed'deki `RC-2026-000001` üzerinde `initiate()` çağrılıp 13 `recall_items` üretildi, ilk
-- kalemin lotu (`PL-260824-H2-01`) üzerinde return öncesi eldeki toplam 38 birim ölçüldü →
-- `recordRecallAction(tx, item.id, 'return', ..., ctx)` çağrıldı → `action='return'`,
-- `actionStatus='done'` yazıldı (hata YOK, başarılı görünüyor) → AYNI transaction'da eldeki toplam
-- HÂLÂ 38 birim (hiç değişmedi) ve `stock_moves` içinde `kind='recall_return'` olan TEK BİR satır
-- bile yok (0 satır) — yani sistemde "iade alındı" yazan bir kayıt, fiilen envantere hiçbir katkı
-- yapmıyor. Test verisi rollback ile hiç kalıcı yazılmadı.
--
-- Kapsam: fresh seed'de `recall_items.action='return'` hiç üretilmediğinden (seed yalnızca
-- 'simulation' durumunda bir recall açar, `initiate()`/`recordRecallAction` hiç çağrılmaz) bu kural
-- BUGÜN DORMANT kalır (I50'nin düzeltme öncesi durumuyla birebir aynı sınıf) — ama bir operatör
-- `/kalite/geri-cagirma` ekranından gerçek bir "İade alındı" aksiyonu işlediği an anında kırmızıya
-- döner; kalıcı bir regresyon güvenlik ağı olarak eklendi.
--
-- Kök neden dosyası: `packages/core/src/quality/recall.ts::recordRecallAction` — `action==='return'`
-- dalı `action==='destroy'` dalının aksine hiçbir `postStockMove` çağrısı içermiyor.
-- Düzeltme önerisi: `action==='return'` dalına, `destroy` dalının örüntüsünü izleyen bir blok ekle —
-- `item.qtyDelivered>0` iken müşteri sanal lokasyonundan (`getCustomersLocation`) uygun bir karantina/
-- kalite-tutma lokasyonuna (iade edilen ürün doğrudan satılabilir stoğa değil, önce muayeneye girmeli —
-- CLAUDE.md kural 2 ruhuyla) `postStockMove(kind:'recall_return', qty: item.qtyDelivered, refType:
-- 'recall_item', refId: item.id, refNo: recall.docNo, ...)` çağrısı; `accounting/mapping.ts` eşlemesi
-- zaten hazır olduğundan ek muhasebe kodu gerekmez.

SELECT
  'I57' AS rule, 'recall_return_action_missing_stock_move' AS entity, ri.id::text AS id,
  ri.qty_delivered::numeric(18, 4) AS expected,
  COALESCE(rm.qty, 0)::numeric(18, 4) AS actual,
  (COALESCE(rm.qty, 0) - ri.qty_delivered)::numeric(18, 4) AS diff
FROM recall_items ri
LEFT JOIN (
  SELECT ref_id, SUM(qty) AS qty
  FROM stock_moves
  WHERE kind = 'recall_return' AND ref_type = 'recall_item'
  GROUP BY ref_id
) rm ON rm.ref_id = ri.id
WHERE ri.action = 'return'
  AND ri.action_status = 'done'
  AND ri.qty_delivered > 0
  AND abs(COALESCE(rm.qty, 0) - ri.qty_delivered) > 0

ORDER BY id;
