-- I67 — Zorunlu denetim #10 ("üretim: verim % kayıtlı"): günlük OEE kaydı (oee_records) formül ve
-- kaynak bütünlüğü.
--
-- Hesap mantığı `packages/core/src/production/yield.ts::computeLineOeeForDay` içinde tanımlı ve
-- `packages/core/src/maintenance/oee.ts::recomputeOeeForDay` (worker "oee-daily" 23:30 + seed) bunu
-- `oee_records`'a yazıyor. Bu iki fonksiyon HER ÇAĞRIDA yeniden hesaplayıp upsert ettiği için normal
-- akışta drift olmaz — ama satır elle düzeltilirse (migration/hotfix/manuel SQL) ya da hesaplama
-- girdileri (downtimes, work_orders) DEĞİŞTİRİLİP oee_records YENİDEN hesaplanmadan bırakılırsa
-- (`recomputeOeeForDay` o gün için tekrar çağrılmazsa) satır donuk/yanlış kalır ve kokpit + bakım
-- `/bakim/oee` ekranındaki KPI kartları, trend grafiği ve duruş pareto'su gerçek veriyle uyuşmaz.
--
-- Dört katman (docs/modules/bakim.md §4):
--   a) İç formül tutarlılığı: run_minutes = greatest(0, planned_minutes - downtime_minutes);
--      availability_pct = round(run_minutes / planned_minutes × 100, 2) (planned_minutes > 0 iken);
--      performance_pct = least(100, round(actual_output / ideal_output × 100, 2)) (ideal_output > 0 iken);
--      quality_pct = round(good_output / actual_output × 100, 2) (actual_output > 0 iken);
--      oee_pct = round(availability_pct × performance_pct × quality_pct / 10000, 2)
--   b) downtime_minutes = Σ downtimes.minutes (aynı line_id, İstanbul iş günü = oee_records.day)
--   c) actual_output = Σ work_orders.produced_qty, good_output = greatest(0, actual_output − Σ scrap_qty)
--      (aynı line_id, finished_at dolu, İstanbul iş günü = oee_records.day)
--   d) maintenance_orders.downtime_minutes = Σ downtimes.minutes (downtimes.maintenance_order_id ile
--      bağlı olanlar) — yalnızca en az bir bağlı duruş kaydı varsa (aksi halde alan elle/başka
--      kaynaktan girilmiş olabilir, I67 kapsamı değil)

WITH formula AS (
  SELECT
    o.id,
    GREATEST(0, o.planned_minutes - o.downtime_minutes) AS expected_run_minutes,
    o.run_minutes,
    CASE WHEN o.planned_minutes > 0 THEN round(o.run_minutes::numeric / o.planned_minutes * 100, 2) ELSE 0 END AS expected_availability_pct,
    o.availability_pct,
    CASE WHEN o.ideal_output > 0 THEN LEAST(100, round(o.actual_output / o.ideal_output * 100, 2)) ELSE 0 END AS expected_performance_pct,
    o.performance_pct,
    CASE WHEN o.actual_output > 0 THEN round(o.good_output / o.actual_output * 100, 2) ELSE 0 END AS expected_quality_pct,
    o.quality_pct,
    o.oee_pct
  FROM oee_records o
),
formula_with_oee AS (
  SELECT *, round(expected_availability_pct * expected_performance_pct * expected_quality_pct / 10000, 2) AS expected_oee_pct
  FROM formula
),
src AS (
  SELECT
    o.id, o.line_id, o.day, o.downtime_minutes, o.actual_output, o.good_output,
    COALESCE((SELECT SUM(d.minutes) FROM downtimes d WHERE d.line_id = o.line_id AND (d.started_at AT TIME ZONE 'Europe/Istanbul')::date = o.day), 0) AS expected_downtime_minutes,
    COALESCE((SELECT SUM(w.produced_qty) FROM work_orders w WHERE w.line_id = o.line_id AND w.finished_at IS NOT NULL AND (w.finished_at AT TIME ZONE 'Europe/Istanbul')::date = o.day), 0) AS expected_actual_output,
    GREATEST(0, COALESCE((SELECT SUM(w.produced_qty) FROM work_orders w WHERE w.line_id = o.line_id AND w.finished_at IS NOT NULL AND (w.finished_at AT TIME ZONE 'Europe/Istanbul')::date = o.day), 0)
              - COALESCE((SELECT SUM(w.scrap_qty) FROM work_orders w WHERE w.line_id = o.line_id AND w.finished_at IS NOT NULL AND (w.finished_at AT TIME ZONE 'Europe/Istanbul')::date = o.day), 0)) AS expected_good_output
  FROM oee_records o
)

SELECT 'I67' AS rule, 'oee_run_minutes_mismatch' AS entity, id::text AS id, expected_run_minutes::numeric(18,4) AS expected, run_minutes::numeric(18,4) AS actual, (run_minutes - expected_run_minutes)::numeric(18,4) AS diff
FROM formula_with_oee WHERE run_minutes <> expected_run_minutes

UNION ALL
SELECT 'I67', 'oee_availability_pct_mismatch', id::text, expected_availability_pct::numeric(18,4), availability_pct::numeric(18,4), (availability_pct - expected_availability_pct)::numeric(18,4)
FROM formula_with_oee WHERE abs(availability_pct - expected_availability_pct) > 0

UNION ALL
SELECT 'I67', 'oee_performance_pct_mismatch', id::text, expected_performance_pct::numeric(18,4), performance_pct::numeric(18,4), (performance_pct - expected_performance_pct)::numeric(18,4)
FROM formula_with_oee WHERE abs(performance_pct - expected_performance_pct) > 0

UNION ALL
SELECT 'I67', 'oee_quality_pct_mismatch', id::text, expected_quality_pct::numeric(18,4), quality_pct::numeric(18,4), (quality_pct - expected_quality_pct)::numeric(18,4)
FROM formula_with_oee WHERE abs(quality_pct - expected_quality_pct) > 0

UNION ALL
SELECT 'I67', 'oee_pct_mismatch', id::text, expected_oee_pct::numeric(18,4), oee_pct::numeric(18,4), (oee_pct - expected_oee_pct)::numeric(18,4)
FROM formula_with_oee WHERE abs(oee_pct - expected_oee_pct) > 0

UNION ALL
SELECT 'I67', 'oee_downtime_minutes_source_drift', id::text, expected_downtime_minutes::numeric(18,4), downtime_minutes::numeric(18,4), (downtime_minutes - expected_downtime_minutes)::numeric(18,4)
FROM src WHERE downtime_minutes <> expected_downtime_minutes

UNION ALL
SELECT 'I67', 'oee_actual_output_source_drift', id::text, expected_actual_output::numeric(18,4), actual_output::numeric(18,4), (actual_output - expected_actual_output)::numeric(18,4)
FROM src WHERE abs(actual_output - expected_actual_output) > 0

UNION ALL
SELECT 'I67', 'oee_good_output_source_drift', id::text, expected_good_output::numeric(18,4), good_output::numeric(18,4), (good_output - expected_good_output)::numeric(18,4)
FROM src WHERE abs(good_output - expected_good_output) > 0

UNION ALL
SELECT 'I67', 'maintenance_downtime_minutes_mismatch', mo.id::text, COALESCE(SUM(d.minutes), 0)::numeric(18,4), mo.downtime_minutes::numeric(18,4), (mo.downtime_minutes - COALESCE(SUM(d.minutes), 0))::numeric(18,4)
FROM maintenance_orders mo
JOIN downtimes d ON d.maintenance_order_id = mo.id
GROUP BY mo.id, mo.downtime_minutes
HAVING mo.downtime_minutes <> COALESCE(SUM(d.minutes), 0)

ORDER BY id;
