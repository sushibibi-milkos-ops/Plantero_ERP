-- I41 — Tedarikçi kalite skoru (`supplier_scores`) formülü ve güncellik tutarlılığı
-- (packages/core/src/quality/supplierScore.ts::computeSupplierScores — docs kabul: kalite %50,
-- zamanında teslimat %30, miktar doğruluğu %20).
--
--   a) supplier_scores.score = qualityRate*50 + onTimeRate*30 + qtyAccuracyClamped*20, satırın
--      KENDİ denormalize alanlarından (receipts/on_time_receipts/qc_checks/qc_passed/rejected_qty/
--      received_qty) yeniden türetilerek — qc_checks=0 iken qualityRate=1 (QC gerektirmeyen tedarikçi
--      tam puan), receipts=0 satır zaten yok (computeSupplierScores o dönem hiç insert etmiyor),
--      received_qty=0 iken qtyAccuracy=1, qtyAccuracy negatifse 0'a clamp edilir.
--   b) partners.supplier_quality_score, o tedarikçinin EN GÜNCEL (period büyük→küçük, "YYYY-MM"
--      sözlüksel sıralama = kronolojik) supplier_scores.score'una eşit olmalı ("en güncel çağrı
--      kazanır" — computeSupplierScores dosya başı yorumu).

-- NOT: uygulama `packages/core/src/money.ts::toDb` ile SADECE final skoru numeric(18,4)'e yuvarlayıp
-- yazıyor (decimal.js tam hassasiyetle hesaplayıp en sonda `toFixed(4)`) — bu yüzden burada da
-- `round(..., 4)` ile AYNI son-adım yuvarlaması uygulanmalı; aksi halde (ör. 8/170 gibi devirli
-- ondalıklı bir oran) Postgres'in yüksek hassasiyetli ham bölme sonucu ile 4 ondalığa yuvarlanmış
-- saklanan değer arasında ~1e-5 mertebesinde SAHTE bir fark oluşur (kontrolün kendi yuvarlama hatası,
-- gerçek bir servis hatası değil — Tur 1'de canlı olarak yakalanıp düzeltildi).
WITH recomputed AS (
  SELECT
    s.id,
    s.score AS stored_score,
    round(
      (CASE WHEN s.qc_checks > 0 THEN s.qc_passed::numeric / s.qc_checks ELSE 1 END) * 50
      + (CASE WHEN s.receipts > 0 THEN s.on_time_receipts::numeric / s.receipts ELSE 1 END) * 30
      + GREATEST(
          CASE WHEN s.received_qty > 0 THEN 1 - (s.rejected_qty / s.received_qty) ELSE 1 END,
          0
        ) * 20,
      4
    ) AS expected_score
  FROM supplier_scores s
),
latest_period AS (
  SELECT DISTINCT ON (s.partner_id) s.partner_id, s.period, s.score
  FROM supplier_scores s
  ORDER BY s.partner_id, s.period DESC
)

SELECT
  'I41' AS rule, 'supplier_score_formula_mismatch' AS entity, r.id::text AS id,
  r.expected_score::numeric(18, 4) AS expected, r.stored_score::numeric(18, 4) AS actual,
  (r.stored_score - r.expected_score)::numeric(18, 4) AS diff
FROM recomputed r
WHERE abs(r.stored_score - r.expected_score) > 0

UNION ALL

SELECT
  'I41', 'partner_quality_score_stale', p.id::text,
  lp.score::numeric(18, 4) AS expected, p.supplier_quality_score::numeric(18, 4) AS actual,
  (p.supplier_quality_score - lp.score)::numeric(18, 4) AS diff
FROM partners p
JOIN latest_period lp ON lp.partner_id = p.id
WHERE abs(p.supplier_quality_score - lp.score) > 0

ORDER BY id;
