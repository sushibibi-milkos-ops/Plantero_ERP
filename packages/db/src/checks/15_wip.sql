-- I15 — 151 WIP bakiyesi
-- 151 hesap bakiyesi = Σ (açık iş emri material_cost − Σ o iş emrinin output.value)
-- Açık iş emri: status IN ('released','in_progress','paused','finished') — henüz kapatılmamış.

WITH open_wo AS (
  SELECT
    wo.id,
    wo.material_cost,
    COALESCE((SELECT SUM(o.value) FROM work_order_outputs o WHERE o.work_order_id = wo.id), 0) AS output_value
  FROM work_orders wo
  WHERE wo.status IN ('released', 'in_progress', 'paused', 'finished')
),
wip_total AS (
  SELECT COALESCE(SUM(material_cost - output_value), 0) AS wip FROM open_wo
),
ledgers AS (
  SELECT unnest(ARRAY['VUK', 'UFRS']) AS ledger
),
ledger_151 AS (
  SELECT
    l.ledger,
    COALESCE((
      SELECT SUM(jl.debit - jl.credit)
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.entry_id
      WHERE jl.account_code = '151' AND jl.ledger::text = l.ledger AND je.status IN ('posted', 'reversed')
    ), 0) AS bal
  FROM ledgers l
)

SELECT
  'I15' AS rule, ('wip_' || l.ledger) AS entity, l.ledger AS id,
  w.wip::numeric(18, 4) AS expected,
  l.bal::numeric(18, 4) AS actual,
  (l.bal - w.wip)::numeric(18, 4) AS diff
FROM ledger_151 l
CROSS JOIN wip_total w
WHERE abs(l.bal - w.wip) > 0

ORDER BY id;
