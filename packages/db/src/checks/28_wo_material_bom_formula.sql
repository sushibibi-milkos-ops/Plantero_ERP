-- I28 — Zorunlu denetim #10 ("iş emri tüketimi = reçete × üretim miktarı ± kayıtlı fire"): iş emri
-- açılırken donan work_order_materials.planned_qty, reçetenin (bom_lines) o an geçerli formülüyle
-- birebir örtüşmeli. (packages/core/src/masterdata/boms.ts → explodeBom tek üretim noktası; bu
-- kontrol onun çıktısının iş emri satırlarına doğru yazıldığını veri katmanından ikinci kez doğrular.)
--
-- Formül (explodeBom ile birebir):
--   scale = work_orders.planned_qty / boms.output_qty
--   normal malzeme:  planned_qty = round(bom_lines.qty × scale × (1 + bom_lines.scrap_pct/100), 4)
--   yan ürün (is_byproduct): planned_qty = round(bom_lines.qty × scale, 4)  — fire çarpanı uygulanmaz
--
-- Not: work_order_consumptions (GERÇEK tüketim) burada kasıtlı olarak karşılaştırılmıyor — gerçek
-- üretimde fiili fire planlanandan sapabilir (bu normaldir, I22 zaten consumed_qty toplamının
-- work_order_materials.consumed_qty denormuyla tutarlılığını doğruluyor). I28 yalnızca PLAN
-- tarafının reçeteden doğru türetildiğini, yani "reçete × miktar ± kayıtlı fire" formülünün iş
-- emri satırına doğru donduğunu kanıtlıyor.

SELECT
  'I28' AS rule, 'wo_material_planned_qty_formula_mismatch' AS entity, wom.id::text AS id,
  round(
    CASE WHEN wom.is_byproduct
      THEN bl.qty * (wo.planned_qty / b.output_qty)
      ELSE bl.qty * (wo.planned_qty / b.output_qty) * (1 + bl.scrap_pct / 100)
    END, 4)::numeric(18, 4) AS expected,
  wom.planned_qty::numeric(18, 4) AS actual,
  (wom.planned_qty - round(
    CASE WHEN wom.is_byproduct
      THEN bl.qty * (wo.planned_qty / b.output_qty)
      ELSE bl.qty * (wo.planned_qty / b.output_qty) * (1 + bl.scrap_pct / 100)
    END, 4))::numeric(18, 4) AS diff
FROM work_order_materials wom
JOIN work_orders wo ON wo.id = wom.work_order_id
JOIN bom_lines bl ON bl.id = wom.bom_line_id
JOIN boms b ON b.id = wo.bom_id
WHERE wom.bom_line_id IS NOT NULL
  AND abs(wom.planned_qty - round(
    CASE WHEN wom.is_byproduct
      THEN bl.qty * (wo.planned_qty / b.output_qty)
      ELSE bl.qty * (wo.planned_qty / b.output_qty) * (1 + bl.scrap_pct / 100)
    END, 4)) > 0

ORDER BY id;
