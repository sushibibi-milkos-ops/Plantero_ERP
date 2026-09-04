-- I9 — Cari bakiye
--   partners.balance = Σ satış faturaları (posted) − Σ tahsilatlar (TAHSİS EDİLMİŞ + EDİLMEMİŞ, +iadeler)
--   = 120.cari bakiyesi (VUK)
-- getPartnerBalance (packages/core/src/accounting/journal.ts) ile aynı yöntem: 120 + alt hesapları,
-- journal_lines.partner_id ile eşleşen, status IN ('posted','reversed'), ledger='VUK' satırlar.
--
-- **Tur 7 düzeltmesi (veri-critic, kendi kontrolündeki hata — CANLI OLARAK YAKALANDI)**: `allocated` CTE'si
-- önceden yalnızca `payment_allocations.amount_try` topluyordu (faturaya TAHSİS EDİLMİŞ kısım). Ancak
-- `packages/core/src/finance/payments.ts::recordPayment` (satır 146-172, yorum satır 28: "ana fiş zaten
-- tüm tutarı (tahsis edilen + edilmeyen) 120/320'e işler") HER tahsilatın TAM tutarını — tahsis edilsin
-- edilmesin — doğrudan 120/320 hesabına yazıyor; `getPartnerBalance` da doğrudan bu 120 hesap bakiyesini
-- okuyor (payment_allocations'a hiç bakmıyor). Bu yüzden tamamen tahsis edilmemiş (`allocated_amount=0`,
-- avans/erken tahsilat) bir tahsilat var olduğunda eski CTE onu hiç saymıyor, `computed_balance` gerçek
-- 120 bakiyesinden `amount_try` kadar sapıyordu — GERÇEK bir tutarsızlık değil, kontrolün EKSİK modeliydi.
-- Canlı doğrulama: `db:reset` sonrası arka planda `PAY-2026-000019` (Trendyol Pazaryeri, 4.321,00 TL, tahsis
-- edilmemiş erken/avans tahsilat, `origin='system'`, banka mutabakatından) oluşturuldu → eski sorgu anında
-- I9'da 2 ihlal verdi (`partner_balance_field` ve `partner_balance_ledger_120`, ikisi de diff=-4.321,00,
-- partner `7c91534e-...`); `partners.balance` (-2.465,90) VE 120.C-000001 ledger bakiyesi (-2.465,90) birbiriyle
-- ZATEN tutarlıydı — yalnızca eski `computed_balance` (1.855,10) yanlıştı. Düzeltme: `allocated` artık
-- `payments` tablosundan doğrudan (o partneriye ait, `direction='inbound'`, `status='posted'`) TÜM tahsilat
-- tutarını topluyor — `payment_allocations`'a bakmıyor (allocated+unallocated tam eşleşir).

WITH invoice_net AS (
  SELECT partner_id,
    SUM(CASE WHEN kind = 'sales' THEN grand_total_try WHEN kind = 'sales_return' THEN -grand_total_try ELSE 0 END) AS net
  FROM invoices
  WHERE status IN ('posted', 'partially_paid', 'paid') AND kind IN ('sales', 'sales_return')
  GROUP BY partner_id
),
allocated AS (
  -- Not (tur 7, ikinci düzeltme, CANLI OLARAK YAKALANDI): yalnızca `amount_try` yeterli değil — dövizli
  -- (ihracat) faturada `recordPayment` (packages/core/src/finance/payments.ts, satır ~185-206) tahsis
  -- edilen kısmın kur farkını AYRI bir yevmiye fişiyle (ref_type='payment', AYNI ref_id) 120 hesabına
  -- +fx_difference (debit−credit) net etkiyle ekliyor — bu, ana tahsilat fişinin (amount_try kadar kredi)
  -- yanında EK bir 120 hareketi. Canlı doğrulama: BioGrün Handels GmbH (`8ec92fa6-...`, EUR ihracat
  -- müşterisi), fatura kuru 37,20 / tahsilat kuru 38,50 — `PAY-2026-000010` amount_try=10.395,00,
  -- fx_difference=+351,00 (lehte). Eski formül yalnızca `amount_try`yi düşüyordu → computed=-351,00,
  -- gerçek bakiye (hem partners.balance hem 120 ledger) ise 0,00 (fatura 10.044,00 tam kapandı) — I9
  -- anında 2 ihlal verdi. Düzeltme: `amount_try - fx_difference` toplanıyor (fx_difference çıkarılınca
  -- net etki `-amount_try + fx_difference` olarak modele giriyor — kodun gerçek muhasebe etkisiyle birebir).
  SELECT p.partner_id, SUM(p.amount_try - p.fx_difference) AS amt
  FROM payments p
  WHERE p.status = 'posted' AND p.direction = 'inbound'
  GROUP BY p.partner_id
),
computed AS (
  SELECT p.id AS partner_id,
    COALESCE(invoice_net.net, 0) - COALESCE(allocated.amt, 0) AS computed_balance
  FROM partners p
  LEFT JOIN invoice_net ON invoice_net.partner_id = p.id
  LEFT JOIN allocated ON allocated.partner_id = p.id
  WHERE p.kind IN ('customer', 'both')
),
ledger_120 AS (
  SELECT p.id AS partner_id,
    COALESCE(SUM(CASE
      WHEN (jl.account_code = '120' OR jl.account_code LIKE '120.%')
        AND jl.ledger = 'VUK' AND je.status IN ('posted', 'reversed')
      THEN jl.debit - jl.credit ELSE 0
    END), 0) AS ledger_balance
  FROM partners p
  LEFT JOIN journal_lines jl ON jl.partner_id = p.id
  LEFT JOIN journal_entries je ON je.id = jl.entry_id
  WHERE p.kind IN ('customer', 'both')
  GROUP BY p.id
)

SELECT
  'I9' AS rule, 'partner_balance_field' AS entity, p.id::text AS id,
  c.computed_balance::numeric(18, 4) AS expected,
  p.balance::numeric(18, 4) AS actual,
  (p.balance - c.computed_balance)::numeric(18, 4) AS diff
FROM partners p
JOIN computed c ON c.partner_id = p.id
WHERE abs(p.balance - c.computed_balance) > 0

UNION ALL

SELECT
  'I9', 'partner_balance_ledger_120', c.partner_id::text,
  c.computed_balance::numeric(18, 4), l.ledger_balance::numeric(18, 4),
  (l.ledger_balance - c.computed_balance)::numeric(18, 4)
FROM computed c
JOIN ledger_120 l ON l.partner_id = c.partner_id
WHERE abs(l.ledger_balance - c.computed_balance) > 0

ORDER BY id;
