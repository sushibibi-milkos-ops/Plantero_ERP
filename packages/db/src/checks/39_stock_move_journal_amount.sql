-- I39 — Değerli stok hareketi tutarı = bağlı yevmiye fişi tutarı (VUK ve UFRS ayrı ayrı).
-- I3 yalnızca "bir fiş VAR mı ve doğru move'a mı bağlı" sorusunu, I4 yalnızca "fiş içinde borç=alacak mı"
-- sorusunu doğruluyor — HİÇBİRİ fişin TUTARININ stock_moves.value ile eşit olduğunu doğrulamıyor.
-- Dengeli ama YANLIŞ tutarlı bir fiş (ör. moveAccountLines çift tarafın da aynı hatalı tutarla
-- postalanması, ör. average_cost yerine yanlış maliyet taşıyıcısı kullanılması) I3+I4'ü geçer ama
-- gerçek parayı yanlış taşır. postJournalEntry (packages/core/src/accounting/journal.ts) her hareket
-- için debit toplamı = credit toplamı = hareketin parasal değeri olacak şekilde tek bir tutar postalar
-- (moveAccountLines 'total' paylaşımlı çiftlerde tek tutar; 'production' üç satırlı olsa da INV borcu
-- tek başına move.value'ya eşittir — WIP/731 payları yalnızca alacak tarafını böler, borç tarafı tektir).
-- Bu yüzden je.total_debit = je.total_credit = sm.value HER ZAMAN geçerli olmalıdır (production dahil,
-- çünkü total_debit=total_credit zaten I4 ile garanti; burada onu sm.value'ya sabitliyoruz).

WITH vuk_mismatch AS (
  SELECT
    'I39' AS rule, 'stock_move_vuk_journal_amount' AS entity, sm.id::text AS id,
    sm.value::numeric(18, 4) AS expected,
    je.total_debit::numeric(18, 4) AS actual,
    (je.total_debit - sm.value)::numeric(18, 4) AS diff
  FROM stock_moves sm
  JOIN journal_entries je ON je.id = sm.journal_entry_id
  WHERE sm.is_valued = true
    AND je.status IN ('posted', 'reversed')
    AND (abs(je.total_debit - sm.value) > 0 OR abs(je.total_credit - sm.value) > 0)
),
ufrs_mismatch AS (
  SELECT
    'I39' AS rule, 'stock_move_ufrs_journal_amount' AS entity, sm.id::text AS id,
    sm.value::numeric(18, 4) AS expected,
    ufrs.total_debit::numeric(18, 4) AS actual,
    (ufrs.total_debit - sm.value)::numeric(18, 4) AS diff
  FROM stock_moves sm
  JOIN journal_entries vuk ON vuk.id = sm.journal_entry_id
  JOIN journal_entries ufrs ON ufrs.id = vuk.twin_entry_id AND ufrs.ledger = 'UFRS'
  WHERE sm.is_valued = true
    AND ufrs.status IN ('posted', 'reversed')
    AND (abs(ufrs.total_debit - sm.value) > 0 OR abs(ufrs.total_credit - sm.value) > 0)
)

SELECT * FROM vuk_mismatch
UNION ALL
SELECT * FROM ufrs_mismatch
ORDER BY id;
