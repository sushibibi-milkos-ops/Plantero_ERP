-- I49 — Onay kuyruğu (approvals) durum tutarlılığı.
--
-- `approvals` tüm modüllerin (satın alma taslağı, sayım farkı, tahsilat hatırlatma, mutabakat
-- önerisi, reçete devri, fiyat değişikliği) TEK karar kuyruğudur (`/onaylar`,
-- packages/core/src/notifications/approvals/dispatch.ts). Bu kural onun kendi iç tutarlılığını
-- (karar alanları) ve en önemlisi KARARIN, işaret ettiği belgeye (`refTable`/`refId`) GERÇEKTEN
-- yansıdığını doğrular — bir onay kaydının "rejected" olması, altındaki belgenin sonsuza kadar
-- ara bir durumda (`review` vb.) asılı kalmasını MEŞRU KILMAZ.
--
-- Alt kurallar:
--   (a) status IN ('approved','rejected') ⇒ decided_by VE decided_at dolu olmalı (karar izi kaybolmaz).
--   (b) status='pending' ⇒ decided_by VE decided_at boş olmalı (henüz karar verilmemiş bir kayıt
--       karar sahibi taşıyamaz — ekranda "kim karar verdi" yanlış görünür).
--   (c) kind='count_variance' AND status='rejected' ⇒ ilişkili stock_counts.status='cancelled'.
--       CANLI OLARAK KANITLANDI (Tur 10, veri-critic): `notifications/approvals/dispatch.ts::rejectQueueItem`
--       'count_variance' dalı YALNIZCA approvals satırını 'rejected' yapıyor, stock_counts'a HİÇ
--       dokunmuyor (approve dalı ise `approveCount()` çağırıp count'u 'approved'a taşıyor — asimetrik).
--       `stock/counts.ts::approveCount` da approval.status='rejected' iken yeniden çağrılırsa
--       `COUNT_APPROVAL_REJECTED` hatası fırlatıyor (satır ~145) — yani sayım kalıcı olarak 'review'de
--       kilitli kalıyor, `count_status` enum'ındaki 'cancelled' değerine ulaşacak HİÇBİR kod yolu yok
--       (codebase'te `cancelCount` diye bir fonksiyon da yok). Canlı egzersiz: fresh seed üzerinde
--       `createCount`→`snapshotCount`→(sistem miktarının +100.000 üzerinde sayım gir, eşiği aş)→
--       `submitReview`→`approveCount` (pending_approval döndü) → `rejectQueueItem(tx,'count_variance',
--       approvalId,...)` çağrıldı (rollback'li transaction) → `stock_counts.status` REJECT SONRASI HÂLÂ
--       'review' (beklenen: 'cancelled'), `approvals.status='rejected'` doğru yazılmıştı. Kök neden
--       dosyası: `packages/core/src/notifications/approvals/dispatch.ts`, fonksiyon `rejectQueueItem`,
--       `case 'count_variance'` dalı. Düzeltme önerisi: aynı dalda `stock_counts.status`'ü 'cancelled'a
--       çeken bir güncelleme ekle (ve `stock/counts.ts`'e gerçek bir `cancelCount()` yardımcı fonksiyonu
--       ekleyip `approveCount`'un 'review' önkoşulunu bu yeni terminal durumla tutarlı tut).
--   (d) kind='purchase_draft' AND status='approved' ⇒ ilişkili purchase_orders.status
--       NOT IN ('draft','ai_draft','pending_approval') (onay, siparişi ileri aşamaya taşımış olmalı).
--   (e) kind='purchase_draft' AND status='rejected' ⇒ ilişkili purchase_orders.status='rejected'.

SELECT 'I49' AS rule, 'approval_decided_fields_missing' AS entity, a.id::text AS id,
  1::numeric(18, 4) AS expected, 0::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM approvals a
WHERE a.status IN ('approved', 'rejected')
  AND (a.decided_by IS NULL OR a.decided_at IS NULL)

UNION ALL

SELECT 'I49', 'approval_pending_has_decision', a.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM approvals a
WHERE a.status = 'pending'
  AND (a.decided_by IS NOT NULL OR a.decided_at IS NOT NULL)

UNION ALL

SELECT 'I49', 'count_variance_rejected_not_cancelled', a.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM approvals a
JOIN stock_counts sc ON sc.id = a.ref_id
WHERE a.kind = 'count_variance'
  AND a.ref_table = 'stock_counts'
  AND a.status = 'rejected'
  AND sc.status::text <> 'cancelled'

UNION ALL

SELECT 'I49', 'purchase_draft_approved_not_advanced', a.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM approvals a
JOIN purchase_orders po ON po.id = a.ref_id
WHERE a.kind = 'purchase_draft'
  AND a.ref_table = 'purchase_orders'
  AND a.status = 'approved'
  AND po.status::text IN ('draft', 'ai_draft', 'pending_approval')

UNION ALL

SELECT 'I49', 'purchase_draft_rejected_mismatch', a.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM approvals a
JOIN purchase_orders po ON po.id = a.ref_id
WHERE a.kind = 'purchase_draft'
  AND a.ref_table = 'purchase_orders'
  AND a.status = 'rejected'
  AND po.status::text <> 'rejected'

ORDER BY id;
