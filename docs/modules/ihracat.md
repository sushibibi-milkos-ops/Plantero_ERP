# Modül: İhracat (export)

Route `/ihracat`, izinler `export.*`, core `packages/core/src/export/**` + `accounting/fx.ts`, web `apps/web/src/modules/export/**`, seed `seed/export.ts`, worker `tcmb-rates`.

1. `/ihracat/sevkiyatlar` — liste (durum, müşteri, ülke, incoterm, rejim standart/ETGB, tutar EUR + TL, ETD/ETA, belge tamamlanma %). Form: satış siparişinden (isExport) → müşteri/ülke/incoterm+yer/rejim (ETGB: 300 kg ve 15.000 EUR altı mikro ihracat, kolay usul) / taşıma modu / limanlar / ETD-ETA. Detay sekmeleri: **Proforma** (üret + PDF; proformaNo, tarih; müşteriye e-posta sandbox), **Packing list** (irsaliye satırlarından kap/palet oluştur: kap no, ürün, lot, miktar, GTİP, net/brüt kg, ölçüler; PDF), **Belgeler** (takip listesi: PROFORMA, INVOICE, PACKING_LIST, ATR/EUR.1, ORIGIN, HEALTH (sağlık sertifikası), BL/CMR/AWB, ETGB, INSURANCE — durum, sorumlu, vade, dosya eki), **Fatura & Kur** (ihracat faturası 601 KDV 0; fatura tarihi TCMB kuru otomatik; tahsilat günü kur farkı fişi 646/656 önizleme ve fiş linki), **Zincir**.
2. `/ihracat/belgeler` — tüm sevkiyatların belge takip panosu (eksik/geciken belgeler, sorumluya göre).
3. `/ihracat/kurlar` — TCMB kur tablosu (USD/EUR/GBP, alış/satış, tarih), "Bugünü çek" (integrations tcmb; sandbox deterministik), grafik.
4. `/ihracat/gtip` — GTİP kodları ve ürün eşlemesi (products.hsCode).

Core: `export/shipments.ts` (`createFromOrder`, `generateProforma`, `buildPackingList`, `advanceStatus`), `export/documents.ts` (rejime göre gerekli belge seti), `export/etgb.ts` (limit kontrolü), `accounting/fx.ts` mevcut.
Seed: 3 sevkiyat (1 ETGB Almanya kapanmış: fatura EUR + tahsilat + kur farkı fişi; 1 standart Hollanda gümrükte; 1 taslak), kurlar son 90 gün, GTİP: 2202.99 (bitkisel içecek), 2106.10 (protein), 2008.19 (ezme), 0901.21 (kahve).
Kabul: I13 yeşil; ETGB limit aşımı engellenir; belge listesi rejime göre doğru.
