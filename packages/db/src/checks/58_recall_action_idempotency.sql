-- I58 — Geri çağırma aksiyonu idempotency: her recall_item için EN FAZLA 1 fiziksel `recall_return`
-- stok hareketi olmalı ve o hareketin miktarı item.qty_delivered'a birebir eşit olmalı.
--
-- Veri bütünlüğü turu 8 (veri-critic), YENİ kural (P0/P1, kök neden, CANLI OLARAK KANITLANDI):
-- `packages/core/src/quality/recall.ts::recordRecallAction` (`action='return'` dalı, I57'nin Tur 7
-- düzeltmesiyle eklendi) fonksiyonun EN BAŞINDA `item.actionStatus` için hiçbir idempotency/guard
-- kontrolü YOK — `destroy` dalının aksine (o, `stock_quants WHERE qty>0`'ı CANLI sorguladığı için ikinci
-- çağrıda kendiliğinden 0 satır bulup no-op olur ve KENDİ KENDİNİ KORUR), `return` dalı SABİT bir
-- STATİK değeri (`item.qtyDelivered` — initiate() anında donmuş bir sütun) her çağrıda KOŞULSUZ olarak
-- yeniden `postStockMove(kind:'recall_return', qty:item.qtyDelivered, fromLocationId:customersLoc, ...)`
-- ile işler; fonksiyonun sonunda `actionStatus:'done'` set edilmesi de girişte KONTROL EDİLMİYOR.
-- Canlı doğrulama (rollback'li transaction, `packages/core`'dan doğrudan): 25 kg sevk edilmiş bir lot
-- üzerinde recall simüle edilip başlatıldı, aynı recall_item için `recordRecallAction(...,'return',...)`
-- ARKA ARKAYA İKİ KEZ çağrıldı (ikisi de `actionStatus:'done'` ile BAŞARILI döndü — hiçbir hata/guard
-- yok) → `stock_moves`'da AYNI `refType='recall_item'`/`refId=<item.id>` için `kind='recall_return'`
-- olan **2 AYRI satır**, her biri 25,0000 kg (toplam 50,0000 kg) oluştu — fiziksel olarak yalnızca 25 kg
-- müşteriden geri geldiği halde sistem karantina lokasyonuna 50 kg (25 kg HAYALİ/PHANTOM fazladan) işledi.
-- `postStockMove` kendi içinde hem quant'ı hem 152 borç/621 alacak muhasebe fişini ATOMİK ve TUTARLI
-- ürettiğinden (I1/I2/I3 birbiriyle hep tutarlı kalır) bu sınıf bir hata I1-I57'nin HİÇBİRİ tarafından
-- yakalanamaz — stok ve muhasebe birbirleriyle mükemmel uyum İÇİNDE ama FİZİKSEL GERÇEKLİKTEN
-- bağımsız bir "hayali envanter" üretilmiş olur (I6'nın `lot_qty_exceeds_initial` kontrolü de bunu
-- YAKALAMAZ: `ret` CTE'si recall_return'ü TOPLAMDAN ÇIKARDIĞI için ikinci/fazladan iade `actual`ı
-- initial_qty'nin ÜSTÜNE değil ALTINA çeker — kontrolün kendisi yalnızca ÜSTTEKİ aşımı filtreler).
-- Bu istismar tetiklemek için UI'ı atlamak gerekmez: `recall-detail.tsx` yalnızca `actionStatus==='done'`
-- İKEN düğmeleri gizler (`router.refresh()` sonrası) — ilk isteğin yanıtı/refresh'i gelmeden (yavaş ağ,
-- çift tık, sekme kopyalama, ya da server action'a doğrudan ikinci bir istek) YENİDEN gönderilen bir
-- `recordRecallActionAction({itemId, action:'return'})` çağrısı bu hatayı canlıda üretir.
-- Kök neden dosyası: `packages/core/src/quality/recall.ts::recordRecallAction` — fonksiyon başında
-- `if (item.actionStatus === 'done') throw new DomainError('RECALL_ITEM_ALREADY_ACTIONED', ...)` gibi
-- bir idempotency guard yok (kayıt satırı `.for('update')` ile kilitleniyor ama bu yalnızca eşzamanlı
-- iki isteği SERİLEŞTİRİR, İKİNCİ sıradaki isteği REDDETMEZ).
-- Düzeltme önerisi: `recordRecallAction`'ın en başına (item/recall satırları okunduktan hemen sonra)
-- `if (item.actionStatus === 'done') throw new DomainError('RECALL_ITEM_ALREADY_ACTIONED', `${item.id} için aksiyon zaten kaydedilmiş (${item.action})`, {itemId: item.id});` eklenmeli — `destroy` dalı
-- zaten kendiliğinden idempotent olduğundan davranışı bozmaz, `return` dalını da güvenli hale getirir.

WITH per_item AS (
  SELECT sm.ref_id AS item_id, COUNT(*) AS move_count, SUM(sm.qty) AS moved_qty
  FROM stock_moves sm
  WHERE sm.kind = 'recall_return' AND sm.ref_type = 'recall_item'
  GROUP BY sm.ref_id
)
SELECT
  'I58' AS rule, 'recall_return_duplicate_move' AS entity, ri.id::text AS id,
  1::numeric(18, 4) AS expected,
  pi.move_count::numeric(18, 4) AS actual,
  (pi.move_count - 1)::numeric(18, 4) AS diff
FROM recall_items ri
JOIN per_item pi ON pi.item_id = ri.id
WHERE pi.move_count > 1

UNION ALL

SELECT
  'I58', 'recall_return_qty_mismatch', ri.id::text,
  ri.qty_delivered::numeric(18, 4) AS expected,
  COALESCE(pi.moved_qty, 0)::numeric(18, 4) AS actual,
  (COALESCE(pi.moved_qty, 0) - ri.qty_delivered)::numeric(18, 4) AS diff
FROM recall_items ri
LEFT JOIN per_item pi ON pi.item_id = ri.id
WHERE ri.action = 'return' AND ri.action_status = 'done'
  AND abs(COALESCE(pi.moved_qty, 0) - ri.qty_delivered) > 0

ORDER BY id;
