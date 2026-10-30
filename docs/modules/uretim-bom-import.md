# Üretim Excel'inden Çok Seviyeli Ürün Ağacı (BOM) Aktarımı

Kaynak: `data/import/Plantero_Uretim_Ana_Excel.xlsx` (ana üretim / Ar-Ge maliyet çalışma kitabı, gizli sayfalar dahil).
Kod: `packages/db/src/import/uretim-bom.ts` (okuyucu), `uretim-bom-plan.ts` (eşleme + plan, saf), `seed/uretim-bom.ts` (DB yazımı; seed adımı `uretim-bom`, masterdata'dan sonra, production'dan önce).
Testler: `packages/db/src/import/uretim-bom.test.ts` (gerçek dosya üzerinde ALMOND 250GR, KAJUBEAR 300GR, OATPOWDER 20GR + plan testleri).

## Reçete kalıbı

```
mamul (satılabilir)  →  yarı mamul baz (1 birim) + ambalaj kalemleri
yarı mamul           →  hammaddeler   (Excel oranları × birim net ağırlık)
çoklu paket (2x/3x/6x) → n × tekli mamul + shrink / 6'lı koli     (türetilen)
set                  →  bileşen mamuller + etiket                  (türetilen)
```

Örnek (kullanıcı kuralı): `BADEM BAZI` (110010001, HAT1) = `Badem Bazı 250ml` (210010000, yarı mamul) + `Cam Şişe Baştürk Cam Hale 250ml` + `Tarihli Gold 38mm Twistoff Kapak` + `Yeniler Etiket Badem Konsantresi 250g Etiket` + `38 Çap Emniyet Bandı`; `Badem Bazı 250ml` = 8,25 kg BADEM PUREE + 8,25 kg Ayçiçek yağı + 8,25 kg Kaju (100 birimlik parti).

Yarı mamul birimi ADET'tir (bir şişe/paket dolumluk baz); BOM'ları 100 birimlik partiye göre yazılır (kg miktarları 4 ondalıkta kayıpsız kalsın). Yarı mamul SKU'ları T=2, mamul SKU'sunu yansıtır (ör. `110010001` → `210010000`).

## Sonuç özeti

| | Adet |
|---|---|
| Aktif reçete (toplam) | 51 (13 yarı mamul + 38 mamul), 224 satır |
| Kaynak: Excel bloğu | 28 (13 yarı mamul + 15 mamul) |
| Kaynak: türetilen (çoklu paket 9, set 5) | 14 |
| Kaynak: yer tutucu (Excel'de reçete yok) | 9 |
| Yeni SKU | 46: 13 yarı mamul (T=2), 18 hammadde (T=3), 15 ambalaj (T=4) |
| Mevcut SKU'ya eşlenen Excel kalemi | 21 SKU (aşağıda) |
| Yeni tedarikçi (partner) | 16 (`S-000007`…, beyaz listede değil) |
| Hat dağılımı (aktif reçete) | HAT1: 22 mamul + 9 yarı mamul, HAT2: 15 + 3, HAT3: 1 + 1 — hepsinde `default_line_id` dolu |

Blok → ürün eşlemesi:

| Excel bloğu | Mamul (SKU) | Yarı mamul | Hat |
|---|---|---|---|
| ALMOND 250GR | BADEM BAZI 110010001 (+ 2x/3x/6x türetilen) | Badem Bazı 250ml | HAT1 |
| 250 gram bitkisel skonsantreler › HAZELNUT KONSANTRE | FINDIK BAZI 110020001 (+ çoklu) | Fındık Bazı 250ml | HAT1 |
| 250 gram bitkisel skonsantreler › CSAHEW KONSANTRE (ilk blok) | KAJU BAZI 110030001, Kaju Bazı ABD 110030101 (+ çoklu) | Kaju Bazı 250ml | HAT1 |
| OAT 500GR (gizli) | YULAF BAZI 110040001 | Yulaf Bazı 500ml | HAT1 |
| Barista 300GR Complex Citru (2) › Almond / Hazelnut / Cashew | BARISTA BASE Badem / Fındık / Kaju (120010001/20001/30001) | Barista … Bazı 300g | HAT1 |
| Bitkisel Baz Barista Ana Sheet (gizli) › ilk OAT Drink bloğu | BARISTA BASE YULAF 120040001 | Barista Yulaf Bazı 300g | HAT1 |
| Plantero Protein Mix Reçeteleri › PLAIN (satır 94) / KAKAO (24) / STRAWBERRY (47) | Plain / Double Chocolate / Strawberry Protein Mixi | … Protein Mix Tozu 416g | HAT2 |
| KAJUBEAR 300GR › ilk blok (kakaolu) | Kakaolu Kaju Ezmesi 140030101 | Kakaolu Kaju Ezmesi Bazı 300g | HAT1 |
| OATPOWDER 20GR | Oat Coffee Creamer 150040001 (10 saşe/kutu) | Oat Creamer Toz Karışımı 10g | HAT3 (ikisi de) |
| MATCHA POWDER | Matcha 160060001 | yok (tek bileşen: 30 g matcha tozu + ambalaj) | HAT2 |

## Mevcut SKU'larla eşleşen Excel kalemleri (21 SKU)

| SKU | Mevcut ürün | Excel adları |
|---|---|---|
| 301010000 | Isolated Pea Protein | Isolated Pea Protein |
| 301020000 | Nohut Tozu | Chickpea protein / Nohut Proteini |
| 301050000 | Kaju | kaju, Cashew, KAJU NUTS |
| 302010000 / 302020000 | Suklaroz / stevya | Suklaroz, stevya |
| 303010000 / 303020000 | Guar Gum / Xhantam Gum | aynı adlar |
| 304020000 | masker | Masker, IFF Masker |
| 304030000 | Alkalize Kakao | Kakao, Cacao |
| 304040000 | çikolata aroması | Çikolata aroması Aromsa + Firmenich (toplanır) |
| 304050000 | Çilek Aroma Verici | Firmenich + IFF (toplanır) |
| 305010000 | b2+b12+e | b2,b12, e |
| 306010000 | Inulin | Inulin, INULİN, Inulin(TATLI/YENİ GELEN), Chicory Root Fibre(Inulin) |
| 306020000 / 306040000 / 306050000 | Hibiskus / Spriluna / Bromelain | aynı adlar |
| 306060000 | Strawberry | Strawberry Freezedry |
| 307010000 | Cream | Cream |
| 307020000 | Deniz Tuzu | SALT FINE 500µm |
| 308020000 | Matcha Tozu (Toptan) | Matcha tozu |
| 308030000 | Vanilya Tozu (Toptan) | Vanilya Tozu, Vanilya MADAGASCAR |

Mevcut SKU'ların adı/barkodu değişmedi. `standardCost` 0 olanlara Excel fiyatı (RM Listesi öncelikli) yazıldı (18 SKU); dolu olana dokunulmadı.

## Yeni oluşturulan kalemler (46)

Hammadde (T=3, KG): BADEM PUREE 301070000 (361 ₺/kg, AYDIN) · FINDIK PUREE 301080000 (252, AYDIN) · KAJU EZMESİ 301090000 (360, ümit) · OAT PUREE 301100000 (336, MEURENS) · OAT POWDER 301110000 (546) · Kabak Çekirdeği Proteini 301120000 (130) · PUDRA ŞEKERİ 302040000 (180, BİM) · Silent - Fructose 302050000 (fiyat yok) · Physiyum husk 303030000 (100, Smartiks) · FLAVOR FİRMENİCH 304060000 (1500) · Mouthfeel and Sweet 304070000 (600, Giavuadan) · CATANOIA COCO 304080000 (4,9, MOKATE) · Calcium Carbonate 305020000 (350, CP) · Potassium Phosphate 305030000 (336) · Citrus Fiber 306070000 (2000) · Ayçiçek yağı 307030000 (42) · COCONUT 307040000 (750) · CİTRUS 307050000 (500).

Ambalaj (T=4, ADET, ad = kullanıcı örneği ya da Excel adı): Cam Şişe Baştürk Cam Hale 250ml 401050000 (5,04; Excel: HALE CAM ŞİŞE 250CC) · Tarihli Gold 38mm Twistoff Kapak 401060000 (4,62; Excel: Aldın kapak GOLD / METAL KAPAK 38 ÇAP TWİST OFF) · Yeniler Etiket Badem / Fındık / Kaju Konsantresi 250g Etiket 401070000/80000/90000 (1,89; Excel: BAZ ETİKETLERİ / YENİLER ETİKET) · 38 Çap Emniyet Bandı 401100000 (0,5) · AKTEKİN PLASTİK 500CC ŞİŞE 40GR 401110000 (8,4) · PLASTİK POMPA 401120000 (26,88, WORKPLAST) · BARİSTA ETİKETLERİ 401130000 (10) · BAZ ETİKETLERİ 401140000 (Yulaf, 1,89) · ETİMAG SHİRİNK 50 MİKRON 106*125MM 401150000 (0,42) · BAŞTÜRK KAVANOZ İZMİR 401160000 (4,9) · evepack 402040000 (1,5) · 400GR Protein Mix Ambalajı 402050000 (10; Excel "400GR packaging cost" toplu) · Matcha 30GR Ambalajı 402060000 (14; Excel "packaging cost" toplu).

Yarı mamul (T=2, ADET): 13 adet (tabloda yukarıda), `isManufactured=true`, satılabilir değil, raf ömrü 180 gün.

Tedarikçiler (yeni partner, `supplier_products` tercihli fiyat): AYDIN, ümit, MEURENS, BİM, Smartiks, Firmenich, Giavuadan, MOKATE, CP, BAŞTÜRK, SILGAN BAHARCAM, YENİLER ETİKET, AKTEKİN, WORKPLAST, ERDAL ETİKET, ETİMAG.

## Eşleşmeyen / kullanılmayan Excel bölümleri

| Sayfa | Blok | Neden |
|---|---|---|
| PRODUCTION worksheet | 38 blok | Ar-Ge deneme/ara sürümler; güncel formüller "Plantero Protein Mix Reçeteleri" sayfasından alındı |
| Plantero Protein Mix Reçeteleri | ORMAN MEYVELİ, MANGO, WHEY (SÜTLÜ ÇİKOLATA, STRAWBERRY, Biscuit, Muz…) — 8 blok | Ana veride karşılık gelen satılabilir mamul yok |
| KAJUBEAR 300GR | 2. blok (vanilyalı) | Karşılık gelen mamul yok |
| 250 gram bitkisel skonsantreler | ALMOND KONSANTRE, 2. CSAHEW | Almond için ALMOND 250GR (kullanıcı kuralı), Kaju için ilk blok kullanıldı |
| Barista 500GR Complex Nuts, Bitkisel Baz Barista Ana Sheet (2. blok) | | 300GR Complex sayfası / ilk Main bloğu tercih edildi |
| Almod / Oat / Pea Drink-recipe, Meatien Mince-recipe | | UHT içecek ve et alternatifi Ar-Ge reçeteleri; üretilebilir mamul değil (UHT ürünler arşiv) |
| Plantero Çilek / Çikolata Protein Mix (gizli), Plantero 250GR Bases | | Eski deneme / yalnızca ambalaj maliyet özeti |
| COGs summary, Trial Cost, Purchase Order, Nutritional… | | Reçete bloğu yok |

Excel'de reçetesi olmayan, yer tutucu reçete verilen mamuller (9; `[uretim-bom] YER TUTUCU` notlu, eski seed varsayımı, A4): %100 Oat Spredable 140040001, %100 Oat Chocolate Spredable 140040101, Guatemala 160010001, Costa Rica 160020001, Etiyopya 160030001, Nikaragua 160040001, Türk Kahvesi 160050001, Vanilya Tozu 160070001, Hurma Ezmesi 160080001. Set ürünleri (5) ve çoklu paketler (9) Excel'de yok; ürün yapısından türetildi. 170xxx (promosyon) ve 190xxx (UHT arşiv) üretilmez, reçetesi yok.

## Varsayımlar

1. **Oran yorumu:** oranlar toplamı > 1,5 ise 0–100 ölçeği (÷100), değilse 0–1. Miktar = oran × birim net ağırlık; Excel'deki parti büyüklüğü (250, 300, 100000 …) yalnızca bilgi/denetim içindir, mamulün net ağırlığına ölçeklenir (konsantre 250 g, barista 300 g, Yulaf 500 g, protein mix 416 g, kaju ezmesi 300 g, creamer saşesi 10 g). Oran toplamı %95–105 dışındaysa not düşülür; yalnızca KAJUBEAR kakaolu blok (%142) 1'e normalize edildi. Plain mix (%92,9) ve Yulaf barista (%88,8, su hariç) Excel'deki gibi bırakıldı.
2. `water` satırları reçeteye girmez (tüketici seyreltmesi / proses suyu).
3. "1 adet" ambalaj satırları Excel'de oran=1, miktarsız satırlardır; "packaging" etiketli ama oranlı/miktarlı satır (OATPOWDER'daki CATANOIA COCO) karışım bileşeni sayıldı. "4 case box" (sevkiyat kolisi) reçeteye alınmadı.
4. Ambalaj adları kullanıcı örneğindeki gibi (Badem için tam), Fındık/Kaju için aynı kalıp. Kapak fiyatı Gold (4,62), etiket RM Listesi (1,89).
5. **Fiyatlar:** TL/kg → `standardCost`; öncelik tabloda sabitlenen Excel değeri (RM Listesi veya ilgili sayfa), sonra RM Listesi, sonra satır fiyatı. Excel'de bazı satır fiyatları tutarsız (ör. kaju 5,04 / 110, ayçiçek yağı 290) — RM Listesi esas alındı.
6. **Hat ataması (PRODUCTION-LINES.md):** HAT1 = bazlar, barista, ezmeler (+ çoklu paketler, Hurma Ezmesi); HAT2 = protein mix, matcha, kahve, vanilya, set; HAT3 = saşe/stick (creamer). Yarı mamul reçetesi mamulle aynı hatta.
7. Çoklu paket: 2'li/3'lü = n × tekli + 1 shrink; 6'lı = 6 × tekli + 1 Koli 6'lı (Excel'de yok, ürün yapısından). Kaju Bazı ABD alternatif: Kaju Bazı ile aynı reçete.
8. Reçete verimi: yarı mamul %97, mamul %98 (çoklu/set %100); mamul genel gider 10 ₺/adet (Excel "production 10") bazlar/barista için, diğerleri 0–2 ₺.
9. Eşleme: Almond/Almond Paste → BADEM PUREE, Hazelnut → FINDIK PUREE, Cashew Paste → KAJU EZMESİ (yeni); Cashew/kaju → mevcut Kaju (kuruyemiş); SALT FINE → Deniz Tuzu; Chickpea protein → Nohut Tozu; Vanilya MADAGASCAR → Vanilya Tozu (Toptan).
10. Seed'de `production` iş emirleri çok seviyeli: her mamul iş emrinden önce yarı mamul iş emri koşar (mal kabul → hammadde → yarı mamul lotu → mamul lotu; lot zinciri kopmaz); hammadde/ambalaj takviyesi aktif reçetelerden hesaplanır. İş emri sayısı 8 → 13.

## Belirsizlikler (kullanıcıya sorulacak)

1. **"Badem Sütü Konsantresi" = `BADEM BAZI` (110010001)** olarak eşlendi; ana veride bu ad yok. Doğru mu? Yulaf Bazı hangi sayfa: "OAT 500GR" (500 g, pompalı) mı yoksa COGs'taki "Oat Base 190gr" mı?
2. **Oat Coffee Creamer:** ana veri 10 g × 10 saşe, Excel "OATPOWDER 20GR" (20 g). Oranlar 10 g'a ölçeklendi; saşe başına 20 g mı?
3. **KAJUBEAR oranları** %142 (COCONUT 0,6 şüpheli). Doğru oranlar nedir? Vanilyalı 2. blok hangi ürün?
4. **Kakaolu Kaju Ezmesi** ambalajı Excel'de yok: Baştürk kavanoz (4,9) + genel kapak/etiket varsayıldı.
5. Protein mix ambalajı Excel'de toplu (10 ₺/400 g); ürün 416 g, Doypack 1kg değil ayrı "400GR Protein Mix Ambalajı" açıldı. Net ağırlık 416 g mı?
6. Yulaf/Fındık/Kaju bazlarında Excel parti 300 g, sayfa başlığı 250 g: 250 g'a ölçeklendi. 300 g mı olmalı?
7. Yer tutucu 9 mamulün (kahveler, spredable'lar, vanilya, hurma ezmesi) gerçek reçetesi gerekli.
8. Matcha tek bileşenli (yarı mamul yok) bırakıldı; 30 g birim ve 14 ₺ ambalaj doğru mu?
9. Çilek aroması (Firmenich+IFF) ve çikolata aroması (Aromsa+Firmenich) tek SKU'da toplandı; ayrı SKU mu?

## Bilinen etkileşimler / talepler

- **Ar-Ge seed (`seed/rnd.ts`) "Oat Barista v2"** `120040001` için `releaseToBom(activate)` ile düz (tek seviyeli, uydurma SKU'lu) yeni BOM versiyonu aktifleştiriyor; Excel tabanlı v1 arşivlenir. Ar-Ge'nin deneme satırlarını yeni reçeteyle (yarı mamul + ambalaj) uyumlu hale getirmesi gerekir (rnd modülü sahibi).
- **Ürün kartı reçete sekmesinde hat adı:** `apps/web/src/modules/masterdata/queries.ts` içine `getBomLineLabels(bomIds)` eklendi (`{ [bomId]: { code, name } }`); `product-bom-tab.tsx`'e dokunulmadı — sayfa bu veriyi prop olarak geçirip sekme gösterecek.
- `db:check` I33 (gelecek tarihli yevmiye) bakım modülünün (MO-2026-000001/2) tarih/saat dilimi kaynaklı ihlali; bu çalışmayla ilgisiz.
