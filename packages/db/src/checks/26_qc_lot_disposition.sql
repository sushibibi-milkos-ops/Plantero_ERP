-- I26 — Girdi kalite kontrolü (qc_checks) kararı ile lotun mevcut durumu birebir tutarlı olmalı.
-- (P2 düzeltmesi b0ff4e5: releaseLotAction/rejectLotAction artık bağlı 'pending' qc_checks kaydını
-- da aynı transaction'da karara bağlıyor — bu kontrol o davranışı kalıcı olarak kilitler.)
--
-- Kural:
--   1) lot.status ∈ ('released','rejected') iken, o lota bağlı HİÇBİR qc_checks kaydı 'pending'
--      kalamaz (asılı kalan karar = ya lot kararı QC'den bağımsız verilmiş ya da eski regresyon).
--   2) lot.status ∈ ('released','rejected') iken, o lota bağlı KARARI VERİLMİŞ (result <> 'pending')
--      en az bir qc_checks varsa, qc_checks.disposition lot.status ile birebir eşleşmeli
--      (örn. lot 'released' ama ilişkili qc kaydı 'rejected' olarak işaretlenmiş olamaz).

SELECT
  'I26' AS rule, 'qc_pending_after_lot_decision' AS entity, qc.id::text AS id,
  0::numeric(18, 4) AS expected, 1::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM qc_checks qc
JOIN stock_lots l ON l.id = qc.lot_id
WHERE l.status::text IN ('released', 'rejected')
  AND qc.result = 'pending'

UNION ALL

SELECT
  'I26', 'qc_disposition_lot_status_mismatch', qc.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM qc_checks qc
JOIN stock_lots l ON l.id = qc.lot_id
WHERE l.status::text IN ('released', 'rejected')
  AND qc.result <> 'pending'
  AND qc.disposition IS DISTINCT FROM l.status::text

ORDER BY id;
