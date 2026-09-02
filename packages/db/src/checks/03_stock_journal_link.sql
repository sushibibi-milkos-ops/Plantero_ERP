-- I3 — Her değerli stok hareketinin VUK ve UFRS fişi var; her stok fişinin move'u var.
-- postStockMove (packages/core/src/stock/ledger.ts): isValued hareket → postJournalEntry(ledger:'both',
--   refType:'stock_move', refId:moveId) çağırır; stock_moves.journal_entry_id = VUK fiş id'si.
-- Değersiz türler (transfer, quarantine_release, quarantine_reject) hiç fiş almaz.

SELECT
  'I3' AS rule, 'valued_move_missing_journal' AS entity, sm.id::text AS id,
  1::numeric(18, 4) AS expected, 0::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM stock_moves sm
WHERE sm.is_valued = true AND sm.journal_entry_id IS NULL

UNION ALL

-- journal_entry_id VUK, posted/reversed ve stock_move'a refType/refId ile bağlı bir fişe işaret etmeli
SELECT
  'I3', 'valued_move_journal_mismatch', sm.id::text,
  1::numeric(18, 4), 0::numeric(18, 4), 1::numeric(18, 4)
FROM stock_moves sm
LEFT JOIN journal_entries je
  ON je.id = sm.journal_entry_id
  AND je.ledger = 'VUK'
  AND je.ref_type = 'stock_move'
  AND je.ref_id = sm.id
  AND je.status IN ('posted', 'reversed')
WHERE sm.is_valued = true AND sm.journal_entry_id IS NOT NULL AND je.id IS NULL

UNION ALL

-- VUK fişinin bir UFRS ikizi olmalı (çift defter kuralı)
SELECT
  'I3', 'valued_move_missing_ufrs_twin', sm.id::text,
  1::numeric(18, 4), 0::numeric(18, 4), 1::numeric(18, 4)
FROM stock_moves sm
JOIN journal_entries vuk ON vuk.id = sm.journal_entry_id
LEFT JOIN journal_entries ufrs ON ufrs.id = vuk.twin_entry_id AND ufrs.ledger = 'UFRS'
WHERE sm.is_valued = true AND sm.journal_entry_id IS NOT NULL AND ufrs.id IS NULL

UNION ALL

-- refType='stock_move' olan bir fiş varsa karşılık gelen move de var olmalı
SELECT
  'I3', 'journal_entry_orphan_move_ref', je.id::text,
  1::numeric(18, 4), 0::numeric(18, 4), 1::numeric(18, 4)
FROM journal_entries je
LEFT JOIN stock_moves sm ON sm.id = je.ref_id
WHERE je.ref_type = 'stock_move' AND sm.id IS NULL

UNION ALL

-- Değersiz hareket türleri (transfer, quarantine_release, quarantine_reject) hiçbir fişe bağlı olmamalı
SELECT
  'I3', 'unvalued_kind_has_journal', sm.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM stock_moves sm
WHERE sm.kind IN ('transfer', 'quarantine_release', 'quarantine_reject') AND sm.journal_entry_id IS NOT NULL

ORDER BY id;
