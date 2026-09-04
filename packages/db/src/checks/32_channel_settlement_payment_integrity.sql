-- I32 — Kanal hakediş ÖDEME bütünlüğü (I31'in derinleştirilmesi — regresyon koruması)
-- Tur 11'de packages/core/src/sales/channelSettlements.ts::markChannelSettlementPaid yazıldı;
-- I31 yalnızca "paid ⇒ bank_transaction_id dolu ve o hareket var" diye YÜZEYSEL doğruluyordu.
-- Bu kural markChannelSettlementPaid'in ürettiği TÜM zinciri (payment tutarı, allocation toplamı,
-- reconciliation_matches durumu, document_links) I29/I11 disipliniyle aynı sıkılıkta doğrular —
-- servis ileride değişip zincirin bir halkasını (ör. allocation'ı netPayout'a tam tahsis etmeden)
-- kırarsa I31 hâlâ GEÇER ama I32 anında KIRMIZI'ya düşer.
--
-- a) status='paid' olan her hakediş için bank_transaction'a bağlı TAM OLARAK 1 onaylı/otomatik
--    (approved|auto_applied) kind='marketplace_payout' reconciliation_matches kaydı olmalı VE
--    o kaydın payment_id'si dolu olmalı.
-- b) o payment'ın tutarı (payments.amount) = channel_settlements.net_payout (kuruşu kuruşuna).
-- c) o payment'a ait payment_allocations toplamı = net_payout (I9'un "on-account bırakılmaz" kuralı
--    burada da geçerli — hakediş tahsilatı asla kısmi/tahsissiz kalamaz).
-- d) payment → invoice document_links satırları, reconciliation_matches.invoice_ids ile birebir aynı
--    fatura kümesini kapsamalı (I7'nin bu spesifik akış için ikinci doğrulama katmanı).

WITH paid AS (
  SELECT cs.id AS settlement_id, cs.net_payout, cs.bank_transaction_id
  FROM channel_settlements cs
  WHERE cs.status = 'paid'
),
match AS (
  SELECT
    p.settlement_id, p.net_payout,
    rm.id AS match_id, rm.status AS match_status, rm.payment_id, rm.invoice_ids
  FROM paid p
  LEFT JOIN reconciliation_matches rm
    ON rm.bank_transaction_id = p.bank_transaction_id AND rm.kind = 'marketplace_payout'
)
SELECT 'I32' AS rule, 'settlement_missing_marketplace_payout_match' AS entity, m.settlement_id::text AS id,
  1::numeric(18, 4) AS expected, 0::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM match m
WHERE m.match_id IS NULL

UNION ALL

SELECT 'I32', 'settlement_match_not_approved', m.match_id::text,
  1::numeric(18, 4), 0::numeric(18, 4), 1::numeric(18, 4)
FROM match m
WHERE m.match_id IS NOT NULL AND m.match_status NOT IN ('approved', 'auto_applied')

UNION ALL

SELECT 'I32', 'settlement_match_missing_payment_id', m.match_id::text,
  1::numeric(18, 4), 0::numeric(18, 4), 1::numeric(18, 4)
FROM match m
WHERE m.match_id IS NOT NULL AND m.payment_id IS NULL

UNION ALL

SELECT 'I32', 'settlement_payment_amount_mismatch', m.payment_id::text,
  m.net_payout::numeric(18, 4), pay.amount::numeric(18, 4), (pay.amount - m.net_payout)::numeric(18, 4)
FROM match m
JOIN payments pay ON pay.id = m.payment_id
WHERE abs(pay.amount::numeric - m.net_payout::numeric) > 0

UNION ALL

SELECT 'I32', 'settlement_allocation_sum_mismatch', m.payment_id::text,
  m.net_payout::numeric(18, 4), COALESCE(SUM(pa.amount), 0)::numeric(18, 4),
  (COALESCE(SUM(pa.amount), 0) - m.net_payout)::numeric(18, 4)
FROM match m
LEFT JOIN payment_allocations pa ON pa.payment_id = m.payment_id
WHERE m.payment_id IS NOT NULL
GROUP BY m.payment_id, m.net_payout
HAVING abs(COALESCE(SUM(pa.amount), 0) - m.net_payout::numeric) > 0

UNION ALL

SELECT 'I32', 'settlement_document_links_invoice_mismatch', m.payment_id::text,
  (SELECT COUNT(*) FROM jsonb_array_elements_text(m.invoice_ids) x)::numeric(18, 4),
  (SELECT COUNT(*) FROM document_links dl WHERE dl.source_type = 'payment' AND dl.source_id = m.payment_id AND dl.target_type = 'invoice')::numeric(18, 4),
  1::numeric(18, 4)
FROM match m
WHERE m.payment_id IS NOT NULL
  AND (
    SELECT COALESCE(array_agg(dl.target_id::text ORDER BY dl.target_id), ARRAY[]::text[])
    FROM document_links dl WHERE dl.source_type = 'payment' AND dl.source_id = m.payment_id AND dl.target_type = 'invoice'
  ) IS DISTINCT FROM (
    SELECT COALESCE(array_agg(x ORDER BY x), ARRAY[]::text[]) FROM jsonb_array_elements_text(m.invoice_ids) AS x
  )

ORDER BY id;
