# Varsayımlar (kullanıcı teyidi bekleyen kararlar)

Belirsizlikte soru sorulması istendi; oturum otonom çalıştığı için aşağıdaki varsayımlarla ilerlendi. Her biri tek noktadan değiştirilebilir.

| # | Konu | Varsayım | Değiştirme noktası |
|---|---|---|---|
| A1 | Tüzel kişilik | Şirket: Bigetaş Biyoteknoloji A.Ş. (nakit akışı dosyası), marka: Plantero. Fabrika Tire OSB, ikinci depo Buca. | `settings` seed (`packages/db/src/seed/core.ts`) |
| A2 | Üretim hatları | ~~4 hat~~ → **Kullanıcı teyit etti (02.09.2026): 3 hat** — HAT1 Bazlar/Barista/Kremalar, HAT2 Toz karıştırma & dolum, HAT3 Saşe/stick toz dolum. Ayrıntı `docs/PRODUCTION-LINES.md` | `seed/masterdata.ts` → `production_lines` |
| A3 | Makine kartları | **Teyit edildi:** kapasite raporundaki (TOBB 69996) tüm makinelere sahibiz; hat ataması ve proses sırası kullanıcı beyanına göre (`docs/PRODUCTION-LINES.md`). Rapordaki kapasite hesapları KULLANILMAZ | `seed/maintenance.ts` |
| A4 | Reçeteler | Gerçek reçete yok; her mamul için makul hammadde/ambalaj reçetesi uyduruldu; eksik hammaddeler T=3/T=4 kod yapısına uygun yeni SKU ile eklendi (ürün adı/barkod kuralı yalnızca Excel'den gelenleri korur) | `seed/masterdata.ts` |
| A5 | Fiyatlar / maliyetler | Nakit akışı dosyasındaki birim fiyat (450 pazaryeri, 230 toptan) ve hammadde (~87-90 TL) verilerinden türetildi | fiyat listeleri seed |
| A6 | Dış API'ler | Bizimhesap, Trendyol, Hepsiburada, banka açık bankacılık, WhatsApp, SMTP kimlik bilgisi yok → tüm adaptörler sandbox (deterministik sahte veri). `.env` doldurulunca live | `packages/integrations` |
| A7 | AI sağlayıcı | Anthropic Claude (`claude-sonnet-5`); `ANTHROPIC_API_KEY` yoksa kural tabanlı fallback | `packages/ai/src/client.ts` |
| A8 | Kimlik doğrulama | E-posta + şifre, DB oturumu, cookie; SSO yok. Operatör tablet için 4 haneli PIN | `packages/core/src/auth` |
| A9 | Maliyetleme | Lot bazlı gerçek maliyet (specific identification); lotsuz kalemlerde hareketli ağırlıklı ortalama; SMM sevkiyat anında | `packages/core/src/stock/ledger.ts` |
| A10 | Çift defter | VUK = Tek Düzen Hesap Planı; UFRS aynı kayıtları `ifrsCode` eşlemesiyle raporlar; dönem sonu UFRS düzeltmeleri manuel fiş | `accounts.ifrsCode` |
| A11 | KDV | Mamul satış %1, hammadde/ambalaj/hizmet alış %20, promosyon ürünleri %20 | `products.vatRate` |
| A12 | Kanal komisyon/kargo | Trendyol %21 + 45 TL kargo, Hepsiburada %18 + 45 TL (nakit akışı dosyasındaki ~%40 toplam kesinti ile uyumlu) | `sales_channels` seed |
| A13 | Migros vadesi | 60 gün; pazaryeri hakediş 21 gün; toptan peşin | `sales_channels.settlementDays` |
| A14 | Mamul raf ömrü | 365 gün; hammadde 540 gün; lot no formatı `PL-YYMMDD-H1-01` | `products.shelfLifeDays` |
| A15 | Dağıtım | Yerel Postgres 16 + Redis; Docker/compose dosyası eklendi ama zorunlu değil | `docker-compose.yml` |
