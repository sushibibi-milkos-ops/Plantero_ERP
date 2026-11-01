# Üretim Excel'inden Çok Seviyeli Ürün Ağacı (BOM) Aktarımı

Kaynak: `data/import/Plantero_Uretim_Ana_Excel.xlsx` (ana üretim / Ar-Ge maliyet çalışma kitabı). **Yalnızca görünür sayfalar okunur; gizli (hidden) sayfalar tamamen atlanır (kullanıcı kararı).**
Kod: `packages/db/src/import/uretim-bom.ts` (okuyucu), `uretim-bom-plan.ts` (eşleme + plan, saf), `seed/uretim-bom.ts` (DB yazımı; seed adımı `uretim-bom`, masterdata'dan sonra, production'dan önce).
Ad düzeltmesi tablosu: `packages/db/src/import/konsantre-adlari.ts` (A16).
Testler: `packages/db/src/import/uretim-bom.test.ts` (gerçek dosya üzerinde ALMOND 250GR, KAJUBEAR 300GR, OATPOWDER 20GR + plan + hiyerarşi/ad testleri; 20 test).

## Ürün hiyerarşisi (kullanıcı kararı)

> "Badem Sütü Konsantresi son üründür, Badem Bazı ara üründür, badem hammaddedir."

```
hammadde (T=3)            yarı mamul (T=2, ara ürün)        MAMUL (T=1, son ürün, satılabilir)
BADEM PUREE + Ayçiçek yağı + Kaju  →  Badem Bazı 250ml (210010000)  →  Badem Sütü Konsantresi (110010001)
```

- Satış yalnızca mamul (`is_sellable`: 38 mamul; yarı mamullerde 0). Satın alma hammadde/ambalaj (+ ticari mal olarak 4 promosyon ürünü). Yarı mamul ne satılır ne satın alınır; üretimle çıkar, mamul iş emrinde tüketilir.
- İş emri: mamul iş emri yarı mamul lotunu tüketir; yarı mamul iş emri hammadde lotlarını tüketir (seed `production`: her mamul iş emrinden önce yarı mamul iş emri). İzlenebilirlik üç seviye: hammadde mal kabul lotu → yarı mamul lotu → mamul lotu → sevkiyat.
- **Ad düzeltmesi (A16, `docs/ASSUMPTIONS.md`)**: Ana Veri Excel'indeki "X BAZI" adlı satılabilir konsantre mamuller seed'de (`seed/uretim-bom.ts` → `updateProduct` + `allowIdentityChange` + gerekçe, SYSTEM_ACTOR, `audit_log` 'update' satırı: önce/sonra, ürün `note` alanında kaynak) "X Sütü Konsantresi" olarak yeniden adlandırılır. SKU/barkod değişmez. CLAUDE.md kural 6 (normalize etme) korunur: bu iş kararıdır, tek seferlik ve audit'lidir; Excel'den gelen başka hiçbir ad değişmedi.

| SKU | Eski ad (Excel) | Yeni ad |
|---|---|---|
| 110010001 | BADEM BAZI | Badem Sütü Konsantresi |
| 110010002 / 003 / 006 | 2x / 3x / 6x Badem Bazı | 2x / 3x / 6x Badem Sütü Konsantresi |
| 110020001 | FINDIK BAZI | Fındık Sütü Konsantresi |
| 110020002 | 2x Fındık | 2x Fındık Sütü Konsantresi |
| 110020003 / 006 | 3x / 6x Fındık Bazı | 3x / 6x Fındık Sütü Konsantresi |
| 110030001 | KAJU BAZI | Kaju Sütü Konsantresi |
| 110030002 / 003 / 006 | 2x / 3x / 6x Kaju Bazı | 2x / 3x / 6x Kaju Sütü Konsantresi |
| 110030101 | Kaju Bazı ABD_alternatif | Kaju Sütü Konsantresi (ABD alternatif) |
| 110040001 | YULAF BAZI | Yulaf Sütü Konsantresi |

14 ürün. Barista mamulleri (120xxxxxx "BARISTA BASE - … BAZI") kapsam dışı (açık soru 2). Yarı mamul adları "Badem Bazı 250ml" kalıbında kaldı; hammaddeler RM List adlarıyla (BADEM PUREE …). Ar-Ge projesi "Fıstık Bazı" (yeni SKU adayı 110050001) bu kalıpta bir baz (ara ürün) çalışması sayıldı, adı değişmedi.

## Reçete kalıbı

```
mamul (satılabilir)  →  yarı mamul baz (1 birim) + ambalaj kalemleri
yarı mamul           →  hammaddeler   (Excel oranları × birim net ağırlık)
çoklu paket (2x/3x/6x) → n × tekli mamul + shrink / 6'lı koli     (türetilen)
set                  →  bileşen mamuller + etiket                  (türetilen)
```

Örnek (kullanıcı kuralı): `Badem Sütü Konsantresi` (110010001, HAT1) = `Badem Bazı 250ml` (210010000, yarı mamul) + `Cam Şişe Baştürk Cam Hale 250ml` + `Tarihli Gold 38mm Twistoff Kapak` + `Yeniler Etiket Badem Konsantresi 250g Etiket` + `38 Çap Emniyet Bandı`; `Badem Bazı 250ml` = 8,25 kg BADEM PUREE + 8,25 kg Ayçiçek yağı + 8,25 kg Kaju (100 birimlik parti).

Yarı mamul birimi ADET'tir (bir şişe/paket dolumluk baz); BOM'ları 100 birimlik partiye göre yazılır (kg miktarları 4 ondalıkta kayıpsız kalsın). Yarı mamul SKU'ları T=2, mamul SKU'sunu yansıtır (ör. `110010001` → `210010000`).

## Sonuç özeti (yalnızca görünür sayfalar)

| | Adet |
|---|---|
| Aktif reçete (toplam) | 47 (11 yarı mamul + 36 mamul), 205 satır |
| Kaynak: Excel bloğu | 24 (11 yarı mamul + 13 mamul) |
| Kaynak: türetilen (çoklu paket 9, set 5) | 14 |
| Kaynak: yer tutucu (Excel'de reçete yok; eski seed varsayımı A4) | 9 |
| Reçete yok (aktif BOM'suz) | 2 mamul: Yulaf Sütü Konsantresi, BARISTA BASE - YULAF BAZI |
| Yeni SKU | 39: 11 yarı mamul (T=2), 14 hammadde (T=3), 14 ambalaj (T=4) |
| Mevcut SKU'ya eşlenen Excel kalemi | 21 SKU (aşağıda) |
| Yeni tedarikçi (partner) | 14 (`S-000007`…, beyaz listede değil) |
| Hat dağılımı (aktif reçete) | HAT1: 20 mamul + 7 yarı mamul, HAT2: 15 + 3, HAT3: 1 + 1 — hepsinde `default_line_id` dolu |
| Okunmayan gizli sayfa | 13 (aşağıda) |

Önceki tura göre fark: gizli sayfalardan türeyen 2 yarı mamul (Yulaf Bazı 500ml, Barista Yulaf Bazı 300g), 2 mamul reçetesi ve yalnızca onlarda geçen 5 kalem (OAT PUREE, Silent - Fructose, Mouthfeel and Sweet, Potassium Phosphate, BAZ ETİKETLERİ) artık açılmıyor (13 → 11 yarı mamul, 51 → 47 reçete, 46 → 39 yeni SKU).

### Görünür sayfalar (okunan) / gizli sayfalar (atlanan)

| Durum | Sayfalar |
|---|---|
| Görünür (10) | COGs summary (reçete bloğu yok), RM List (fiyat listesi), PRODUCTION worksheet, Plantero Protein Mix Reçeteleri, KAJUBEAR 300GR, MATCHA POWDER, OATPOWDER 20GR, ALMOND 250GR, Barista 300GR Complex Citru (2), 250 gram bitkisel skonsantreler |
| Gizli — okunmaz (13) | Barista 500GR Complex Nuts, Bitkisel Baz Barista Ana Sheet, OAT 500GR, Nutritional vAmino Acid Profile, Purchase Order, Almod Drink-recipe, Oat Drink-recipe, Pea Drink-recipe, Trial Cost, Meatien Mince-recipe, Plantero Çilek Protein Mix, Plantero Çikolata Protein Mix, Plantero 250GR Bases |

Okuyucu (`parseUretimBom`) `ws.state !== 'visible'` sayfaları atlar; `ParsedUretimBom.skippedHidden` rapor için adlarını döndürür. Testler hiçbir blok/plan kaynağının gizli sayfa adı taşımadığını doğrular.

Blok → ürün eşlemesi:

| Excel bloğu (görünür sayfa) | Mamul (SKU) | Yarı mamul | Hat |
|---|---|---|---|
| ALMOND 250GR | Badem Sütü Konsantresi 110010001 (+ 2x/3x/6x türetilen) | Badem Bazı 250ml | HAT1 |
| 250 gram bitkisel skonsantreler › HAZELNUT KONSANTRE (satır 2) | Fındık Sütü Konsantresi 110020001 (+ çoklu) | Fındık Bazı 250ml | HAT1 |
| 250 gram bitkisel skonsantreler › CSAHEW KONSANTRE (satır 44, ilk blok) | Kaju Sütü Konsantresi 110030001, Kaju Sütü Konsantresi (ABD alternatif) 110030101 (+ çoklu) | Kaju Bazı 250ml | HAT1 |
| Barista 300GR Complex Citru (2) › Almond (satır 23) / Hazelnut (49) / Cashew (2) Barista Drink | BARISTA BASE Badem / Fındık / Kaju (120010001/20001/30001) | Barista … Bazı 300g | HAT1 |
| Plantero Protein Mix Reçeteleri › "Plantero Plain Mix (416GR)" satır 94 | Plain Protein Mixi 130010001 | Plain Protein Mix Tozu 416g | HAT2 |
| Plantero Protein Mix Reçeteleri › KAKAO satır 24 | Double Chocolate Protein Mixi 130010101 | Double Chocolate Protein Mix Tozu 416g | HAT2 |
| Plantero Protein Mix Reçeteleri › STRAWBERRY satır 47 | Strawberry Protein Mixi 130010201 | Strawberry Protein Mix Tozu 416g | HAT2 |
| KAJUBEAR 300GR › ilk blok (kakaolu, satır 2) | Kakaolu Kaju Ezmesi 140030101 | Kakaolu Kaju Ezmesi Bazı 300g | HAT1 |
| OATPOWDER 20GR | Oat Coffee Creamer 150040001 (10 saşe/kutu) | Oat Creamer Toz Karışımı 10g | HAT3 (ikisi de) |
| MATCHA POWDER | Matcha 160060001 | yok (tek bileşen: 30 g matcha tozu + ambalaj) | HAT2 |
| — (görünür sayfada reçete yok) | Yulaf Sütü Konsantresi 110040001, BARISTA BASE - YULAF BAZI 120040001 | — | reçete yok |

### Protein mix blokları: PRODUCTION worksheet ↔ Protein Mix Reçeteleri

Protein mix reçeteleri görünür iki sayfadan gelir; **kullanılan bloklar "Plantero Protein Mix Reçeteleri" sayfasındadır** (güncel/temiz sürüm), PRODUCTION worksheet (38 deneme bloğu) yalnızca karşılaştırma ve doğrulama içindir:

| SKU | Kullanılan blok | PRODUCTION worksheet karşılığı |
|---|---|---|
| 130010201 Strawberry | Protein Mix Reçeteleri › STRAWBERRY, satır 47 (batch 156.800 g, Σ=%100) | satır 900 "STRAWBERRY": aynı karışım (testle doğrulandı, oranlar birebir). Satır 492/647/694/739/811 (416gr Strawberry Mix) farklı deneme sürümleri |
| 130010101 Double Chocolate | Protein Mix Reçeteleri › KAKAO, satır 24 (158.200 g, Σ=%100) | satır 924 "KAKAO": aynı bileşen seti, gram cinsinden |
| 130010001 Plain | Protein Mix Reçeteleri › "Plantero Plain Mix (416GR)" satır 94 (150.000 g, Σ=%92,9, aroma/mango yok = sade) | 471/580/762/788 (416GR Plain) farklı deneme sürümleri (nohut tozlu / mango aromalı); satır 69 aynı başlıkta ama MANGO aromalı (Plain değil) |

Kullanılmayan protein blokları: ORMAN MEYVELİ (2), satır 69 (mango), WHEY SÜTLÜ ÇİKOLATA (117), STRAWBERRY (140, yinelenen), WHEY ×4 (167, 190, 212, 233) — ana veride karşılığı yok.

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

## Yeni oluşturulan kalemler (39)

Hammadde (T=3, KG, 14): BADEM PUREE 301070000 (361 ₺/kg, AYDIN) · FINDIK PUREE 301080000 (252, AYDIN) · KAJU EZMESİ 301090000 (360, ümit) · OAT POWDER 301110000 (546) · Kabak Çekirdeği Proteini 301120000 (130) · PUDRA ŞEKERİ 302040000 (180, BİM) · Physiyum husk 303030000 (100, Smartiks) · FLAVOR FİRMENİCH 304060000 (1500) · CATANOIA COCO 304080000 (4,9, MOKATE) · Calcium Carbonate 305020000 (350, CP) · Citrus Fiber 306070000 (2000) · Ayçiçek yağı 307030000 (42) · COCONUT 307040000 (750) · CİTRUS 307050000 (500).

Ambalaj (T=4, ADET, 14, ad = kullanıcı örneği ya da Excel adı): Cam Şişe Baştürk Cam Hale 250ml 401050000 (5,04; Excel: HALE CAM ŞİŞE 250CC) · Tarihli Gold 38mm Twistoff Kapak 401060000 (4,62; Excel: Aldın kapak GOLD / METAL KAPAK 38 ÇAP TWİST OFF) · Yeniler Etiket Badem / Fındık / Kaju Konsantresi 250g Etiket 401070000/80000/90000 (1,89; Excel: BAZ ETİKETLERİ / YENİLER ETİKET) · 38 Çap Emniyet Bandı 401100000 (0,5) · AKTEKİN PLASTİK 500CC ŞİŞE 40GR 401110000 (8,4) · PLASTİK POMPA 401120000 (26,88, WORKPLAST) · BARİSTA ETİKETLERİ 401130000 (10) · ETİMAG SHİRİNK 50 MİKRON 106*125MM 401150000 (0,42) · BAŞTÜRK KAVANOZ İZMİR 401160000 (4,9) · evepack 402040000 (1,5) · 400GR Protein Mix Ambalajı 402050000 (10; Excel "400GR packaging cost" toplu) · Matcha 30GR Ambalajı 402060000 (14; Excel "packaging cost" toplu).

Yarı mamul (T=2, ADET): 11 adet (tabloda yukarıda), `isManufactured=true`, satılabilir değil, raf ömrü 180 gün.

Tedarikçiler (14 yeni partner, `supplier_products` tercihli fiyat): AYDIN, ümit, BİM, Smartiks, Firmenich, MOKATE, CP, BAŞTÜRK, SILGAN BAHARCAM, YENİLER ETİKET, AKTEKİN, WORKPLAST, ERDAL ETİKET, ETİMAG.

## Eşleşmeyen / kullanılmayan Excel bölümleri (görünür sayfalardan 49 blok)

| Sayfa | Blok | Neden |
|---|---|---|
| PRODUCTION worksheet | 38 blok | Ar-Ge deneme/ara sürümler; güncel formüller "Plantero Protein Mix Reçeteleri" sayfasından alındı (900/924 = 47/24) |
| Plantero Protein Mix Reçeteleri | 8 blok (ORMAN MEYVELİ, mango'lu Plain, WHEY ×5, yinelenen STRAWBERRY) | Ana veride karşılık gelen satılabilir mamul yok |
| KAJUBEAR 300GR | 2. blok (vanilyalı) | Karşılık gelen mamul yok |
| 250 gram bitkisel skonsantreler | ALMOND KONSANTRE, 2. CSAHEW | Almond için ALMOND 250GR (kullanıcı kuralı), Kaju için ilk blok kullanıldı |
| COGs summary | — | Reçete değil, maliyet özeti |

Gizli sayfalar (OAT 500GR, Bitkisel Baz Barista Ana Sheet, Barista 500GR Complex Nuts, Almod/Oat/Pea Drink-recipe, Meatien Mince-recipe, Plantero Çilek/Çikolata Protein Mix, Plantero 250GR Bases, Trial Cost, Purchase Order, Nutritional…) kullanıcı kararıyla hiç okunmaz.

**Reçetesiz kalan mamuller (aktif BOM yok; hat "Üretilebilir ürünler" listesinde görünmez; yer tutucu eklenmedi):**
- Yulaf Sütü Konsantresi `110040001` — reçetesi yalnızca gizli "OAT 500GR" sayfasındaydı.
- BARISTA BASE - YULAF BAZI `120040001` — reçetesi yalnızca gizli "Bitkisel Baz Barista Ana Sheet" sayfasındaydı.
Bunların açılış stokları seed'de duruyor (satılabilir); iş emri açılamaz. `110040001` türetilen set ürünlerinin (180010201, 180010301) bileşeni olarak kalır. Ar-Ge "Oat Barista v2" devri `120040001` için yalnızca TASLAK BOM üretir (aktifleştirilmez).

Excel'de reçetesi olmayan ama eski seed varsayımıyla (A4) yer tutucu reçete verilen mamuller (9; `[uretim-bom] YER TUTUCU` notlu): %100 Oat Spredable 140040001, %100 Oat Chocolate Spredable 140040101, Guatemala 160010001, Costa Rica 160020001, Etiyopya 160030001, Nikaragua 160040001, Türk Kahvesi 160050001, Vanilya Tozu 160070001, Hurma Ezmesi 160080001. (Production/stock seed'leri bunlardan bazılarını kullandığı için korundu; tutarlılık için açık soru 1.) Set ürünleri (5) ve çoklu paketler (9) Excel'de yok; ürün yapısından türetildi. 170xxx (promosyon) ve 190xxx (UHT arşiv) üretilmez, reçetesi yoktur.

## Varsayımlar

1. **Oran yorumu:** oranlar toplamı > 1,5 ise 0–100 ölçeği (÷100), değilse 0–1. Miktar = oran × birim net ağırlık; Excel'deki parti büyüklüğü (250, 300, 100000 …) yalnızca bilgi/denetim içindir, mamulün net ağırlığına ölçeklenir (konsantre 250 g, barista 300 g, protein mix 416 g, kaju ezmesi 300 g, creamer saşesi 10 g). Oran toplamı %95–105 dışındaysa not düşülür; yalnızca KAJUBEAR kakaolu blok (%142) 1'e normalize edildi. Plain mix (%92,9) ve Yulaf barista (%88,8, su hariç) Excel'deki gibi bırakıldı.
2. `water` satırları reçeteye girmez (tüketici seyreltmesi / proses suyu).
3. "1 adet" ambalaj satırları Excel'de oran=1, miktarsız satırlardır; "packaging" etiketli ama oranlı/miktarlı satır (OATPOWDER'daki CATANOIA COCO) karışım bileşeni sayıldı. "4 case box" (sevkiyat kolisi) reçeteye alınmadı.
4. Ambalaj adları kullanıcı örneğindeki gibi (Badem için tam), Fındık/Kaju için aynı kalıp. Kapak fiyatı Gold (4,62), etiket RM Listesi (1,89).
5. **Fiyatlar:** TL/kg → `standardCost`; öncelik tabloda sabitlenen Excel değeri (RM Listesi veya ilgili sayfa), sonra RM Listesi, sonra satır fiyatı. Excel'de bazı satır fiyatları tutarsız (ör. kaju 5,04 / 110, ayçiçek yağı 290) — RM Listesi esas alındı.
6. **Hat ataması (PRODUCTION-LINES.md):** HAT1 = bazlar, barista, ezmeler (+ çoklu paketler, Hurma Ezmesi); HAT2 = protein mix, matcha, kahve, vanilya, set; HAT3 = saşe/stick (creamer). Yarı mamul reçetesi mamulle aynı hatta.
7. Çoklu paket: 2'li/3'lü = n × tekli + 1 shrink; 6'lı = 6 × tekli + 1 Koli 6'lı (Excel'de yok, ürün yapısından). Kaju Bazı ABD alternatif: Kaju Bazı ile aynı reçete.
8. Reçete verimi: yarı mamul %97, mamul %98 (çoklu/set %100); mamul genel gider 10 ₺/adet (Excel "production 10") bazlar/barista için, diğerleri 0–2 ₺.
9. Eşleme: Almond/Almond Paste → BADEM PUREE, Hazelnut → FINDIK PUREE, Cashew Paste → KAJU EZMESİ (yeni); Cashew/kaju → mevcut Kaju (kuruyemiş); SALT FINE → Deniz Tuzu; Chickpea protein → Nohut Tozu; Vanilya MADAGASCAR → Vanilya Tozu (Toptan).
10. Seed'de `production` iş emirleri çok seviyeli: her mamul iş emrinden önce yarı mamul iş emri koşar (mal kabul → hammadde → yarı mamul lotu → mamul lotu; lot zinciri kopmaz); hammadde/ambalaj takviyesi aktif reçetelerden hesaplanır. İş emri sayısı 13.

## Belirsizlikler / açık sorular (kullanıcıya)

1. **Yer tutucu tutarlılığı:** Yulaf ürünleri gizli sayfa yüzünden "reçete yok" bırakıldı, ama Excel'de hiç reçetesi olmayan 9 mamul (kahveler, spredable'lar, vanilya tozu, hurma ezmesi) eski seed varsayımıyla (A4) yer tutucu reçeteli. Aynı ilke (gerçek reçete yoksa "reçete yok") onlara da uygulansın mı? (Seed `production`/`stock` akışları 140040001 ve 160010001 reçetelerine bağlı; kaldırılırsa o iş emirleri değişir.)
2. **Barista mamulleri** (120xxxxxx "BARISTA BASE - BADEM BAZI" …) olduğu gibi bırakıldı. Bunlar da "Barista Badem Sütü Konsantresi" gibi yeniden adlandırılsın mı? (Yarı mamulleri "Barista Badem Bazı 300g".)
3. **Badem (çiğ) → püre in-house mı?** Reçete hammaddesi RM List'teki BADEM PUREE (satın alınan püre). Çiğ badem (301030000 "Badem") ayrıca hammadde olarak duruyor; püre ileride iç üretim (yarı mamul) olacaksa BADEM PUREE için ayrı bir "badem → püre" yarı mamul reçetesi (ve Fındık/Kaju/Yulaf için eşdeğerleri) gerekir. Şimdilik püre tedarikçiden (AYDIN) alınıyor varsayıldı.
4. **Yulaf Sütü Konsantresi ve Barista Yulaf** için görünür bir sayfada reçete yok; hangi sayfadan/ne zaman girilecek? ("OAT 500GR" gizli sayfası kullanılmıyor.)
5. **Kategori adı:** ürün kategorisi "Bitkisel Süt Konsantreleri (Bazlar)" (Excel) hem mamulleri hem yarı mamulleri kapsıyor; "(Bazlar)" eki kaldırılsın mı? (Kod Yapısı/segment verisi, masterdata sahibi.)
6. **Oat Coffee Creamer:** ana veri 10 g × 10 saşe, Excel "OATPOWDER 20GR" (20 g). Oranlar 10 g'a ölçeklendi; saşe başına 20 g mı?
7. **KAJUBEAR oranları** %142 (COCONUT 0,6 şüpheli). Doğru oranlar nedir? Vanilyalı 2. blok hangi ürün?
8. **Kakaolu Kaju Ezmesi** ambalajı Excel'de yok: Baştürk kavanoz (4,9) + genel kapak/etiket varsayıldı.
9. Protein mix ambalajı Excel'de toplu (10 ₺/400 g); ürün 416 g, Doypack 1kg değil ayrı "400GR Protein Mix Ambalajı" açıldı. Net ağırlık 416 g mı? PLAIN bloğu (satır 94) oranları %92,9 topluyor (eksik %7,1 normalize edilmedi): doğru mu, yoksa PRODUCTION worksheet'teki 416GR denemelerinden biri mi esas?
10. Fındık/Kaju bazlarında Excel parti 300 g (ya da 300.000), sayfa başlığı 250 g: 250 g'a ölçeklendi. 300 g mı olmalı?
11. Matcha tek bileşenli (yarı mamul yok) bırakıldı; 30 g birim ve 14 ₺ ambalaj doğru mu?
12. Çilek aroması (Firmenich+IFF) ve çikolata aroması (Aromsa+Firmenich) tek SKU'da toplandı; ayrı SKU mu?
13. Sistemde `is_sellable` bir hammadde var (Spriluna 306040000; sales seed bilinçli istisna) ve 4 promosyon ürünü (Yoga Matı, Shaker, Blender Mikser, Termos) satın alınabilir mamul tipinde; "satış yalnızca mamul / alış yalnızca hammadde-ambalaj" kuralının istisnaları mı?

## Bilinen etkileşimler / talepler

- **Ar-Ge seed (`seed/rnd.ts`) "Oat Barista v2"** `120040001` için artık `releaseToBom(activate: false)`: ürünün Excel tabanlı aktif reçetesi olmadığından düz (tek seviyeli, uydurma SKU'lu) Ar-Ge reçetesi TASLAK BOM olarak kalır (`BOM-120040001-v1`, hatsız); üretime açılmaz. Yarı mamul + ambalaj yapısına çevrilip aktifleştirilmesi üretim sorumlusuna bırakıldı. `docs/modules/arge.md` §Seed "BOM'a devrolmuş" ifadesi taslak BOM olarak okunmalı (rnd sahibi).
- **Ana Veri import sihirbazı / şablonu** (`ana-veri/import/template/route.ts`, `import-wizard.tsx`) örnek satırda hâlâ "Badem Bazı 1L" yazıyor (yalnızca örnek metin); ana veri Excel'i yeniden içe aktarılırsa ad kilidi nedeniyle A16 adları ezilmez (ad çakışması olarak raporlanır). Masterdata UI sahibine not.
- `sales-doc-form.tsx` içindeki "BADEM BAZI" yalnızca açıklama yorumudur (arama sıralama mantığı ad bağımsız) — dokunulmadı.
- **Ürün kartı reçete sekmesinde hat adı:** `apps/web/src/modules/masterdata/queries.ts` içine `getBomLineLabels(bomIds)` eklendi (`{ [bomId]: { code, name } }`); `product-bom-tab.tsx`'e dokunulmadı — sayfa bu veriyi prop olarak geçirip sekme gösterecek.
- `db:check` I33 (gelecek tarihli yevmiye) bakım modülünün (MO-2026-000001/2) tarih/saat dilimi kaynaklı ihlali; bu çalışmayla ilgisiz.
