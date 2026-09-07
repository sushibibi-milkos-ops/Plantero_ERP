-- I6 — Lot ileri izlenebilirlik
--   a) lot takipli üründe her delivery_lines satırının lot_id'si dolu
--   b) o lot ASLA 'quarantine'/'rejected' durumunda SEVK EDİLMEMİŞ olmalı (CLAUDE.md kural 2 — yalnızca
--      karantina/red için forward-block; bu ikisi lotun HİÇBİR ZAMAN meşru "released" penceresi olmadığı
--      giriş-zamanlı durumlardır, dolayısıyla bu statülerdeki bir lotun geçmişte sevk edilmiş olması her
--      zaman bir ihlaldir).
--      'recalled'/'expired' KASITLI OLARAK bu listede DEĞİL: bunlar lot zaten meşru şekilde 'released'
--      iken sevk/tüketim geçmişi oluştuktan SONRA geriye dönük atanan terminal durumlardır (geri çağırma
--      tam olarak "zaten sevk edilmiş" bir lotu hedefler — packages/core/src/quality/recall.ts initiate()).
--      Bu geçmiş kayıtları burada `<> 'released'` ile kapsamak recall/SKT sonrası HER ZAMAN yanlış-pozitif
--      üretir (bkz. Tur — canlı doğrulama: RC-2026-000001 initiate() sonrası 3 satır burada patlıyordu).
--      Recalled/expired lotun MEVCUT konumu I27 (anlık usage kontrolü) ile, recall SONRASI oluşan YENİ
--      (meşru olmayan) hareketler ise I40 (moved_at > lot.updated_at zaman damgası) ile ayrı ayrı kapsanır.
--   c) Σ tüketim + Σ sevk + Σ fire (iş emri + genel) + eldeki stok ≤ initial_qty (+ sayım fazlası)
--
-- Veri bütünlüğü turu 7 (veri-critic), YENİ alt terim (P1, kök neden — kontrolün KENDİ formül eksikliği,
-- CANLI OLARAK KANITLANDI): `packages/core/src/accounting/invoices.ts::createCreditNote` (isSales dalı,
-- I50 kapatma yolu, Tur 11) satılmış/sevk edilmiş bir lotun iadesinde `postStockMove(kind:'return_in')`
-- ile malı FİZİKSEL olarak müşteri sanal lokasyonundan geri asıl depoya taşıyor — bu ARTAN `oh.qty`
-- (eldeki) doğru bir davranış. Ama `d` terimi (`delivery_lines.picked_qty`) o sevkiyatın TARİHSEL kaydı
-- olduğundan iade sonrasında da HİÇ azalmıyor (haklı olarak — "bu lot bir keresinde bu miktar sevk
-- edildi" gerçeği değişmez). Sonuç: aynı fiziksel birimler hem `d`'de (tarihsel sevkiyat) hem `oh`'da
-- (iade sonrası yeniden eldeki) sayılıyor — iade edilen miktar kadar ÇİFT SAYIM oluşuyor ve toplam
-- `initial_qty`'yi iade miktarı kadar aşıyor. `recall_return` (geri çağırmada müşteriden fiziksel iade —
-- bkz. I57) de AYNI sınıf bir "customer virtualUsage'dan içeri" hareketi (`stock/ledger.ts` VIRTUAL_USAGE
-- eşlemesi, `recall_return: {direction:'in', virtualUsage:['customer']}`) olduğundan aynı çift sayıma
-- yol açar (bugün dormant — I57 düzeltilene kadar hiç üretilmiyor, ama üretildiği an aynı sınıf hata
-- oluşur). Canlı doğrulama (rollback'li transaction, fresh seed, `INV-2026-000001` üzerinde
-- `createCreditNote` doğrudan çağrıldı): iade sonrası AYNI transaction'da eski formül **2 ihlal**
-- verdi (`lot_qty_exceeds_initial`, diff=+6,0000 ve +12,0000 — tam iade edilen miktarlar kadar).
-- Düzeltme: her iki "customer'dan içeri" hareket türünü (`return_in`, `recall_return`) toplamdan
-- ÇIKARAN yeni bir `ret` CTE'si eklendi — bu miktarlar zaten `d` (tarihsel sevkiyat) tarafında bir kez
-- sayılmıştır, `oh`'da ikinci kez sayılmamalı. Aynı egzersiz düzeltme SONRASI tekrarlandığında 0 ihlal.
-- Kök neden dosyası: `packages/db/src/checks/06_lot_forward.sql`'in kendisi (servis kodu —
-- `createCreditNote`'un fiziksel iade mantığı — baştan beri doğruydu, yalnızca bu kontrolün formülü
-- iade senaryosunu hiç hesaba katmıyordu).

SELECT
  'I6' AS rule, 'delivery_line_missing_lot' AS entity, dl.id::text AS id,
  1::numeric(18, 4) AS expected, 0::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM delivery_lines dl
JOIN products p ON p.id = dl.product_id
JOIN deliveries d ON d.id = dl.delivery_id
WHERE p.is_lot_tracked = true AND dl.lot_id IS NULL
  -- taslak (draft) irsaliye satırları henüz rezerve edilmemiş olabilir (stok/SKT yetersizliği);
  -- bu kural yalnızca rezervasyon/sevkiyat akışına girmiş satırları kapsar
  AND d.status IN ('reserved', 'picking', 'picked', 'shipped', 'delivered')

UNION ALL

SELECT
  'I6', 'delivery_line_lot_not_released', dl.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM delivery_lines dl
JOIN stock_lots l ON l.id = dl.lot_id
WHERE l.status IN ('quarantine', 'rejected')

UNION ALL

SELECT
  'I6', 'lot_qty_exceeds_initial', l.id::text,
  l.initial_qty::numeric(18, 4) AS expected,
  (COALESCE(c.qty, 0) + COALESCE(d.qty, 0) + COALESCE(s.qty, 0) + COALESCE(ws.qty, 0) + COALESCE(oh.qty, 0) - COALESCE(cg.qty, 0) - COALESCE(ret.qty, 0))::numeric(18, 4) AS actual,
  ((COALESCE(c.qty, 0) + COALESCE(d.qty, 0) + COALESCE(s.qty, 0) + COALESCE(ws.qty, 0) + COALESCE(oh.qty, 0) - COALESCE(cg.qty, 0) - COALESCE(ret.qty, 0)) - l.initial_qty)::numeric(18, 4) AS diff
FROM stock_lots l
LEFT JOIN (SELECT lot_id, SUM(qty) AS qty FROM work_order_consumptions GROUP BY lot_id) c ON c.lot_id = l.id
LEFT JOIN (SELECT lot_id, SUM(picked_qty) AS qty FROM delivery_lines WHERE lot_id IS NOT NULL GROUP BY lot_id) d ON d.lot_id = l.id
LEFT JOIN (SELECT lot_id, SUM(qty) AS qty FROM scraps WHERE lot_id IS NOT NULL GROUP BY lot_id) s ON s.lot_id = l.id
LEFT JOIN (SELECT lot_id, SUM(qty) AS qty FROM work_order_scraps WHERE lot_id IS NOT NULL GROUP BY lot_id) ws ON ws.lot_id = l.id
LEFT JOIN (SELECT lot_id, SUM(qty) AS qty FROM stock_quants WHERE lot_id IS NOT NULL GROUP BY lot_id) oh ON oh.lot_id = l.id
LEFT JOIN (SELECT lot_id, SUM(qty) AS qty FROM stock_moves WHERE kind = 'count_gain' AND lot_id IS NOT NULL GROUP BY lot_id) cg ON cg.lot_id = l.id
LEFT JOIN (SELECT lot_id, SUM(qty) AS qty FROM stock_moves WHERE kind IN ('return_in', 'recall_return') AND lot_id IS NOT NULL GROUP BY lot_id) ret ON ret.lot_id = l.id
WHERE (COALESCE(c.qty, 0) + COALESCE(d.qty, 0) + COALESCE(s.qty, 0) + COALESCE(ws.qty, 0) + COALESCE(oh.qty, 0) - COALESCE(cg.qty, 0) - COALESCE(ret.qty, 0)) - l.initial_qty > 0

ORDER BY id;
