-- I23 — Satın alma faturalama zinciri (alış faturası hiç üretilmiyor — packages/core'da alış faturası
-- (invoices.kind='purchase') oluşturan/yayınlayan hiçbir servis yok; packages/core/src/purchasing
-- dizini mevcut değil, packages/core/src/stock/receipts.ts hiçbir invoice/journal çağrısı yapmıyor).
--
-- postStockMove, 'receipt' hareketinde INV / 320.999 (Faturası Gelmemiş Alımlar) fişi keser
-- (packages/core/src/accounting/mapping.ts). Bu ara hesap yalnızca gerçek tedarikçi faturası
-- geldiğinde 320.999 ↔ 320.<tedarikçi> ile kapanır ve o anda 191 (İndirilecek KDV) doğar. Alış
-- faturası hiç oluşturulmediği için:
--   a) her değerli 'receipt' hareketinin bağlı bir alış faturası (invoices.kind='purchase',
--      receipt_id = receipts.id) OLMALI — aksi halde 320.999 asla kapanmaz (kalıcı borç), 191 hiç
--      oluşmaz (KDV iadesi/indirimi kaybı) ve partners.balance (tedarikçi) gerçek borcu yansıtmaz (I18).
--   b) purchase_order_lines.received_qty > 0 iken invoiced_qty = 0 olan her satır aynı boşluğun
--      satınalma sipariş tarafındaki yansımasıdır.
--
-- Bu kural bugün TÜM değerli mal kabullerinde KIRMIZI verecektir (özellik hiç yazılmamış) — tıpkı I21
-- gibi, özellik tamamlandığında (alış faturası postJournalEntry ile 320.999→320.<tedarikçi> + 191
-- yazan bir servis) otomatik yeşile döner. Bkz. rapor: "core" kök neden — packages/core/src/purchasing
-- eksik.

SELECT
  'I23' AS rule, 'receipt_missing_purchase_invoice' AS entity, r.id::text AS id,
  1::numeric(18, 4) AS expected, 0::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM receipts r
WHERE EXISTS (
    SELECT 1 FROM receipt_lines rl JOIN stock_moves sm ON sm.ref_type = 'receipt' AND sm.ref_id = r.id
    WHERE sm.is_valued = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM invoices i WHERE i.kind = 'purchase' AND i.receipt_id = r.id AND i.status <> 'cancelled'
  )

UNION ALL

SELECT
  'I23', 'po_line_received_never_invoiced', pol.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM purchase_order_lines pol
WHERE pol.received_qty > 0 AND pol.invoiced_qty = 0

ORDER BY id;
