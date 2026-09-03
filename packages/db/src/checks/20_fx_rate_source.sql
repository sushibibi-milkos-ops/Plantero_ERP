-- I20 — Kur kaynağı doğrulaması (I13'ün eksik parçası)
-- I13 yalnızca fatura içi tutarlılığı (grand_total_try = grand_total × exchange_rate) doğrular;
-- exchange_rate'in gerçekten fiş tarihindeki TCMB kuruyla eştiğini doğrulamaz. Bu kural onu kapatır.
-- getExchangeRate (packages/core/src/sales/pricing.ts): satış tarafı varsayılan olarak "alış" (buying)
-- kuru kullanır, fatura tarihine eşit ya da ondan önceki en yakın exchange_rates satırı ile (round2).
--
-- Not: yalnızca exchange_rates tablosunda o para birimi için fatura tarihinden önce/eşit en az bir kayıt
-- varsa değerlendirilir (kayıt yoksa kaynak veri eksik demektir, bu I20 kapsamı dışıdır — worker job'ı
-- ilgilenir).

WITH nearest_rate AS (
  SELECT DISTINCT ON (i.id)
    i.id AS invoice_id,
    er.buying AS expected_rate
  FROM invoices i
  JOIN exchange_rates er
    ON er.currency = i.currency AND er.rate_date <= i.invoice_date
  WHERE i.currency <> 'TRY' AND i.kind IN ('sales', 'sales_return')
  ORDER BY i.id, er.rate_date DESC
)

SELECT
  'I20' AS rule, 'invoice_exchange_rate_not_tcmb' AS entity, i.id::text AS id,
  round(nr.expected_rate, 2)::numeric(18, 4) AS expected,
  i.exchange_rate::numeric(18, 4) AS actual,
  (i.exchange_rate - round(nr.expected_rate, 2))::numeric(18, 4) AS diff
FROM invoices i
JOIN nearest_rate nr ON nr.invoice_id = i.id
WHERE abs(i.exchange_rate - round(nr.expected_rate, 2)) > 0

ORDER BY id;
