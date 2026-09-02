-- I17 — Audit kapsamı: son 24 saatte oluşturulan her kritik kayıt için audit_log satırı var
-- (withAudit sarmalayıcısı server action'larda otomatik yazar; kaynak burada değildir.)
-- Kapsam: kendi audit sütunları (created_at/created_by) olan, belge/hareket üreten kritik tablolar.

WITH recent_records AS (
  SELECT 'stock_moves' AS table_name, id, created_at FROM stock_moves WHERE created_at > now() - interval '24 hours'
  UNION ALL
  SELECT 'journal_entries', id, created_at FROM journal_entries WHERE created_at > now() - interval '24 hours'
  UNION ALL
  SELECT 'invoices', id, created_at FROM invoices WHERE created_at > now() - interval '24 hours'
  UNION ALL
  SELECT 'payments', id, created_at FROM payments WHERE created_at > now() - interval '24 hours'
  UNION ALL
  SELECT 'sales_orders', id, created_at FROM sales_orders WHERE created_at > now() - interval '24 hours'
  UNION ALL
  SELECT 'purchase_orders', id, created_at FROM purchase_orders WHERE created_at > now() - interval '24 hours'
  UNION ALL
  SELECT 'deliveries', id, created_at FROM deliveries WHERE created_at > now() - interval '24 hours'
  UNION ALL
  SELECT 'receipts', id, created_at FROM receipts WHERE created_at > now() - interval '24 hours'
  UNION ALL
  SELECT 'work_orders', id, created_at FROM work_orders WHERE created_at > now() - interval '24 hours'
  UNION ALL
  SELECT 'stock_counts', id, created_at FROM stock_counts WHERE created_at > now() - interval '24 hours'
  UNION ALL
  SELECT 'stock_lots', id, created_at FROM stock_lots WHERE created_at > now() - interval '24 hours'
  UNION ALL
  SELECT 'recalls', id, created_at FROM recalls WHERE created_at > now() - interval '24 hours'
  UNION ALL
  SELECT 'qc_checks', id, created_at FROM qc_checks WHERE created_at > now() - interval '24 hours'
  UNION ALL
  SELECT 'transfers', id, created_at FROM transfers WHERE created_at > now() - interval '24 hours'
  UNION ALL
  SELECT 'scraps', id, created_at FROM scraps WHERE created_at > now() - interval '24 hours'
)

SELECT
  'I17' AS rule, 'audit_missing' AS entity, (rr.table_name || '/' || rr.id::text) AS id,
  1::numeric(18, 4) AS expected, 0::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM recent_records rr
LEFT JOIN audit_log al
  ON al.table_name = rr.table_name
  AND al.record_id = rr.id::text
  AND al.action IN ('create', 'post')
  AND al.at BETWEEN rr.created_at - interval '5 minutes' AND rr.created_at + interval '24 hours'
WHERE al.id IS NULL

ORDER BY id;
