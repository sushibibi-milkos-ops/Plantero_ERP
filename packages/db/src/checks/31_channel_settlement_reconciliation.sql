-- I31 — Kanal hakediş mutabakatı (channel_settlements ↔ gerçek satış/tahsilat)
-- Bulgu (tur 11, P0): channel_settlements tablosu hiçbir yerde (packages/core/src, apps/worker/src)
-- gerçek satış/tahsilat verisiyle üretilmiyor — packages/db/src/seed/sales.ts::seedSettlements
-- sabit demo rakamları (Trendyol 148.500 TL, Hepsiburada 96.200 TL "brüt satış") elle yazıyor.
-- Aynı seed dosyasının kendisi bu iki kanal için gerçek sales_orders/invoices üretiyor ama
-- toplamları (Trendyol tüm zamanlar 29.195,10 TL) settlement'ın iddia ettiği rakamın (dönem başına
-- 148.500 TL) çok altında — yani "kanal hakedişi" ekranı muhasebeyle hiç bağlantısı olmayan
-- hayali bir rakam gösteriyor.
--
-- a) gross_sales, o kanal + dönem için sales_orders'ta gerçekten var olan grand_total toplamını
--    aşamaz (channel_settlements'ta sales_orders'a doğrudan FK yok — dönem+kanal ile en cömert
--    şekilde eşleştirilir; buna rağmen aşım varsa veri kesinlikle hayalidir).
-- b) status='paid' iken bank_transaction_id dolu olmalı VE o banka hareketi var olmalı — aksi halde
--    "ödendi" denilen bir tutarın bankada hiçbir izi yok demektir (packages/core/src/finance/
--    içinde channel_settlements'a yazan/okuyan tek satır kod yok).
-- c) paid_at, kayıt anındaki güncel tarihten ileri olamaz (gelecekte "ödenmiş" olamaz).
--
-- Kök neden: packages/db/src/seed/sales.ts::seedSettlements (satır ~399-414) — hiçbir
-- packages/core/src servisine bağlı değil. Düzeltme: channel_settlements'a sales_order/invoice
-- bazlı gerçek toplamdan hesaplanan bir üretim yolu (packages/core/src/sales/channelSettlements.ts
-- veya benzeri) + ödeme anında payments/bank_transactions ile gerçek bağ.

WITH channel_actual AS (
  SELECT
    cs.id AS settlement_id,
    cs.channel_id,
    cs.period_start,
    cs.period_end,
    COALESCE((
      SELECT SUM(so.grand_total)
      FROM sales_orders so
      WHERE so.channel_id = cs.channel_id
        AND so.order_date BETWEEN cs.period_start AND cs.period_end
    ), 0) AS actual_gross
  FROM channel_settlements cs
)
SELECT
  'I31' AS rule, 'channel_settlement_gross_exceeds_actual' AS entity, ca.settlement_id::text AS id,
  ca.actual_gross::numeric(18, 4) AS expected, cs.gross_sales::numeric(18, 4) AS actual,
  (cs.gross_sales - ca.actual_gross)::numeric(18, 4) AS diff
FROM channel_actual ca
JOIN channel_settlements cs ON cs.id = ca.settlement_id
WHERE cs.gross_sales > ca.actual_gross

UNION ALL

SELECT
  'I31', 'channel_settlement_paid_without_bank_evidence', cs.id::text,
  1::numeric(18, 4), 0::numeric(18, 4), 1::numeric(18, 4)
FROM channel_settlements cs
WHERE cs.status = 'paid'
  AND (cs.bank_transaction_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM bank_transactions bt WHERE bt.id = cs.bank_transaction_id))

UNION ALL

SELECT
  'I31', 'channel_settlement_paid_at_future', cs.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM channel_settlements cs
WHERE cs.paid_at IS NOT NULL AND cs.paid_at > CURRENT_DATE

ORDER BY id;
