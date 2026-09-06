-- I48 — Satın alma beyaz liste kapısı (regresyon güvenlik ağı, I42'nin tamamlayıcısı):
-- her `is_auto_approved=true` satın alma siparişi `docs/modules/tedarik.md`'nin "beyaz liste dışı
-- hiçbir PO otomatik gönderilmez" kuralının HER İKİ kapısını da geçmiş olmalı:
--   (a) tedarikçi genel satın alma beyaz listesinde (`partners.is_purchase_whitelisted = true`),
--   (b) siparişin HER satırı bir `reorder_rules` kaydına bağlı VE o kural `is_auto_order_whitelisted = true`.
--
-- Kök neden bağlamı: `apps/web/src/modules/purchasing/actions.ts::runReplenishmentAction`
-- (`evaluateAutoOrderEligibility` + `rulesForOrder.every(r => r.isAutoOrderWhitelisted)` +
-- `isSupplierWhitelisted`) bugün bu iki kapıyı doğru uyguluyor — fresh seed 0 ihlal. I42 yalnızca
-- TUTAR sınırını (autoOrderMaxAmount) doğruluyordu, bu iki kapının KENDİSİNİ (whitelist bayrakları)
-- hiçbir kural doğrulamıyordu — `isAutoApproved`'ı yazan tek yol bugün bu action + seed olsa da,
-- ileride manuel bir PO düzenleme ekranı/servisi (ör. "siparişi elle onayla" butonu) bu bayrağı
-- whitelist kontrolünden geçirmeden set ederse (I42'nin tuttuğu tutar sınırını atlatmadan bile)
-- kural anında kırmızıya düşer. Fresh seed: 0 ihlal.
--
-- (c) alt kuralı: `reorder_rule_id IS NULL` olan bir satırın bulunduğu auto-approved bir PO da
-- aynı kapıyı atlatır (satır hangi kritik-stok kuralından geldiği izlenemez, whitelist hiç
-- doğrulanamaz) — `actions.ts`'in kendi "AI taslağı kritik kümede olmayan productId döndürdü"
-- guard'ı (satır ~230-240) bunu bugün PO'ya hiç girmeden reddediyor, ama bu da yalnızca TEK yazma
-- yolunun disiplinine bağlı bir regresyon güvenlik ağı.
SELECT rule, entity, id, expected, actual, diff FROM (
  SELECT
    'I48' AS rule,
    'auto_approved_po_supplier_not_whitelisted' AS entity,
    po.id::text AS id,
    1::numeric(18, 4) AS expected,
    0::numeric(18, 4) AS actual,
    1::numeric(18, 4) AS diff
  FROM purchase_orders po
  JOIN partners p ON p.id = po.partner_id
  WHERE po.is_auto_approved = true
    AND p.is_purchase_whitelisted = false

  UNION ALL

  SELECT
    'I48' AS rule,
    'auto_approved_po_line_rule_not_whitelisted' AS entity,
    pol.id::text AS id,
    1::numeric(18, 4) AS expected,
    0::numeric(18, 4) AS actual,
    1::numeric(18, 4) AS diff
  FROM purchase_order_lines pol
  JOIN purchase_orders po ON po.id = pol.order_id
  JOIN reorder_rules rr ON rr.id = pol.reorder_rule_id
  WHERE po.is_auto_approved = true
    AND rr.is_auto_order_whitelisted = false

  UNION ALL

  SELECT
    'I48' AS rule,
    'auto_approved_po_line_missing_reorder_rule' AS entity,
    pol.id::text AS id,
    1::numeric(18, 4) AS expected,
    0::numeric(18, 4) AS actual,
    1::numeric(18, 4) AS diff
  FROM purchase_order_lines pol
  JOIN purchase_orders po ON po.id = pol.order_id
  WHERE po.is_auto_approved = true
    AND pol.reorder_rule_id IS NULL
) v
ORDER BY entity, id;
