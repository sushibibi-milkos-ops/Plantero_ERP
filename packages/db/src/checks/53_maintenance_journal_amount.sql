-- I53 — Bakım iş emri maliyeti = bağlı yevmiye fişi tutarı (VUK ve UFRS ayrı ayrı).
-- I51 (`51_maintenance_cost_not_posted.sql`) yalnızca "kapanmış bir iş emrinin bağlı bir fişi VAR mı"
-- sorusunu soruyordu — I39'un stock_moves için yaptığı "TUTAR eşleşiyor mu" ikinci adımının bakım
-- tarafındaki eşleniği hiç yazılmamıştı. `completeOrder` (packages/core/src/maintenance/orders.ts)
-- tamamlanma ANINDAKİ (partsCost+laborCost) toplamını 730/100 fişine postalıyor — ama aynı dosyadaki
-- `updateDiagnosis` fonksiyonu `maintenance_orders.status`'a HİÇ bakmıyor: 'done' bir sipariş üzerinde
-- de partsCost/laborCost'u serbestçe değiştirebiliyor. Fiş bir daha asla güncellenmediği için, tamamlanma
-- sonrası bir maliyet düzeltmesi (elle veya `updateDiagnosisAction` üzerinden) muhasebeyi kalıcı olarak
-- BAYATLATIR — I51 bunu yakalamaz çünkü "bir fiş var mı" sorusu hâlâ EVET döner.
--
-- Canlı doğrulama (veri-critic, bu tur, rollback'li transaction, packages/core'dan doğrudan):
-- fresh seed'deki `MO-2026-000001` (`status='done'`, parts_cost=180,00 + labor_cost=450,00 = 630,00 TL,
-- iki deftere de 730 borç / 100 alacak 630,00 TL fişi zaten posted) üzerinde `updateDiagnosis(tx,
-- order.id, {partsCost:'99999.0000'}, ctx)` doğrudan çağrıldı → çağrı HİÇBİR hata fırlatmadan
-- `maintenance_orders.parts_cost=99999.0000` yazdı (yeni toplam=100.449,00 TL) → aynı transaction'da
-- eski I51 SQL'i 0 ihlal vermeye devam etti (fiş hâlâ "var") ama gerçek fiş tutarı hâlâ 630,00 TL —
-- 99.819,00 TL'lik bir fark muhasebeye hiç yansımadı. Bu SQL (I53) AYNI mutasyonda anında 2 ihlal
-- verdi (VUK+UFRS, diff=99.819,0000) → test verisi rollback ile hiç kalıcı yazılmadı.
--
-- Kök neden dosyası: packages/core/src/maintenance/orders.ts::updateDiagnosis — `completeOrder`'daki
-- gibi bir `if (order.status === 'done') throw` guard'ı yok; ayrıca 'done' bir siparişte maliyet
-- gerçekten düzeltilmesi gerekiyorsa (ör. faturası geç gelen bir yedek parça) bunun için `postJournalEntry`
-- ile bir DÜZELTME fişi (fark kadar, orijinal fişi ters çevirmeden ek 730/100 farkı) üretecek ayrı bir
-- yol yok.
-- Düzeltme önerisi: (a) `updateDiagnosis` içine `if (order.status === 'done' || order.status ===
-- 'cancelled') throw new DomainError('MO_ALREADY_CLOSED', ...)` ekle (tanı/maliyet yalnızca açık
-- iş emrinde düzenlenebilir — CLAUDE.md kural 1/5 ile tutarlı); (b) kapanmış bir siparişte GERÇEKTEN
-- maliyet düzeltmesi gereken senaryolar için `completeOrder`'ın örüntüsünü izleyen ayrı bir
-- `adjustClosedOrderCost(tx, orderId, delta, ctx)` yaz — hem `maintenance_orders`'ı güncellesin hem
-- aynı transaction'da farkı (`delta`) ayrı bir 730/100 (veya 320, tedarikçi faturası geldiyse) fişiyle
-- postalasın, `refType='maintenance_order'` aynı `refId` ile kalsın.
--
-- Kapsam: status='done' olan ve en az bir posted/reversed `ref_type='maintenance_order'` fişi olan her
-- maintenance_orders satırı için, o fişin (ve VUK ise UFRS ikizinin) `total_debit` = `total_credit` =
-- (parts_cost+labor_cost) olmalı. I51 zaten "hiç fiş yok" durumunu kapsıyor; burada yalnızca "fiş var
-- ama tutar tutmuyor" durumuna bakılıyor (birbirini dışlayan iki kural, ikisi de gerekli).

WITH vuk AS (
  SELECT mo.id AS mo_id, (mo.parts_cost + mo.labor_cost)::numeric(18, 4) AS expected_total, je.id AS je_id, je.total_debit, je.total_credit, je.twin_entry_id
  FROM maintenance_orders mo
  JOIN journal_entries je ON je.ref_type = 'maintenance_order' AND je.ref_id = mo.id AND je.ledger = 'VUK' AND je.status IN ('posted', 'reversed')
  WHERE mo.status = 'done'
),
vuk_mismatch AS (
  SELECT
    'I53' AS rule, 'maintenance_order_vuk_journal_amount' AS entity, v.mo_id::text AS id,
    v.expected_total AS expected, v.total_debit::numeric(18, 4) AS actual,
    (v.total_debit - v.expected_total)::numeric(18, 4) AS diff
  FROM vuk v
  WHERE abs(v.total_debit - v.expected_total) > 0 OR abs(v.total_credit - v.expected_total) > 0
),
ufrs_mismatch AS (
  SELECT
    'I53' AS rule, 'maintenance_order_ufrs_journal_amount' AS entity, v.mo_id::text AS id,
    v.expected_total AS expected, ufrs.total_debit::numeric(18, 4) AS actual,
    (ufrs.total_debit - v.expected_total)::numeric(18, 4) AS diff
  FROM vuk v
  JOIN journal_entries ufrs ON ufrs.id = v.twin_entry_id AND ufrs.ledger = 'UFRS'
  WHERE abs(ufrs.total_debit - v.expected_total) > 0 OR abs(ufrs.total_credit - v.expected_total) > 0
)

SELECT * FROM vuk_mismatch
UNION ALL
SELECT * FROM ufrs_mismatch
ORDER BY id;
