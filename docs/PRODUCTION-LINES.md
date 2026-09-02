# Üretim Hatları ve Makine Parkı (kullanıcı beyanı — kapasite raporundaki hat/kapasite kurgusu DİKKATE ALINMAZ)

Kaynak: kullanıcı (02.09.2026). Kapasite raporu (TOBB 26.08.2026, no 69996) resmi belge olduğu için kapasite hesapları anlamsızdır; ancak raporda listelenen tüm makinelere sahibiz — makine kartları o listeden seed edilir, hat ataması aşağıdaki gibidir.

## Hatlar (3 hat — `production_lines`)
| Kod | Ad | Ürün aileleri | Proses adımları (sırayla) |
|---|---|---|---|
| HAT1 | Bazlar, Barista & Kremalar | Bitkisel süt konsantreleri (bazlar), Barista serisi, sürülebilir ezmeler (ball mill), toz krema tabanı | Ön ezme → Ball mill mikser → Homogenizer → Balans tankı → Dolum makinesi → Etiket makinesi → Emniyet bandı → Tarih atma |
| HAT2 | Toz Karıştırma & Dolum | Protein tozları (kavanoz/doypack), kahve paketleme, setler | Silindirik toz mikser (200 kg) → Dolum teknesi → Manuel dolum → Emniyet bandı kapatma → Tarih atma |
| HAT3 | Saşe / Stick Toz Dolum | 20 g stick/saşe ürünler (Oat Coffee Creamer 10 g saşe, protein stick) | Silindirik toz mikser (200 kg) → Elevatör (100 kg) → Stick dolum makinesi (20 g) |

Eski "4 hat" varsayımı geçersiz. Set ürünleri (180…) HAT2'de paketlenir (varsayım).

## Makine kartları (`machines`) — hat ataması
| Kod | Ad | Kategori | Hat | Güç kW | Not |
|---|---|---|---|---|---|
| MK-001 | Ön ezme (ezme makinesi, parçalama hazneli) | grinder | HAT1 | 1 | rapor: 28.93.17 |
| MK-002 | Püre makinesi (ball mill mikser) | mixer | HAT1 | 5.5 | rapor: 28.93.17 |
| MK-003 | Homogenizer | homogenizer | HAT1 | — | kullanıcı beyanı |
| MK-004 | Balans tankı (paslanmaz çelik tank, yan sıyırıcılı) | tank | HAT1 | 0.5 | rapor: 25.29.11 |
| MK-005 | Sıvı dolum makinesi 1 (YKM AYZ24) | filler | HAT1 | 0.35 | rapor: 28.29.21 |
| MK-006 | Sıvı dolum makinesi 2 (Sonkaya SMDY100Y) | filler | HAT1 | — | rapor: 28.29.21 |
| MK-007 | Etiketleme makinesi (Sonkaya) | labeler | HAT1 | 0.18 | rapor |
| MK-008 | Folyo kapatma / emniyet bandı (manuel indüksiyon) | sealer | HAT1 | 0.6 | rapor 99.99.99; ana veri EKP-URT-PKT-01 SONKAYA SEALER ile eşle |
| MK-009 | Kodlama / tarih atma (Videojet inkjet) | coder | HAT1 | — | rapor 26.20.16 — HAT1 ve HAT2 ortak |
| MK-010 | İmalat kazanı (büyük kazan) | kettle | HAT1 | 7.5 | rapor |
| MK-011 | Silindirik toz mikser 200 kg (HAT2) | mixer | HAT2 | 5 | rapor "750 litre silindirik toz ürün mikser" |
| MK-012 | Dolum teknesi | hopper | HAT2 | — | kullanıcı beyanı |
| MK-013 | Toz karıştırıcı (protein tozu mikseri) | mixer | HAT2 | 0.75 | rapor 28.99.39 |
| MK-014 | Dikey toz dolum makinesi (otomatik) | filler | HAT2 | 0.2 | rapor |
| MK-015 | Emniyet bandı kapatma (paketleme, Beta-Pak dolum ve kapatma) | sealer | HAT2 | 15 | rapor 28.29.21 |
| MK-016 | Silindirik toz mikser 200 kg (HAT3) | mixer | HAT3 | — | kullanıcı beyanı (ikinci mikser) |
| MK-017 | Elevatör 100 kg | conveyor | HAT3 | — | kullanıcı beyanı |
| MK-018 | Stick dolum makinesi (20 g) | filler | HAT3 | — | kullanıcı beyanı |
| MK-019 | Helezonlu götürücü (seyyar) | conveyor | HAT3 | 2.2 | rapor |
| MK-020 | Shrink ambalaj makinesi (ısı tünelli) | packaging | ortak | 0.6 | rapor |
| MK-021 | Kuruyemiş kavurma makinesi | roaster | HAT1 | 2.2 | rapor |
| MK-022 | Fermantasyon tankı 1.000 L (Kromel) | tank | HAT1 | — | rapor |
| MK-023 | Metal dedektörü (30×25) | inspection | ortak | 0.05 | rapor |
| MK-024 | Elek (tane boyut analizi) | inspection | HAT2 | 0.3 | rapor |
| MK-025 | Nem tayin cihazı (Precisa) | lab | ortak | 0.1 | rapor |
| MK-026 | Hava kompresörü (pistonlu, seyyar) | utility | ortak | 3 | rapor |
| MK-027 | Sterilizasyon ünitesi (hijyen bariyeri) | utility | ortak | — | rapor |
| MK-028 | Basınçlı yıkama makinesi | utility | ortak | 0.1 | rapor |
| MK-029 | Zemin temizleme makinesi (Taski Swingo) | utility | ortak | 0.5 | rapor |
| MK-030 | Akülü istif makinesi (Paftar ES1530E 1,5 t) | handling | depo | — | rapor |
| MK-031 | Transpalet (manuel) | handling | depo | — | rapor |
| MK-032 | Transpalet (manuel terazili) | handling | depo | — | rapor |
| MK-033 | Kantar (elektronik) | scale | depo | — | rapor |
| MK-034 | Elektronik terazi | scale | ortak | — | rapor |
| MK-035 | Hassas terazi | lab | ortak | — | rapor |
| MK-036 | Paslanmaz çelik çalışma tezgâhı (laboratuvar) | lab | ortak | — | rapor |
Makine-teçhizat toplam değeri (rapor): 4.544.474,99 TL — `machines.purchaseCost` dağıtımı için oransal tahmin kullanılabilir.

## Şirket kimliği (kapasite raporu + denetim raporu)
- Unvan: Bigetaş Biyoteknoloji Anonim Şirketi (Tire Şubesi) — marka **Plantero**, web plantero.co
- Vergi: Tire V.D. 1700727314 · MERSİS 0170072731400002 · Oda sicil 7581 · Ticaret sicil 4201
- Üretim yeri: Duatepe Mah. Küçük Sanayi Sitesi Sk. G-B Blok No: 14/19 Tire / İzmir (kiracı, 260 m² kapalı alan)
- Merkez: Adalet Mh. Manas Blv. No:39/2511 Bayraklı / İzmir
- NACE: 10.39.02, 20.59.06, 20.59.14 · Üretime başlama 20.07.2026 · Personel 3
- Kitle fonlaması: 4.678.884 TL (Fonbulucu, 09.01–28.02.2024); amaca yönelik harcama denetimi 27.08.2026 (A1 Bağımsız Denetim)
