-- I56 — İhracat sevkiyatı ↔ fatura belge bağının SİMETRİSİ (mandate #5 "belge zinciri" — bir bağ
-- iki taraftan da aynı hedefi göstermeli) + `linkInvoice`'ın hiçbir durum (status) koruması olmaması.
--
-- `packages/core/src/export/shipments.ts::linkInvoice` (satır ~369-393):
--   1. `assertStatus` ÇAĞIRMAZ — dosyanın kendi `cancelShipment` yorumunda da itiraf edildiği gibi
--      ("linkInvoice'ın kendi assertStatus kısıtı olmadığından") 'draft'/'packing'/'customs' dahil HER
--      durumdaki bir sevkiyata fatura bağlanabilir; UI (`shipment-actions.tsx`) düğmeyi yalnızca
--      status IN ('shipped','delivered') iken gösterir ama bu yalnızca istemci tarafı bir kısıt —
--      server action (`export/actions.ts::linkInvoiceAction`) veya core'u doğrudan çağıran hiçbir kod
--      yolu bunu engellemiyor.
--   2. `s.invoiceId` ZATEN DOLUYSA bunu hiç kontrol etmeden ÜZERİNE YAZAR: `exportShipments.invoiceId`
--      yeni faturaya güncellenir, ESKİ faturanın (`invoiceId` eskiden neyse) `exportShipmentId`'si HİÇ
--      temizlenmez — `cancelShipment`in (I44) yaptığı simetrik temizleme burada YOK. Sonuç: eski fatura
--      hâlâ `exportShipmentId` ile bu sevkiyata işaret eder ("bu fatura hâlâ bu sevkiyatla takip
--      ediliyor" YALANI) ama sevkiyat artık YENİ faturayı gösterir — iki fatura da aynı sevkiyata
--      işaret eder (simetrik OLMAYAN 1:1), VE `document_links`'te sevkiyattan HER İKİ faturaya da
--      (eskisi dahil) birer satır kalır — hangisinin güncel olduğunu ayırt eden hiçbir alan yok.
--
-- Bu, tek bir sipariş ikinci kez (kısmi) faturalandığında GERÇEKTEN oluşabilir (bkz. I8/I23 —
-- `createInvoiceFromDelivery`/`FromOrder` bir `salesOrderId` için birden fazla fatura üretebilir,
-- partial invoicing zaten desteklenen bir iş akışı) — egzotik bir veri bozulması değildir.
--
-- **CANLI OLARAK KANITLANDI** (veri-critic, rollback'li transaction, packages/core'dan doğrudan,
-- hiçbir kalıcı veri değişmedi): fresh seed'deki `EXP-2026-000004` (status='packing', invoiceId=NULL,
-- salesOrderId=`9c9bc865-...`) üzerinde `linkInvoice(shipment, INV-2026-000019)` çağrıldı → durum
-- HÂLÂ 'packing' iken (yalnızca UI'nin izin verdiği 'shipped'/'delivered' değil) başarıyla bağlandı
-- (`invoiceId` doldu). Ardından AYNI `salesOrderId`'ye sahip ikinci bir fatura (`INV-PROBE-I56`,
-- gerçek partial-invoicing senaryosunu simüle eden geçici bir satır) eklenip `linkInvoice` İKİNCİ KEZ
-- çağrıldı → sonuç: `export_shipments.invoice_id` = yeni fatura, AMA `INV-2026-000019.export_shipment_id`
-- HÂLÂ aynı sevkiyatı gösteriyor (temizlenmedi) — `document_links`'te sevkiyattan HER İKİ faturaya
-- (eski + yeni) birer satır kaldı. Test verisi (1 invoices satırı) rollback ile geri alındı,
-- `pnpm db:reset` sonrası kalıcı veri değişmedi; fresh seed 0 ihlal (henüz hiçbir sevkiyat ikinci kez
-- fatura bağlamadı) — bu kural şu an saf bir regresyon güvenlik ağıdır.
--
-- Kök neden dosyası: `packages/core/src/export/shipments.ts::linkInvoice`.
-- Düzeltme önerisi: (a) fonksiyonun başına `assertStatus(s, ['shipped', 'delivered'])` ekle (UI'nin
-- zaten dayattığı kuralı core'a da taşı — CLAUDE.md "tek yazma noktası" ilkesiyle uyumlu, UI kısıtı
-- güvenilir tek kaynak olmamalı); (b) `s.invoiceId` doluysa VE yeni `invoiceId`'den farklıysa, ESKİ
-- faturanın `exportShipmentId`'sini `null`'a çekmeden devam etme — `cancelShipment`in I44 düzeltmesinde
-- kurduğu simetrik temizleme örüntüsünü burada da uygula (`tx.update(invoices).set({exportShipmentId:
-- null}).where(eq(invoices.id, s.invoiceId))` yeni bağlamadan önce); (c) ya da iş kuralı gerçekten
-- "bir sevkiyat yalnızca BİR kez faturaya bağlanabilir" ise `s.invoiceId` doluyken ikinci çağrıyı
-- `DomainError('INVOICE_ALREADY_LINKED', ...)` ile reddet.
--
-- Kapsam: her `invoices.export_shipment_id` dolu satırı için karşı taraftaki `export_shipments`'ın
-- GERÇEKTEN bu faturayı `invoice_id` ile geri gösterdiğini doğrular (simetri, ledger'dan bağımsız —
-- I44 yalnızca `status='cancelled'` durumunu kapsıyordu, bu kural durumdan bağımsız GENEL simetriyi
-- kapsar; I44 ile örtüşen 'cancelled' satırları da burada tekrar yakalanır, bu kasıtlıdır — savunma
-- katmanı).

SELECT
  'I56' AS rule, 'invoice_export_shipment_backref_mismatch' AS entity, i.id::text AS id,
  0::numeric(18, 4) AS expected, 1::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM invoices i
JOIN export_shipments es ON es.id = i.export_shipment_id
WHERE es.invoice_id IS DISTINCT FROM i.id

UNION ALL

-- Ters yön: sevkiyatın gösterdiği fatura, o faturadan geri sevkiyata işaret etmiyorsa (I36'nın
-- "yetim referans" kontrolünün simetri eşdeğeri — I36 yalnızca fatura SATIRININ var olduğunu
-- doğruluyordu, `export_shipment_id` alanının GERİ bu sevkiyata işaret ettiğini doğrulamıyordu).
SELECT
  'I56', 'export_shipment_invoice_backref_mismatch', es.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM export_shipments es
JOIN invoices i ON i.id = es.invoice_id
WHERE i.export_shipment_id IS DISTINCT FROM es.id

ORDER BY id;
