# Açık Kalemler (orkestratör takip listesi)

Döngüler yeşile ulaştıktan sonra ele alınacak, modül ajanlarının raporlarından toplanan şema/servis talepleri ve bilinen sınırlamalar. Şema dondurulmuş olduğundan yalnızca orkestratör uygular.

## Şema talepleri (eklemeli, geriye uyumlu)
- `roles.is_active boolean not null default true` — rol pasifleştirme şu an `settings.roles.deactivated_roles` JSON anahtarıyla simüle ediliyor (izinler silinip saklanıyor). Doğru çözüm: kolon + `resolveSession`'ın pasif rolleri es geçmesi. (Ayarlar > Roller)
- `rnd_card_attachments` tablosu (id, card_id, user_id, file_name, mime_type, data_url/storage_url, size, created_at) — kart ekleri şu an `rnd_card_comments.body` içinde `RND_ATTACH_V1::<json>` imzasıyla taşınıyor (`packages/core/src/rnd/board.ts::parseComment`). (Ar-Ge)
- `work_orders.machine_id` (opsiyonel) — OEE yalnızca hat bazında; makine bazlı OEE için gerekli. (Bakım)

## Servis talepleri
- Satın alma: reddedilen lot için gerçek tedarikçi iade faturası / kredi notu servisi (320.cari karşı) — QC `returnToSupplier` şu an yalnızca niyet bayrağı. (Kalite → Tedarik)
- Satın alma siparişi PDF eki: `renderPdf` (Playwright) web bundle'ını kırıyor; PDF üretimi `apps/worker` içinde BullMQ job'ı olmalı (`send-purchase-order-pdf`), web aksiyonu kuyruğa atar. (Tedarik)
- Kritik stok motoru: web aksiyonu ile worker job'ı aynı akışı iki kez kodluyor (core, @plantero/ai'yı katman kuralı gereği çağıramıyor); 'kritik stok' bildirimi yalnızca gece koşusunda üretiliyor.

## Bilinen sınırlamalar (kod düzeltmesi gerektirmez, sözleşmede belgeli)
- Bakım: `runtime_hours` birimli planlar takvim tarihine çevrilemediğinden otomatik iş emri üretmez (yalnızca "Şimdi üret"); `machines.runtimeHours` otomatik artmıyor; `purchaseCost` dağılımı güç (kW) ağırlıklı tahmin.
- Kalite: kısmi QC kararı desteklenmiyor (ledger aynı lotta hem serbest hem red'i yasaklıyor) — karar ikili.
- Kokpit: birden çok uzman rolü olan kullanıcı tek pano görür (öncelik sırası kodda); banka toplamı yalnızca TRY hesapları.
- Fatura tutarları 4 ondalıklı kuruş-altı kalabiliyor (ör. 919,9999): KDV dahil liste fiyatının net fiyata çevrilmesinden; kalıcı çözüm satır/toplamların 2 ondalığa yuvarlanması (Satış/Muhasebe).
- Ana veri: bazı SKU'larda `products.weightKg` boş (Excel kaynaklı) → ihracat packing list net/brüt kg 0 görünebilir.
