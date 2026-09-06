-- I51 — Bakım iş emri maliyeti muhasebeye hiç yansımıyor: `packages/db/src/schema/documents.ts`
-- `document_type` enum'u AÇIKÇA `'maintenance_order'`ı listeler (satır ~14) ve hesap planında
-- tam bu amaç için `730 Genel Üretim Giderleri` / `770.10 Bakım-onarım, temizlik, güvenlik`
-- hesapları vardır — ama `packages/core/src/maintenance/orders.ts` (`updateDiagnosis`,
-- `completeOrder`) `partsCost`/`laborCost` alanlarını yalnızca `maintenance_orders` tablosuna
-- serbest metin/sayı olarak yazar; ne `postJournalEntry` çağrısı vardır ne de `document_links`/
-- `journal_entries.ref_type='maintenance_order'` bağı kurulur. `apps/web/src/modules/maintenance/
-- actions.ts::completeOrderAction`/`updateDiagnosisAction` da bu core fonksiyonlarını olduğu gibi
-- sarar, ek bir muhasebe adımı eklemez.
--
-- Canlı doğrulama (veri-critic, bu tur): fresh seed sonrası `select doc_no,status,parts_cost,
-- labor_cost from maintenance_orders` → `MO-2026-000001` (`status='done'`, parts_cost=180,00,
-- labor_cost=450,00 → toplam 630,00 TL) ve `MO-2026-000002` (`status='done'`, labor_cost=200,00 TL)
-- gerçek, tamamlanmış bakım maliyeti taşıyor; `journal_entries`/`journal_lines`'da `ref_type=
-- 'maintenance_order'` hiç yok (distinct ref_type kümesi: invoice/loan_opening/payment/stock_move/
-- vat_period/work_order — 'maintenance_order' YOK), `730`/`770.10` hesaplarına dokunan TEK BİR
-- satır bile yok (`journal_lines.account_code like '770.10%' or ='730'` → 0 satır). Yani 630,00 TL
-- gerçek bakım gideri muhasebede tamamen görünmez — CLAUDE.md'nin "muhasebe yazımı yalnızca
-- postJournalEntry" ve "tam dijital ikiz" ilkesinin doğrudan ihlali: bu maliyet hiçbir mizanda,
-- hiçbir gider raporunda yer almaz, yalnızca `/bakim` ekranındaki bir sayı olarak yaşar.
--
-- Kök neden dosyası: packages/core/src/maintenance/orders.ts (`updateDiagnosis`, `completeOrder`) —
-- `postJournalEntry`'yi hiç çağırmıyor.
-- Düzeltme önerisi: `completeOrder` (veya maliyet ilk kez sıfırdan pozitife geçtiği an) aynı
-- transaction'da `postJournalEntry({ledger:'both', journalCode:'GEN', origin:'chain',
-- refType:'maintenance_order', refId:order.id, refNo:order.docNo, lines:[
--   {accountCode:'770.10', debit: partsCost+laborCost},
--   {accountCode:'100'|'320', credit: partsCost+laborCost} // nakit/tedarikçi, ödeme yöntemine göre
-- ]})` çağırsın; parça gerçekten ana depodan bir stok kaleminden düşülüyorsa ayrıca `postStockMove`
-- ile stok da düşülmeli (bugün hiçbir stok hareketi de üretilmiyor — parts_cost tamamen manuel bir
-- sayı, hangi üründen/lottan geldiği hiç izlenmiyor).
--
-- Kapsam: status='done' (kapanmış) ve (parts_cost+labor_cost)>0 olan her maintenance_orders satırı
-- için hem "ref_type üzerinden bağlı fiş" hem "document_links üzerinden bağlı fiş" aranır; ikisi de
-- yoksa ihlal. diff = kayıtlı ama muhasebeye hiç yansımamış toplam tutar.

SELECT
  'I51' AS rule, 'maintenance_order_cost_not_posted' AS entity, mo.id::text AS id,
  (mo.parts_cost + mo.labor_cost)::numeric(18, 4) AS expected,
  0::numeric(18, 4) AS actual,
  (mo.parts_cost + mo.labor_cost)::numeric(18, 4) AS diff
FROM maintenance_orders mo
WHERE mo.status = 'done'
  AND (mo.parts_cost + mo.labor_cost) > 0
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.ref_type = 'maintenance_order' AND je.ref_id = mo.id AND je.status IN ('posted', 'reversed')
  )
  AND NOT EXISTS (
    SELECT 1 FROM document_links dl
    WHERE dl.source_type = 'maintenance_order' AND dl.source_id = mo.id AND dl.target_type = 'journal_entry'
  )
ORDER BY id;
