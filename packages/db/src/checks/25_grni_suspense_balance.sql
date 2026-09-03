-- I25 — 320.999 (Faturası Gelmemiş Alımlar / GRNI) bakiyesi = Σ (faturasız değerli mal kabul hareket
-- değerleri). postStockMove her değerli 'receipt' hareketinde 320.999'a alacak yazar (mal kabul karşılığı
-- borç: 150/151/152/153); alış faturası oluşunca (createPurchaseInvoiceFromReceipt) bu tutar
-- 320.999'dan 320.<tedarikçi>'ye aktarılır (320.999 borçlanır, kapanır). Bu yüzden 320.999'un net
-- (alacak − borç) bakiyesi HER ZAMAN, o ana kadar hiç alış faturası kesilmemiş mal kabullerin toplam
-- stok hareket değerine eşit olmalı — hem VUK hem UFRS'de (I23'ün tutar boyutu; I23 yalnızca
-- var/yok'u, bu kural TL tutarını doğrular).

WITH unbilled_receipt_value AS (
  SELECT COALESCE(SUM(sm.value), 0) AS total
  FROM receipts r
  JOIN stock_moves sm ON sm.ref_type = 'receipt' AND sm.ref_id = r.id AND sm.is_valued = true
  WHERE NOT EXISTS (
    SELECT 1 FROM invoices i WHERE i.kind = 'purchase' AND i.receipt_id = r.id AND i.status <> 'cancelled'
  )
),
ledger_320_999 AS (
  SELECT jl.ledger::text AS ledger, SUM(jl.credit - jl.debit) AS balance
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.entry_id
  WHERE jl.account_code = '320.999' AND je.status IN ('posted', 'reversed')
  GROUP BY jl.ledger
),
ledgers AS (SELECT unnest(ARRAY['VUK', 'UFRS']) AS ledger)

SELECT
  'I25' AS rule, 'grni_320_999_balance' AS entity, l.ledger AS id,
  urv.total::numeric(18, 4) AS expected,
  COALESCE(lb.balance, 0)::numeric(18, 4) AS actual,
  (COALESCE(lb.balance, 0) - urv.total)::numeric(18, 4) AS diff
FROM ledgers l
CROSS JOIN unbilled_receipt_value urv
LEFT JOIN ledger_320_999 lb ON lb.ledger = l.ledger
WHERE abs(COALESCE(lb.balance, 0) - urv.total) > 0

ORDER BY id;
