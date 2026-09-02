# Modül: Ar-Ge (rnd)

Route `/arge`, izinler `rnd.*`, core `packages/core/src/rnd/**`, web `apps/web/src/modules/rnd/**`, seed `seed/rnd.ts`.

1. `/arge/projeler` — proje kartları (kod, ad, durum, hedef ürün/SKU adayı, sahibi, hedef maliyet vs güncel simülasyon maliyeti, hedef lansman), yeni proje (kolon şablonu: Fikir / Formülasyon / Pilot Üretim / Duyusal Test / Raf Ömrü / Onay — özelleştirilebilir).
2. `/arge/projeler/[id]/board` — **Trello mantığı kanban**: kolonlar (yeniden adlandır, sırala, ekle/sil, WIP limiti, "tamamlandı" işareti), kartlar (dnd-kit sürükle: kolonlar arası ve sıralama; başlık, etiketler, atanan, son tarih, kontrol listesi ilerleme, yorum sayısı, bağlı deneme reçetesi versiyonu), kart drawer (açıklama, kontrol listesi, yorumlar, ekler, reçete bağı). Klavye: N yeni kart. Animasyon: sürüklemede spring (motion), kolon geçişinde layout animasyonu — apple-design kurallarına göre (interruptible).
3. `/arge/projeler/[id]/receteler` — deneme reçeteleri: versiyon listesi (v1, v2… durum, birim maliyet, değişiklik notu), **canlı maliyet simülasyonu** (satır ekle/çıkar/miktar değiştir → anında birim maliyet; maliyet kaynağı seçici: ortalama / son alış / manuel; verim ve genel gider; hedef maliyetle karşılaştırma çubuğu; versiyonlar arası fark tablosu), duyusal/analiz sonuçları alanı, "Yeni versiyon" (kopya), "Onaya gönder" (approvals kind 'recipe_release') → **"Üretim BOM'una devret"** (`releaseToBom`: boms yeni versiyon `sourceTrialVersionId`, satırlar kopya, aktifleştirme opsiyonu, ürün yoksa Ana Veri sihirbazına yönlendirme ile SKU oluşturma), tek tık.
4. `/arge/receteler` — tüm deneme reçeteleri listesi (proje, versiyon, durum, maliyet).

Core: `rnd/board.ts` (`moveCard`, `reorderColumn`, ...), `rnd/trials.ts` (`simulateCost`, `createVersion`, `submitForApproval`, `releaseToBom`).
Seed: 3 proje (Fıstık Bazı — yeni SKU adayı 110050001; Şekersiz Protein — mevcut ürün; Oat Barista v2), board kartları her kolonda, 2-3 reçete versiyonu (biri onaylanıp BOM'a devrolmuş: masterdata'da o BOM `sourceTrialVersionId` dolu).
Kabul: kart sürükleme kalıcı; maliyet simülasyonu = Σ miktar × maliyet ÷ (batch × verim) + genel gider (test); devir sonrası BOM aktif ve iş emri açılabilir.
