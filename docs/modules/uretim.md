# Modül: Üretim (production)

Route kökü `/uretim` + `/operator`, izinler `production.*`, core `packages/core/src/production/**`, web `apps/web/src/modules/production/**`, seed `seed/production.ts`.

## Ekranlar
1. `/uretim/is-emirleri` — tablo: no, ürün, hat, durum, planlanan/üretilen, verim %, fire, planlanan başlangıç, operatör, birim maliyet. Filtre hat/durum/tarih. "Yeni iş emri": ürün (mamul/yarı mamul, aktif BOM zorunlu) → miktar → hat (BOM varsayılan) → planlanan tarih → **malzeme önizleme** (`explodeBom`: her satır planlanan miktar, eldeki serbest stok, FEFO ile çekilecek lotlar, eksik miktar kırmızı) → oluştur (`createWorkOrder`: WO + `work_order_materials`; kaynak lokasyon TIRE/HAM kökü, hedef TIRE/MAMUL/R01, WIP lokasyonu hattın `locationId`'si). Satış siparişinden "İş emri oluştur" (`salesOrderId` bağı + document_links).
2. `/uretim/is-emirleri/[id]` — başlık + durum + aksiyonlar (Serbest bırak / Başlat / Bitir / Kapat / İptal); sekmeler: Malzemeler (planlanan, tüketilen, kalan, lotlar), Tüketimler (lot, lokasyon, miktar, maliyet, kim/ne zaman), Çıktılar (mamul lot no, miktar, birim maliyet), Fire, Olaylar (zaman çizelgesi: başlat/duraklat/okut/bitir + duruş sebepleri), Maliyet (malzeme + genel gider = toplam → birim; BOM standart maliyetiyle sapma), Zincir (SO → WO → lot → sevkiyatlar).
3. `/uretim/planlama` — hat × gün ızgarası (bu hafta + sonraki), kartlar (WO no, ürün, miktar, durum rengi), dnd-kit ile hat/gün değiştirme (`rescheduleWorkOrder`), hat kapasitesi doluluk çubuğu (capacityPerHour × shiftMinutes).
4. `/uretim/hatlar` — 4 kart: hat adı, durum (çalışıyor/boşta/duruşta), aktif WO, bugünkü üretim, bugünkü OEE (oee_records varsa), son duruş.
5. `/operator` (tablet, `(operator)` layout, `production.operate`, PIN girişi `/operator/giris`: kullanıcı seç + 4 hane PIN) → hat seç → **Aktif iş emri ekranı**: büyük başlık (ürün, planlanan), dört ana buton: **Başlat** (`startWorkOrder`: event start, status in_progress, hat status running), **Okut** (giriş alanı: lot QR/barkod; `scanConsume`: lot bulunur → ürün BOM'da mı, lot released mi, FEFO'ya göre sıradaki lot mu (değilse sarı uyarı + "yine de kullan" gerekçe), miktar önerisi = kalan planlanan; onay → `consumeLot`), **Fire gir** (sebep + miktar + aşama → `recordScrap`: scrap move WIP/lokasyondan TIRE/HURDA, 659), **Bitir** (üretilen miktar + (opsiyonel) kalan malzemeyi FEFO ile otomatik çek "Reçeteye göre tamamla" → `autoConsumeRemaining`; sonra `finishWorkOrder`: mamul lot `PL-YYMMDD-Hx-NN` (SKT = bugün + shelfLifeDays), `postStockMove(kind:'production', from hat lokasyonu → TIRE/MAMUL/R01, unitCost=(materialCost+overhead)/qty)`, yield%, status finished). Ayrıca **Duraklat/Devam** (duruş sebebi seçimi: arıza, malzeme bekleme, temizlik, mola → `work_order_events` + `downtimes`). Ekranda canlı sayaç (çalışma süresi), tüketim listesi, ilerleme çubuğu. 1024×768 ve 390×844 kırılmaz; butonlar ≥64px.
6. Kapatma: `closeWorkOrder` (yalnızca finished; maliyet kilidi; WIP kalan = 0 kontrolü; kalan tüketilmemiş WIP miktarı varsa geri iade hareketi `transfer` hat → hammadde lokasyonu).

## Core servisleri
`production/workOrders.ts` (`createWorkOrder`, `releaseWorkOrder`, `startWorkOrder`, `pauseWorkOrder`, `resumeWorkOrder`, `rescheduleWorkOrder`, `cancelWorkOrder`), `production/consume.ts` (`scanConsume`, `consumeLot`, `autoConsumeRemaining` FEFO), `production/finish.ts` (`recordScrap`, `finishWorkOrder`, `closeWorkOrder`, `computeCost`), `production/yield.ts`. Maliyet kuralı: `materialCost = Σ consumptions.value`, `overheadCost = bom.overheadPerBatch + bom.overheadPerUnit × producedQty`, `totalCost = material + overhead`, `unitCost = total / producedQty` (4 hane; kalan kuruş farkı son satıra). Genel gider fişi ledger mapping'e göre (152 / 151 + 731). Fire değeri WIP'ten düşer (659 / 151).

## Seed (`seed/production.ts`)
- 8 iş emri: 4 kapalı (farklı hatlar/ürünler; gerçek FEFO tüketim, 1-2 fire kaydı, verim %94-99; mamul lotları şimdi stokta), 2 finished (kapatılmamış), 1 in_progress (kısmi tüketim, duruş olayı), 1 planned (yarın). Tümü core servisleriyle, tarihler son 30 güne yayılmış.

## Kabul kriterleri
- Operatör ekranında karantina lotu okutulunca engel; FEFO dışı lot uyarı.
- Kapalı WO: `Σ consumptions.value + overhead = Σ outputs.value + Σ scraps.value` (I14), WIP hesabı sıfıra iner (I15).
- Mamul lot → geri izleme mal kabule kadar kopuksuz (I5).
