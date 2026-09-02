-- I15 — 151.01 Üretimde (WIP) bakiyesi
-- 151.01 hesap bakiyesi (VUK ve UFRS ayrı ayrı)
--   = Σ açık iş emri [ material_cost − Σ (output.value − output move.overhead_value) − Σ scrap.value ]
-- Açık iş emri: status IN ('released','in_progress','paused','finished') — henüz kapatılmamış.
-- Çıktı değeri genel gider payını (731) içerir; 151.01'den yalnızca malzeme payı düşer, bu yüzden
-- stock_moves.overhead_value çıkarılır (postStockMove production hareketinde yazar).
-- Fire (work_order_scraps.value) WIP'ten düşer: 659 / 151.01 (üretim lokasyonundan fire).
-- Kapalı iş emirleri 151.01'e net sıfır bırakır (üretim modülü kapanışta kalan WIP'i sıfırlar); I15 bunları toplama katmaz.

WITH open_wo AS (
  SELECT
    wo.id,
    wo.material_cost,
    COALESCE((
      SELECT SUM(o.value - COALESCE(sm.overhead_value, 0))
      FROM work_order_outputs o
      LEFT JOIN stock_moves sm ON sm.id = o.stock_move_id
      WHERE o.work_order_id = wo.id
    ), 0) AS output_material_value,
    COALESCE((SELECT SUM(s.value) FROM work_order_scraps s WHERE s.work_order_id = wo.id), 0) AS scrap_value
  FROM work_orders wo
  WHERE wo.status IN ('released', 'in_progress', 'paused', 'finished')
),
wip_total AS (
  SELECT COALESCE(SUM(material_cost - output_material_value - scrap_value), 0) AS wip FROM open_wo
),
ledgers AS (
  SELECT unnest(ARRAY['VUK', 'UFRS']) AS ledger
),
ledger_wip AS (
  SELECT
    l.ledger,
    COALESCE((
      SELECT SUM(jl.debit - jl.credit)
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.entry_id
      WHERE (jl.account_code = '151.01' OR jl.account_code LIKE '151.01.%')
        AND jl.ledger::text = l.ledger
        AND je.status IN ('posted', 'reversed')
    ), 0) AS bal
  FROM ledgers l
)

SELECT
  'I15' AS rule, ('wip_' || l.ledger) AS entity, l.ledger AS id,
  w.wip::numeric(18, 4) AS expected,
  l.bal::numeric(18, 4) AS actual,
  (l.bal - w.wip)::numeric(18, 4) AS diff
FROM ledger_wip l
CROSS JOIN wip_total w
WHERE abs(l.bal - w.wip) > 0

ORDER BY id;
