-- I1 — Envanter değeri = hesap bakiyesi (VUK ve UFRS ayrı ayrı)
-- Σ(stock_quants.qty × lot.unit_cost | product.average_cost) [ürün tipi kırılımı, hesap koduna göre]
--   = 150/151/152/153 hesap bakiyeleri (getAccountBalance ile aynı yöntem: posted+reversed, alt hesaplar dahil)
--
-- Kapsam: yalnızca fiziksel (usage in internal/quarantine/rejected/transit) lokasyonlardaki quant'lar.
-- Hesap eşlemesi (packages/core/src/accounting/mapping.ts — INVENTORY_ACCOUNT_BY_TYPE ile birebir):
--   raw_material→150, packaging→150, semi_finished→151, finished→152, equipment/fixed_asset/service→153
--   ürün kartında inventory_account_code doluysa o öncelikli.
-- Fiziksel envanter değeri ledger'dan bağımsızdır (aynı fiziksel stok) — bu yüzden her iki defterde de
-- aynı beklenen tutarla karşılaştırılır.

WITH lot_value AS (
  SELECT
    sq.id AS quant_id,
    COALESCE(
      NULLIF(p.inventory_account_code, ''),
      CASE p.type
        WHEN 'raw_material' THEN '150'
        WHEN 'packaging' THEN '150'
        WHEN 'semi_finished' THEN '151'
        WHEN 'finished' THEN '152'
        WHEN 'equipment' THEN '153'
        WHEN 'fixed_asset' THEN '153'
        WHEN 'service' THEN '153'
        ELSE '153'
      END
    ) AS account_code,
    sq.qty * COALESCE(l.unit_cost, p.average_cost) AS value
  FROM stock_quants sq
  JOIN products p ON p.id = sq.product_id
  JOIN locations loc ON loc.id = sq.location_id
  LEFT JOIN stock_lots l ON l.id = sq.lot_id
  WHERE loc.usage IN ('internal', 'quarantine', 'rejected', 'transit')
    AND sq.qty <> 0
),
inv_by_account AS (
  SELECT account_code, SUM(value) AS inventory_value
  FROM lot_value
  WHERE account_code IS NOT NULL
  GROUP BY account_code
),
-- Envanter benzeri (15X) hesaplara yapılmış tüm postalamaları da hesaba dahil et: envanteri olmayan
-- ama 15X hesabına bakiyesi olan bir hesap da ihlal olarak yakalanmalı (yetim kayıt).
journal_inventory_accounts AS (
  SELECT DISTINCT jl.account_code
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.entry_id
  WHERE je.status IN ('posted', 'reversed')
    AND jl.account_code ~ '^15[0-9](\.|$)'
),
accounts_all AS (
  SELECT account_code FROM inv_by_account
  UNION
  SELECT account_code FROM journal_inventory_accounts
),
ledgers AS (
  SELECT unnest(ARRAY['VUK', 'UFRS']) AS ledger
),
combos AS (
  SELECT a.account_code, l.ledger FROM accounts_all a CROSS JOIN ledgers l
),
ledger_balance AS (
  SELECT c.account_code, c.ledger,
    COALESCE((
      SELECT SUM(jl.debit - jl.credit)
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.entry_id
      WHERE je.status IN ('posted', 'reversed')
        AND jl.ledger::text = c.ledger
        AND (jl.account_code = c.account_code OR jl.account_code LIKE c.account_code || '.%')
    ), 0) AS balance
  FROM combos c
)
SELECT
  'I1' AS rule,
  'account' AS entity,
  (c.account_code || '/' || c.ledger) AS id,
  COALESCE(i.inventory_value, 0)::numeric(18, 4) AS expected,
  b.balance::numeric(18, 4) AS actual,
  (b.balance - COALESCE(i.inventory_value, 0))::numeric(18, 4) AS diff
FROM combos c
LEFT JOIN inv_by_account i ON i.account_code = c.account_code
JOIN ledger_balance b ON b.account_code = c.account_code AND b.ledger = c.ledger
WHERE abs(b.balance - COALESCE(i.inventory_value, 0)) > 0
ORDER BY id;
