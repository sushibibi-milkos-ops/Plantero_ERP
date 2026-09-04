-- I18 — Cari bakiye (tedarikçi tarafı, I9'un simetriği)
--   Σ alış faturaları (posted/partially_paid/paid, purchase − purchase_return) − Σ tedarikçiye yapılan
--   TÜM ödemeler (tahsis edilmiş + edilmemiş) = −partners.balance (payable, negatif taraf)
--   = 320 hesabının (borç − alacak) × −1 (getPartnerBalance ile aynı yöntem: payable = −(debit−credit)).
-- I9 yalnızca customer/both tarafını (120) doğrular; bu kural supplier/both tarafını (320) doğrular.
--
-- **Tur 7 düzeltmesi (I9 ile aynı kök neden — bkz. 09_partner_balance.sql üst yorumu)**: `allocated`
-- CTE'si yalnızca `payment_allocations`'ı topluyordu; `packages/core/src/finance/payments.ts::recordPayment`
-- ise TAM ödeme tutarını (tahsis edilsin/edilmesin) doğrudan 320 hesabına yazıyor. Simetri için burada da
-- `payments` tablosundan doğrudan (`direction='outbound'`, `status='posted'`) toplanıyor — ve I9'daki
-- ikinci düzeltmeyle aynı nedenle (dövizli ödemede ayrı bir kur farkı fişi de 320'ye net `fx_difference`
-- kadar dokunuyor) `amount_try - fx_difference` toplanıyor, yalnızca `amount_try` değil.

WITH invoice_net AS (
  SELECT partner_id,
    SUM(CASE WHEN kind = 'purchase' THEN grand_total_try WHEN kind = 'purchase_return' THEN -grand_total_try ELSE 0 END) AS net
  FROM invoices
  WHERE status IN ('posted', 'partially_paid', 'paid') AND kind IN ('purchase', 'purchase_return')
  GROUP BY partner_id
),
allocated AS (
  SELECT p.partner_id, SUM(p.amount_try - p.fx_difference) AS amt
  FROM payments p
  WHERE p.status = 'posted' AND p.direction = 'outbound'
  GROUP BY p.partner_id
),
computed AS (
  -- payable > 0 alacaklı bakiye anlamına gelir; partners.balance (net = receivable − payable) içinde
  -- bu −payable olarak görünür.
  SELECT p.id AS partner_id,
    -(COALESCE(invoice_net.net, 0) - COALESCE(allocated.amt, 0)) AS computed_balance_contribution
  FROM partners p
  LEFT JOIN invoice_net ON invoice_net.partner_id = p.id
  LEFT JOIN allocated ON allocated.partner_id = p.id
  WHERE p.kind IN ('supplier', 'both')
),
ledger_320 AS (
  SELECT p.id AS partner_id,
    COALESCE(SUM(CASE
      WHEN (jl.account_code = '320' OR jl.account_code LIKE '320.%')
        AND jl.ledger = 'VUK' AND je.status IN ('posted', 'reversed')
      THEN jl.credit - jl.debit ELSE 0
    END), 0) AS payable_balance
  FROM partners p
  LEFT JOIN journal_lines jl ON jl.partner_id = p.id
  LEFT JOIN journal_entries je ON je.id = jl.entry_id
  WHERE p.kind IN ('supplier', 'both')
  GROUP BY p.id
)

-- a) yalnızca 'supplier' kind (both yok bugün, ama ileride net etkiyi partners.balance karşısında test eder):
--    supplier-only partide partners.balance == computed_balance_contribution (çünkü receivable tarafı yok)
SELECT
  'I18' AS rule, 'supplier_balance_field' AS entity, p.id::text AS id,
  c.computed_balance_contribution::numeric(18, 4) AS expected,
  p.balance::numeric(18, 4) AS actual,
  (p.balance - c.computed_balance_contribution)::numeric(18, 4) AS diff
FROM partners p
JOIN computed c ON c.partner_id = p.id
WHERE p.kind = 'supplier' AND abs(p.balance - c.computed_balance_contribution) > 0

UNION ALL

-- b) her tedarikçi/both partide 320 defter bakiyesi = -computed_balance_contribution (payable pozitif taraf)
SELECT
  'I18', 'supplier_balance_ledger_320', c.partner_id::text,
  (-c.computed_balance_contribution)::numeric(18, 4) AS expected,
  l.payable_balance::numeric(18, 4) AS actual,
  (l.payable_balance - (-c.computed_balance_contribution))::numeric(18, 4) AS diff
FROM computed c
JOIN ledger_320 l ON l.partner_id = c.partner_id
WHERE abs(l.payable_balance - (-c.computed_balance_contribution)) > 0

ORDER BY id;
