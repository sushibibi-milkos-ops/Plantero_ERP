-- I29 — Mutabakat kaydı bütünlüğü (I11'in TERSİ yönü)
--   I11 şunu doğrular: bt.status='matched' ⇒ onaylı/otomatik bir reconciliation_matches VE payment/journal var.
--   Bu kural TERSİNİ doğrular: reconciliation_matches.status IN ('approved','auto_applied') ⇒
--     a) payment_id dolu olmalı (bu status'ün TANIMI GEREĞİ bir tahsilat/ödeme fişi üretilmiş olmalıdır —
--        packages/core/src/finance/bankReconciliation.ts içindeki tek "gerçek" akış budur: runReconciliation/
--        approveMatch/manualMatch her zaman applyInvoiceAllocation → recordPayment çağırır, sonra status'u
--        'auto_applied'/'approved' yapar ve bt.status'u 'matched' işaretler — payment_id'siz bu status asla
--        üretilmemelidir)
--     b) bağlı bank_transactions satırı status='matched' olmalı (aksi halde hareket hâlâ 'suggested'/'unmatched'
--        görünür ama bir "onaylanmış" eşleşmesi varmış gibi görünen tutarsız bir durumdur)
--   BULGU (tur 10, kök neden): `apps/worker/src/jobs/reconciliationNightly.ts` (cron: 02:00, `queues.ts` içinde
--   kayıtlı, ayrı bir AI eşleştirme yolu — `packages/ai` `matchBankTransaction`) yüksek güvenli eşleşmeler için
--   DOĞRUDAN `reconciliation_matches` satırı `status: 'auto_applied'` ile ekliyor AMA hiçbir zaman `recordPayment`
--   çağırmıyor (paymentId hiç set edilmiyor) VE `bank_transactions.status`'u HER ZAMAN 'suggested' bırakıyor
--   (autoOk olsa bile) — bunun yerine ayrı bir `approvals` (kind='reconciliation') satırı ekliyor ki bu satırı
--   tüketen/onaya bağlayan HİÇBİR kod yok (`apps/web` içinde `approvals` kind='reconciliation' okuyan tek bir
--   satır yok). Yani bu worker gerçekten çalışırsa (kayıtlı cron), `packages/core/src/finance/bankReconciliation.ts`
--   ile AYNI ANLAMA gelen (`status='auto_applied'`) ama TAMAMEN FARKLI bir garantiye sahip (fişsiz, ödemesiz,
--   bt hâlâ eşleşmemiş görünüyor) satırlar üretebilir — I11 bunu YAKALAMAZ çünkü I11 yalnızca bt.status='matched'
--   olan satırları kontrol ediyor (burada bt.status hiç 'matched' olmuyor). Fresh seed üzerinde 0 ihlal (seed
--   yalnızca `packages/core` akışını kullanıyor, worker hiç çalıştırılmıyor) — bu kural gelecekteki bir
--   regresyona/worker'ın canlıya alınmasına karşı kalıcı koruma.
-- Düzeltme önerisi: `reconciliationNightly.ts`'i ya (a) `packages/core/src/finance/bankReconciliation.ts::
--   runReconciliation`'ı ÇAĞIRACAK şekilde yeniden yaz (tek gerçek akış), ya da (b) auto-apply DAVRANIŞINI
--   tamamen kaldır — yalnızca 'suggested' üret (bt.status zaten doğru set ediliyor), gerçek postalamayı
--   `/finans/banka` onay ekranındaki `approveMatch`'e bırak.

SELECT
  'I29' AS rule, 'reconciliation_match_missing_payment' AS entity, rm.id::text AS id,
  1::numeric(18, 4) AS expected, 0::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM reconciliation_matches rm
WHERE rm.status IN ('approved', 'auto_applied') AND rm.payment_id IS NULL

UNION ALL

SELECT
  'I29', 'reconciliation_match_bank_tx_not_matched', rm.id::text,
  1::numeric(18, 4), 0::numeric(18, 4), 1::numeric(18, 4)
FROM reconciliation_matches rm
JOIN bank_transactions bt ON bt.id = rm.bank_transaction_id
WHERE rm.status IN ('approved', 'auto_applied') AND bt.status <> 'matched'

ORDER BY id;
