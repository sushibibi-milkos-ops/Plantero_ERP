-- I33 — Gelecek tarihli nakit olayı (tahsilat/ödeme/banka hareketi/yevmiye "bugünden ileri" postalanamaz)
--
-- Bulgu (tur 13, P0, kök neden): packages/db/src/seed/finance-payments.ts satır ~56
--   `paymentDate: addDays(invoice.dueDate, -2)` — tahsilat/ödeme tarihini faturanın VADE tarihine
--   göre ("vadeden 2 gün önce") hesaplıyor, bugünün tarihine göre DEĞİL. Standart 30 gün vadeli bir
--   faturanın (invoice_date = bugün, due_date = bugün+30) "vadeden 2 gün önce" tahsilatı da otomatik
--   olarak bugünden ~28 gün İLERİDE bir tarihe düşüyor — seed adı ("geçmişe dönük tahsilat/ödeme
--   dolgusu") bunun tam tersini vaat ediyor. Sonuç: fresh seed sonrası (CURRENT_DATE=2026-09-04)
--   `payments` tablosunda 12 satır (bkz. örnekler: PAY-2026-000011..000014, 000017..000019,
--   PAY-2026-000004/005/006/009/010) payment_date 2026-09-13..2026-10-20 arası — en uzağı bugünden
--   46 gün ileride; bunlara bağlı 26 `journal_entries` satırı (VUK+UFRS, hepsi status='posted') aynı
--   gelecek tarihle POSTALANMIŞ; bunlara bağlı `invoices.status` zaten 'paid'/'partially_paid' ve
--   `paid_amount` tam tutarla güncellenmiş — yani sistem BUGÜN, henüz gerçekleşmemiş (takvimde ileri
--   tarihli) bir tahsilat/ödemeyi zaten olmuş gibi gösteriyor; cari bakiye (I9/I18) ve nakit görünümü
--   bu yüzden "bugün" için yanlış iyimser. Ayrıca 5 `bank_transactions` satırı (SEED-BT-005/006/007
--   + INV-2026-000013/PINV-2026-000006 kaynaklı) aynı kökten tx_date bugünden ileri, 2'si
--   status='matched' (gerçekleşmemiş bir banka hareketi zaten "eşleşti" işaretli).
--
-- Düzeltme önerisi: `packages/db/src/seed/finance-payments.ts`'teki tarih formülü
--   `paymentDate = min(addDays(invoice.dueDate, -2), addDays(SEED_TODAY, -1))` gibi bugünü de dikkate
--   alan bir alt sınırla sınırlanmalı (yalnızca due_date < bugün olan faturalar için "vadeden 2 gün
--   önce tahsil edilmiş" kurgusu kullanılmalı; due_date bugün veya ileriyse ya tahsilat hiç
--   yaratılmamalı ya da tarih bugünün gerisinde ayrı bir mantıkla üretilmeli). Aynı disiplin canlı
--   `packages/core/src/finance/payments.ts::recordPayment` için de geçerli olmalı: `paymentDate`
--   girişi `CURRENT_DATE`'i aşarsa reddedilmeli (bugün itibarıyla henüz olmamış bir tahsilatın
--   "posted" olarak kaydedilmesi VUK/UFRS'in "işlemin gerçekleştiği tarihte kayıt" ilkesini ihlal
--   eder ve `partners.balance`/nakit tahmin ekranlarını bugün için yanlış gösterir).

SELECT 'I33' AS rule, 'payment_date_future' AS entity, p.id::text AS id,
       0::numeric(18, 4) AS expected, (p.payment_date - CURRENT_DATE)::numeric(18, 4) AS actual,
       (p.payment_date - CURRENT_DATE)::numeric(18, 4) AS diff
FROM payments p
WHERE p.payment_date > CURRENT_DATE

UNION ALL

SELECT 'I33', 'bank_transaction_tx_date_future', bt.id::text,
       0::numeric(18, 4), (bt.tx_date - CURRENT_DATE)::numeric(18, 4),
       (bt.tx_date - CURRENT_DATE)::numeric(18, 4)
FROM bank_transactions bt
WHERE bt.tx_date > CURRENT_DATE

UNION ALL

SELECT 'I33', 'journal_entry_date_future', je.id::text,
       0::numeric(18, 4), (je.entry_date - CURRENT_DATE)::numeric(18, 4),
       (je.entry_date - CURRENT_DATE)::numeric(18, 4)
FROM journal_entries je
WHERE je.entry_date > CURRENT_DATE
  AND je.status IN ('posted', 'reversed')

ORDER BY id;
