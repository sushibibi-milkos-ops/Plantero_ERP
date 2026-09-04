-- I37 — Stok/üretim kaynaklı yevmiye fişleri asla `reverseJournalEntry` ("Ters kayıt") ile
-- tek başına iptal edilemez: bu fonksiyon YALNIZCA journal_entries/journal_lines'a yeni bir
-- ters satır ekler (packages/core/src/accounting/journal.ts::reverseJournalEntry) — karşılık
-- gelen stock_moves/stock_quants/work_orders/receipts/deliveries/transfers/scraps/stock_counts
-- kaydına HİÇ dokunmaz. Dolayısıyla refType bu fiziksel-stok kümesinden olan bir fiş
-- ters kayıtla 'reversed' yapılırsa, muhasebe tarafı (150/151/152/153, 320.999 GRNI) geri
-- dönerken stok tarafı (miktar, quant, WIP) OLDUĞU GİBİ kalır — I1/I25/I14/I15'i doğrudan
-- kırar. I3'ün mevcut sorgusu bunu YAKALAMAZ: `je.status IN ('posted','reversed')` koşulu
-- reversed durumunu da geçerli kabul ediyor, yalnızca fişin var olup olmadığını kontrol
-- ediyor — "reversed" bir stok fişinin gerçekten stok tarafında da geri alınıp alınmadığını
-- hiç sormuyor.
--
-- Canlı egzersizle kanıtlandı (bu tur): fresh seed sonrası, refType='stock_move' olan posted
-- bir VUK/UFRS ikiz fiş çifti (bir mal kabul hareketine ait, SM-2026-000161) doğrudan
-- `reverseJournalEntry(tx, entryId, ctx)` ile ters kayıt edildi (tam olarak
-- `apps/web/src/app/(app)/muhasebe/yevmiye/[id]/page.tsx`'teki "Ters kayıt" düğmesinin
-- (`ReverseJournalButton` → `reverseJournalEntryAction`, izin: `accounting.post`, "Muhasebe"
-- rolü dahil) yaptığı çağrı) → `pnpm db:check` anında I1 (150 hesabı, VUK+UFRS ikisinde de
-- -25.200,00 TL fark) VE I25 (320.999 GRNI bakiyesi, VUK+UFRS ikisinde de -25.200,00 TL fark)
-- ile KIRMIZIYA düştü — I3 ise 0 ihlal göstermeye devam etti (blind spot doğrulandı). Test
-- verisi (ters kayıt fişleri) silinip orijinal fiş 'posted'e geri alındıktan sonra tüm
-- kurallar yeniden 0 ihlale döndü.
--
-- Kök neden: `packages/core/src/accounting/journal.ts::reverseJournalEntry` `entry.refType`'i
-- HİÇ kontrol etmiyor — herhangi bir posted fişi (kaynağı ne olursa olsun) koşulsuz ters
-- çevirir. `apps/web/src/app/(app)/muhasebe/yevmiye/[id]/page.tsx` da düğmeyi yalnızca
-- `entry.status === 'posted'` şartına bağlıyor, `entry.refType`'e bakmıyor.
--
-- Düzeltme önerisi: `reverseJournalEntry` başına bir guard ekle — hedef fişin (veya twin'inin)
-- `refType` alanı ['stock_move','receipt','delivery','transfer','scrap','stock_count',
-- 'work_order','quality_check'] kümesindeyse `DomainError('JOURNAL_REVERSAL_BLOCKED', ...)`
-- fırlatsın ("bu fiş bir stok hareketinden otomatik üretildi; düzeltme için stok tarafında
-- ilgili iade/iptal akışını kullanın — postStockMove zaten kendi ters hareketini + eşlik eden
-- fişi üretir"). Aynı kısıtı `reverse-journal-button.tsx`'te de UI seviyesinde uygula (düğmeyi
-- bu refType'lar için gizle/disable et) — sunucu tarafı guard birincil, UI ikincil savunma.

SELECT
  'I37' AS rule, 'stock_linked_journal_reversed' AS entity, je.id::text AS id,
  0::numeric(18, 4) AS expected, 1::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM journal_entries je
WHERE je.status = 'reversed'
  AND je.ref_type IN ('stock_move', 'receipt', 'delivery', 'transfer', 'scrap', 'stock_count', 'work_order', 'quality_check')

ORDER BY id;
