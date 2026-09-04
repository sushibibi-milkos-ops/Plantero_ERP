-- I17 — Audit kapsamı: son 24 saatte oluşturulan her kritik kayıt için audit_log satırı var
-- (withAudit sarmalayıcısı server action'larda otomatik yazar; kaynak burada değildir.)
-- Kapsam: kendi audit sütunları (created_at/created_by) olan, belge/hareket üreten kritik tablolar.
--
-- Tur 15, YENİ kapsam (P1, kök neden): `bank_transactions` ve `reconciliation_matches` daha önce
-- bu listede HİÇ yoktu. `packages/core/src/stock/ledger.ts::postStockMove` ve
-- `packages/core/src/accounting/journal.ts::postJournalEntry` HER çağrıda kendi audit satırını
-- CORE katmanında yazar (bu yüzden stock_moves/journal_entries seed'den bile %100 kapsanır) — ama
-- `packages/core/src/finance/bankReconciliation.ts::importStatement`/`runReconciliation` bunu hiç
-- yapmaz (dosyanın kendi tasarım sözleşmesi: "audit yalnızca çağıran katmanda üretilir", bkz.
-- `packages/db/src/seed/finance-payments.ts` satır ~166 yorumu). Çağıran katman (hem
-- `apps/web/src/modules/finance/actions.ts::runReconciliationAction` hem seed) bu toplu işlem için
-- TEK bir özet audit_log satırı yazıyor (`record_id = NULL`, "N hareket içe aktarıldı, M otomatik
-- uygulandı, K öneri" gibi) — her bir `bank_transactions`/`reconciliation_matches` SATIRI için AYRI
-- bir audit izi yok. Fresh seed'de doğrulandı: 8 bank_transactions'tan yalnızca 1'i (ignoreTransaction
-- ile elle işlenen), 13 reconciliation_matches'tan yalnızca 1'i (manuel onaylanan) kayıt-bazlı audit
-- satırına sahip — 7 bank_transaction (SEED-BT-001..007, `importStatement`'ın ürettiği tüm hareketler)
-- ve 12 reconciliation_match (3 auto_applied + 9 suggested/superseded, `runReconciliation`'ın ürettiği)
-- hiçbir `record_id`-eşleşen audit_log satırına sahip değil — yalnızca o toplu işlemin özet satırıyla
-- dolaylı olarak "kapsanıyor" (CLAUDE.md kural 5'in "audit satırı: tablo, KAYIT ID, eylem..." şartını
-- ihlal ediyor). Kayıt bazında düzeltme: `ignoreTransactionAction`/`approveMatchAction` gibi TEKİL
-- kullanıcı eylemleri kayıt-bazlı audit YAZAR (bkz. actions.ts) — ama `runReconciliation` içindeki
-- TOPLU üretim (importStatement'ın ürettiği bank_transactions + otomatik/öneri reconciliation_matches)
-- hiçbirini kapsamaz; bu yüzden fresh seed'de 8 bank_transaction'ın **8'i de** (SEED-BT-001..007
-- dahil TÜMÜ, ignoreTransaction gibi tekil bir kullanıcı eylemi hiç çağrılmadığından) ve 13
-- reconciliation_matches'tan 12'si (yalnızca elle onaylanan SEED-BT-005 istisna) kayıt-bazlı audit
-- satırından tamamen yoksun. Aynı seed dosyasındaki `payments`/`channel_settlements` (her ikisi de her satır için
-- ayrı `auditCreate(...)` çağrısıyla kayıt-bazlı) ile doğrudan tezat — tutarsız bir tasarım.
-- Düzeltme önerisi: `writeAudit`'i `postStockMove`/`postJournalEntry` örüntüsünde CORE katmanına
-- (`importStatement` her satır için, `runReconciliation`/`approveMatch` her oluşturduğu
-- `reconciliation_matches` satırı için) taşı; çağıran katmandaki tekil özet satırı KALDIRMA (ekstra
-- context için kalabilir) ama onu tek kanıt olarak bırakma.

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
  UNION ALL
  SELECT 'bank_transactions', id, created_at FROM bank_transactions WHERE created_at > now() - interval '24 hours'
  UNION ALL
  SELECT 'reconciliation_matches', id, created_at FROM reconciliation_matches WHERE created_at > now() - interval '24 hours'
  UNION ALL
  SELECT 'channel_settlements', id, created_at FROM channel_settlements WHERE created_at > now() - interval '24 hours'
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
