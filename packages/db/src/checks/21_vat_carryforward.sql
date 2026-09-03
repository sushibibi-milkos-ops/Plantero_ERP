-- I21 — Devreden KDV (190) tutarlılığı (I12'nin eksik parçası)
-- CLAUDE.md kural 8 / audit maddesi 7: "devreden KDV (190) hesabı önceki ay + alış − satış ile tutarlı".
-- vat_periods (packages/db/src/schema/accounting.ts) bu hesabı tutmak için var:
--   carried_from_prev + input_vat − output_vat  =>  net > 0 ⇒ payable = net, carried_to_next = 0
--                                                    net ≤ 0 ⇒ payable = 0, carried_to_next = −net
-- BULGU (kök neden — bkz. rapor): bu tabloyu dolduran hiçbir servis yok (packages/core/src/accounting/*,
-- apps/worker/src/jobs/*) — vat_periods her zaman boş, dolayısıyla bu kural bugün 0 satır dönebilir
-- (veri yok ⇒ ihlal yok) ama CLAUDE.md kural 8'in fiilen UYGULANMADIĞI anlamına gelir. Servis
-- eklendiğinde bu kontrol otomatik devreye girer.

WITH ordered AS (
  SELECT
    vp.*,
    LAG(vp.carried_to_next) OVER (ORDER BY vp.period) AS prev_carried_to_next,
    LAG(vp.period) OVER (ORDER BY vp.period) AS prev_period
  FROM vat_periods vp
),
ledger_190 AS (
  SELECT
    to_char(je.entry_date, 'YYYY-MM') AS period,
    SUM(jl.debit - jl.credit) AS bal
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.entry_id
  WHERE (jl.account_code = '190' OR jl.account_code LIKE '190.%')
    AND jl.ledger = 'VUK' AND je.status IN ('posted', 'reversed')
  GROUP BY 1
)

-- a) devreden KDV zinciri: bu ayın carried_from_prev = bir önceki takvim ayının carried_to_next
--    (yalnızca ardışık aylar için; ilk kayıtlı dönem veya araya boşluk düşen dönem kapsam dışı)
SELECT
  'I21' AS rule, 'vat_period_carry_chain_broken' AS entity, o.period AS id,
  o.prev_carried_to_next::numeric(18, 4) AS expected,
  o.carried_from_prev::numeric(18, 4) AS actual,
  (o.carried_from_prev - o.prev_carried_to_next)::numeric(18, 4) AS diff
FROM ordered o
WHERE o.prev_period IS NOT NULL
  AND to_char((to_date(o.prev_period || '-01', 'YYYY-MM-DD') + interval '1 month')::date, 'YYYY-MM') = o.period
  AND abs(o.carried_from_prev - o.prev_carried_to_next) > 0

UNION ALL

-- b) payable / carried_to_next, net = carried_from_prev + input_vat − output_vat formülüyle tutarlı olmalı
SELECT
  'I21', 'vat_period_payable_formula_mismatch', vp.period,
  GREATEST(vp.carried_from_prev + vp.input_vat - vp.output_vat, 0)::numeric(18, 4) AS expected,
  vp.payable::numeric(18, 4) AS actual,
  (vp.payable - GREATEST(vp.carried_from_prev + vp.input_vat - vp.output_vat, 0))::numeric(18, 4) AS diff
FROM vat_periods vp
WHERE abs(vp.payable - GREATEST(vp.carried_from_prev + vp.input_vat - vp.output_vat, 0)) > 0

UNION ALL

SELECT
  'I21', 'vat_period_carry_to_next_formula_mismatch', vp.period,
  GREATEST(-(vp.carried_from_prev + vp.input_vat - vp.output_vat), 0)::numeric(18, 4) AS expected,
  vp.carried_to_next::numeric(18, 4) AS actual,
  (vp.carried_to_next - GREATEST(-(vp.carried_from_prev + vp.input_vat - vp.output_vat), 0))::numeric(18, 4) AS diff
FROM vat_periods vp
WHERE abs(vp.carried_to_next - GREATEST(-(vp.carried_from_prev + vp.input_vat - vp.output_vat), 0)) > 0

UNION ALL

-- c) 190 defter bakiyesi (dönem sonu) = o dönemin carried_to_next'i ile eşit olmalı
SELECT
  'I21', 'vat_period_190_ledger_mismatch', vp.period,
  vp.carried_to_next::numeric(18, 4) AS expected,
  COALESCE(l190.bal, 0)::numeric(18, 4) AS actual,
  (COALESCE(l190.bal, 0) - vp.carried_to_next)::numeric(18, 4) AS diff
FROM vat_periods vp
LEFT JOIN ledger_190 l190 ON l190.period = vp.period
WHERE abs(COALESCE(l190.bal, 0) - vp.carried_to_next) > 0

ORDER BY id;
