-- I12 — KDV
--   391 (Hesaplanan KDV) = Σ satış fatura line_vat (dönem bazında, VUK) − Σ satış İADE fatura line_vat
--   191 (İndirilecek KDV) = Σ alış fatura line_vat (dönem bazında, VUK) − Σ alış İADE fatura line_vat
--
-- **Tur 7 (veri-critic), P0, KIRMIZI, KÖK NEDEN, kontrolün KENDİ formül hatası — CANLI OLARAK
-- KANITLANDI**: eski formül yalnızca `i.kind = 'sales'`/`'purchase'` satırlarını sayıyordu,
-- `kind='sales_return'`/`'purchase_return'` (iade/credit note — `packages/core/src/accounting/
-- invoices.ts::createCreditNote`, `/muhasebe/faturalar/[id]` "İade faturası kes" düğmesi,
-- izin: `accounting.post`) TAMAMEN HARİÇ TUTULUYORDU. Ama `createCreditNote` gerçek 391/191 hesabına
-- (ARCHITECTURE §7: "Satış iade: 610 + 391 borç / 120.cari alacak") gerçekten dokunuyor — bir iade
-- faturası kesildiği an `journal_lines`'daki 391/191 bakiyesi (ledger_391/ledger_191, bu dosyanın
-- "actual" tarafı) değişiyor ama eski `sales_vat`/`purchase_vat` CTE'leri (bu dosyanın "expected"
-- tarafı) `kind='sales_return'`/`'purchase_return'` satırlarını hiç görmediğinden HİÇ değişmiyordu —
-- yapısal bir kalıcı sapma. `packages/db/src/seed/accounting-docs.ts`'in kendi dosya-başı yorumu
-- bunu zaten itiraf ediyordu ("`createCreditNote` BİLEREK burada ÇAĞRILMAZ ... her iade faturası
-- I12'yi kırar") — yani servis (`createCreditNote`) DOĞRU, sorun KONTROLÜN KENDİSİYDİ (I21'in Tur
-- 4'teki "checks dosyası dondurulmuş sanılıp servis ona uydurulmuş/hiç egzersiz edilmemiş" örüntüsünün
-- burdaki hali — seed bilinçli olarak bu canlı yolu hiç tetiklemeyerek db:check'i yeşil tutuyordu).
-- **Canlı doğrulama**: fresh seed'deki `INV-2026-000001` (vat_total=40,3960 TL) üzerinde
-- `createCreditNote` rollback'li bir transaction içinde çağrıldı → AYNI transaction'da eski
-- (düzeltilmeden önceki) I12 SQL'i çalıştırıldığında **1 ihlal** verdi (`vat_391_output`,
-- period=2026-09, expected=38,8119, actual=-1,5841, diff=-40,3960 — tam olarak iade edilen faturanın
-- KDV'si kadar sapma) — hiçbir kalıcı veri yazılmadan transaction sonunda geri alındı. Düzeltme
-- sonrası (aşağıdaki formül) aynı egzersiz 0 ihlal veriyor.
-- **Kök neden dosyası**: `packages/db/src/checks/12_vat.sql` (bu dosya) — servis kodunda düzeltme
-- gerekmiyor, yalnızca kontrolün "expected" formülü iade faturalarını hiç saymıyordu.

WITH sales_vat AS (
  SELECT to_char(i.invoice_date, 'YYYY-MM') AS period,
    SUM(CASE WHEN i.kind = 'sales' THEN il.line_vat WHEN i.kind = 'sales_return' THEN -il.line_vat ELSE 0 END) AS vat
  FROM invoice_lines il
  JOIN invoices i ON i.id = il.invoice_id
  WHERE i.kind IN ('sales', 'sales_return') AND i.status IN ('posted', 'partially_paid', 'paid')
  GROUP BY 1
),
purchase_vat AS (
  SELECT to_char(i.invoice_date, 'YYYY-MM') AS period,
    SUM(CASE WHEN i.kind = 'purchase' THEN il.line_vat WHEN i.kind = 'purchase_return' THEN -il.line_vat ELSE 0 END) AS vat
  FROM invoice_lines il
  JOIN invoices i ON i.id = il.invoice_id
  WHERE i.kind IN ('purchase', 'purchase_return') AND i.status IN ('posted', 'partially_paid', 'paid')
  GROUP BY 1
),
ledger_391 AS (
  SELECT to_char(je.entry_date, 'YYYY-MM') AS period, SUM(jl.credit - jl.debit) AS bal
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.entry_id
  WHERE jl.account_code = '391' AND je.ledger = 'VUK' AND je.status IN ('posted', 'reversed')
  GROUP BY 1
),
ledger_191 AS (
  SELECT to_char(je.entry_date, 'YYYY-MM') AS period, SUM(jl.debit - jl.credit) AS bal
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.entry_id
  WHERE jl.account_code = '191' AND je.ledger = 'VUK' AND je.status IN ('posted', 'reversed')
  GROUP BY 1
)

SELECT
  'I12' AS rule, 'vat_391_output' AS entity, COALESCE(sv.period, l3.period) AS id,
  COALESCE(sv.vat, 0)::numeric(18, 4) AS expected,
  COALESCE(l3.bal, 0)::numeric(18, 4) AS actual,
  (COALESCE(l3.bal, 0) - COALESCE(sv.vat, 0))::numeric(18, 4) AS diff
FROM sales_vat sv
FULL OUTER JOIN ledger_391 l3 ON l3.period = sv.period
WHERE abs(COALESCE(l3.bal, 0) - COALESCE(sv.vat, 0)) > 0

UNION ALL

SELECT
  'I12', 'vat_191_input', COALESCE(pv.period, l1.period),
  COALESCE(pv.vat, 0)::numeric(18, 4), COALESCE(l1.bal, 0)::numeric(18, 4),
  (COALESCE(l1.bal, 0) - COALESCE(pv.vat, 0))::numeric(18, 4)
FROM purchase_vat pv
FULL OUTER JOIN ledger_191 l1 ON l1.period = pv.period
WHERE abs(COALESCE(l1.bal, 0) - COALESCE(pv.vat, 0)) > 0

ORDER BY id;
