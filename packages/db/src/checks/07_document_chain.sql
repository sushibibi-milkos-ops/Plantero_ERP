-- I7 — Belge zinciri: document_links ile kaynağa bağlılık
--   a) delivery → sales_order bağı var
--   b) satış faturası → delivery|sales_order bağı var
--   c) payment_allocation → invoice bağı (payment → invoice document_links) var
--   d) origin='manual' olmayan hiçbir indekslenmiş belge zincirsiz kalamaz (genel tarama)

SELECT
  'I7' AS rule, 'delivery_missing_link' AS entity, d.id::text AS id,
  1::numeric(18, 4) AS expected, 0::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM deliveries d
LEFT JOIN document_links dl
  ON dl.target_type = 'delivery' AND dl.target_id = d.id AND dl.source_type = 'sales_order'
WHERE d.origin <> 'manual' AND dl.id IS NULL

UNION ALL

SELECT
  'I7', 'sales_invoice_missing_link', i.id::text,
  1::numeric(18, 4), 0::numeric(18, 4), 1::numeric(18, 4)
FROM invoices i
LEFT JOIN document_links dl
  ON dl.target_type = 'invoice' AND dl.target_id = i.id AND dl.source_type IN ('delivery', 'sales_order')
WHERE i.kind = 'sales' AND i.origin <> 'manual' AND dl.id IS NULL

UNION ALL

SELECT
  'I7', 'payment_allocation_missing_link', pa.id::text,
  1::numeric(18, 4), 0::numeric(18, 4), 1::numeric(18, 4)
FROM payment_allocations pa
JOIN payments p ON p.id = pa.payment_id
LEFT JOIN document_links dl
  ON dl.source_type = 'payment' AND dl.source_id = pa.payment_id
  AND dl.target_type = 'invoice' AND dl.target_id = pa.invoice_id
WHERE p.origin <> 'manual' AND dl.id IS NULL

UNION ALL

SELECT
  'I7', 'document_missing_source_link', (di.type::text || '/' || di.record_id::text) AS id,
  1::numeric(18, 4), 0::numeric(18, 4), 1::numeric(18, 4)
FROM document_index di
LEFT JOIN document_links dl ON dl.target_type = di.type AND dl.target_id = di.record_id
WHERE di.origin <> 'manual' AND dl.id IS NULL

ORDER BY id;
