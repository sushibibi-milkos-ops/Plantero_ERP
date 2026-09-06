-- I13 — Kur farkı
--   a) dövizli fatura: grand_total_try = grand_total × exchange_rate
--   b) tahsilatta fx_difference = TEK faturaya ALLOCATE EDİLEN döviz tutarı × (tahsilat kuru − fatura
--      kuru); yalnızca tek faturaya tahsis edilmiş tahsilatlar için hesaplanabilir (varsayım — raporda
--      belirtilmiştir)
--   c) fx_difference ≠ 0 olan dövizli tahsilatın bir kur farkı fişi (646/656) olmalı
--
-- **Veri bütünlüğü turu 4 (Aşama-4 tur-4, veri-critic), P0, KIRMIZI → DÜZELTİLDİ (kontrolün KENDİ
-- formül hatası, CANLI OLARAK YAKALANDI — konteyneri eşzamanlı kullanan bir oturum gerçek `/muhasebe`
-- akışından `PAY-2026-000018` tahsilatını oluşturdu)**: eski (b) formülü `p.amount` (tahsilatın TAM
-- tutarı, tahsis edilsin edilmesin) × (tahsilat kuru − fatura kuru) kullanıyordu — ama
-- `packages/core/src/finance/payments.ts::recordPayment` (satır ~190-194) fx farkını yalnızca
-- FİİLEN O FATURAYA TAHSİS EDİLEN döviz tutarı (`allocatedNative`, `payment_allocations.amount`)
-- üzerinden hesaplıyor; kalan (tahsis edilmemiş/avans) kısım hiç kur farkı üretmiyor — mantıklı,
-- çünkü henüz hiçbir faturayı kapatmıyor. Eski formül yalnızca `unallocated_amount=0` (tam tahsis)
-- olan ödemelerde doğru sonuç veriyordu, kısmen tahsis edilmiş/fazla ödemede (avans) yanlış.
-- **Canlı kanıt**: `PAY-2026-000018` (EUR, `amount`=10.000.000,0000, kur=38,50 → `amount_try`=
-- 385.000.000,0000) yalnızca `INV-2026-000019`'a (EUR, `grand_total`=1.000,0000, kur=37,20)
-- `amount`=1.000,0000 (`amount_try`=37.200,0000) tahsis edilmiş — kalan 9.999.000,0000 EUR tamamen
-- tahsissiz (avans). Gerçek/kod tarafı doğru: `fxDifference` = 1.000×38,50 − 37.200,00 = 1.300,0000
-- (kayıtlı `payments.fx_difference` de tam bu). Eski SQL formülü `p.amount`(10.000.000)×(38,50−37,20)
-- = 13.000.000,0000 bekliyordu → **1 ihlal** (`payment_fx_difference_mismatch`, diff=−12.998.700,0000)
-- — gerçek bir muhasebe hatası DEĞİL, kontrolün "tek tahsis = tüm tutar o faturaya gitti" varsayımının
-- kısmi/avans tahsilatta çöküşü (I9'un Tur 7'deki aynı kök nedeniyle birebir aynı hata sınıfı).
-- **Düzeltme**: `single_alloc` CTE'si artık ilgili `payment_allocations.amount` (döviz cinsinden
-- FİİLEN tahsis edilen tutar) satırını da taşıyor, formül `p.amount` yerine bunu kullanıyor — tam
-- tahsis edilmiş ödemelerde (`allocated_amount = amount`) davranış DEĞİŞMEZ (regresyon yok), yalnızca
-- kısmi/avans tahsilatta artık doğru kıyaslanıyor. **Kök neden dosyası**: bu SQL'in kendisi
-- (`checks/13_fx.sql`) — `packages/core/src/finance/payments.ts` doğru, kontrol formülü eksikti.

SELECT
  'I13' AS rule, 'invoice_fx_conversion_mismatch' AS entity, i.id::text AS id,
  (i.grand_total * i.exchange_rate)::numeric(18, 4) AS expected,
  i.grand_total_try::numeric(18, 4) AS actual,
  (i.grand_total_try - (i.grand_total * i.exchange_rate))::numeric(18, 4) AS diff
FROM invoices i
WHERE i.currency <> 'TRY' AND abs(i.grand_total_try - (i.grand_total * i.exchange_rate)) > 0

UNION ALL

SELECT
  'I13', 'payment_fx_difference_mismatch', p.id::text,
  (single_alloc.alloc_amount * (p.exchange_rate - i.exchange_rate))::numeric(18, 4) AS expected,
  p.fx_difference::numeric(18, 4) AS actual,
  (p.fx_difference - (single_alloc.alloc_amount * (p.exchange_rate - i.exchange_rate)))::numeric(18, 4) AS diff
FROM payments p
JOIN (
  SELECT payment_id, MIN(invoice_id::text)::uuid AS invoice_id, MIN(amount) AS alloc_amount
  FROM payment_allocations
  GROUP BY payment_id
  HAVING COUNT(*) = 1
) single_alloc ON single_alloc.payment_id = p.id
JOIN invoices i ON i.id = single_alloc.invoice_id
WHERE p.currency <> 'TRY'
  AND abs(p.fx_difference - (single_alloc.alloc_amount * (p.exchange_rate - i.exchange_rate))) > 0

UNION ALL

SELECT
  'I13', 'payment_fx_missing_journal', p.id::text,
  1::numeric(18, 4), 0::numeric(18, 4), 1::numeric(18, 4)
FROM payments p
WHERE p.currency <> 'TRY' AND p.fx_difference <> 0 AND p.fx_journal_entry_id IS NULL

ORDER BY id;
