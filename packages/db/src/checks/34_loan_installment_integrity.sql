-- I34 — Kredi taksit takvimi iç tutarlılığı (packages/db/src/import/nakitakisi.ts — Excel "Kredi Takvimi" içe aktarımı)
--   a) loan_installments.installment = interest + principal (satır bazında)
--   b) remaining_after zinciri: seq=1 → loans.remaining_principal - principal; seq>1 → önceki satırın remaining_after - principal
--   c) Σ loan_installments.principal (kredi bazında) = loans.remaining_principal
--   d) son taksitin (seq = loans.remaining_installments) remaining_after'ı = 0 (kredi tam kapanmalı)
--
-- Kök neden notu: taksit/faiz+bsmv/anapara üç ayrı hücre olarak kaynak Excel'den bağımsız okunuyor
-- (nakitakisi.ts satır 217-234, `asNumber(cellVal(...))` + `money4` ile tek tek yuvarlanıyor) — kaynak
-- dosyanın kendi iç tutarlılığı (taksit === faiz+anapara) hiç doğrulanmıyor/zorlanmıyor, bu yüzden
-- Excel'deki kayan noktalı yuvarlama farkları (0,0001 TL mertebesinde) veritabanına aynen taşınıyor.

WITH ordered AS (
  SELECT
    l.id AS loan_id, l.code AS loan_code, l.remaining_principal, l.remaining_installments,
    li.id AS line_id, li.seq, li.installment, li.interest, li.principal, li.remaining_after,
    LAG(li.remaining_after) OVER (PARTITION BY l.id ORDER BY li.seq) AS prev_after
  FROM loan_installments li
  JOIN loans l ON l.id = li.loan_id
)
-- a) installment = interest + principal
SELECT
  'I34' AS rule, 'loan_installment_sum_mismatch' AS entity, line_id::text AS id,
  (interest + principal)::numeric(18, 4) AS expected,
  installment::numeric(18, 4) AS actual,
  (installment - (interest + principal))::numeric(18, 4) AS diff
FROM ordered
WHERE abs(installment - (interest + principal)) > 0

UNION ALL

-- b) remaining_after zinciri
SELECT
  'I34', 'loan_installment_remaining_after_chain', line_id::text,
  (COALESCE(prev_after, remaining_principal) - principal)::numeric(18, 4) AS expected,
  remaining_after::numeric(18, 4) AS actual,
  (remaining_after - (COALESCE(prev_after, remaining_principal) - principal))::numeric(18, 4) AS diff
FROM ordered
WHERE abs(remaining_after - (COALESCE(prev_after, remaining_principal) - principal)) > 0

UNION ALL

-- c) Σ principal = loans.remaining_principal
SELECT
  'I34', 'loan_remaining_principal_sum_mismatch', loan_id::text,
  remaining_principal::numeric(18, 4) AS expected,
  SUM(principal)::numeric(18, 4) AS actual,
  (remaining_principal - SUM(principal))::numeric(18, 4) AS diff
FROM ordered
GROUP BY loan_id, loan_code, remaining_principal
HAVING abs(remaining_principal - SUM(principal)) > 0

UNION ALL

-- d) son taksit remaining_after = 0
SELECT
  'I34', 'loan_final_installment_not_zero', line_id::text,
  0::numeric(18, 4) AS expected,
  remaining_after::numeric(18, 4) AS actual,
  remaining_after::numeric(18, 4) AS diff
FROM ordered
WHERE seq = remaining_installments AND abs(remaining_after) > 0

ORDER BY id;
