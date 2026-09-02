-- I13 — Kur farkı
--   a) dövizli fatura: grand_total_try = grand_total × exchange_rate
--   b) tahsilatta fx_difference = amount × (tahsilat kuru − fatura kuru); yalnızca tek faturaya tahsis
--      edilmiş tahsilatlar için hesaplanabilir (varsayım — raporda belirtilmiştir)
--   c) fx_difference ≠ 0 olan dövizli tahsilatın bir kur farkı fişi (646/656) olmalı

SELECT
  'I13' AS rule, 'invoice_fx_conversion_mismatch' AS entity, i.id::text AS id,
  (i.grand_total * i.exchange_rate)::numeric(18, 4) AS expected,
  i.grand_total_try::numeric(18, 4) AS actual,
  (i.grand_total_try - (i.grand_total * i.exchange_rate))::numeric(18, 4) AS diff
FROM invoices i
WHERE i.currency <> 'TRY' AND abs(i.grand_total_try - (i.grand_total * i.exchange_rate)) > 0

UNION ALL

SELECT
  'I13', 'payment_fx_difference_mismatch', p.id::text,
  (p.amount * (p.exchange_rate - i.exchange_rate))::numeric(18, 4) AS expected,
  p.fx_difference::numeric(18, 4) AS actual,
  (p.fx_difference - (p.amount * (p.exchange_rate - i.exchange_rate)))::numeric(18, 4) AS diff
FROM payments p
JOIN (
  SELECT payment_id, MIN(invoice_id::text)::uuid AS invoice_id
  FROM payment_allocations
  GROUP BY payment_id
  HAVING COUNT(*) = 1
) single_alloc ON single_alloc.payment_id = p.id
JOIN invoices i ON i.id = single_alloc.invoice_id
WHERE p.currency <> 'TRY'
  AND abs(p.fx_difference - (p.amount * (p.exchange_rate - i.exchange_rate))) > 0

UNION ALL

SELECT
  'I13', 'payment_fx_missing_journal', p.id::text,
  1::numeric(18, 4), 0::numeric(18, 4), 1::numeric(18, 4)
FROM payments p
WHERE p.currency <> 'TRY' AND p.fx_difference <> 0 AND p.fx_journal_entry_id IS NULL

ORDER BY id;
