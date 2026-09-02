# Modül: Ana Veri (masterdata)

Route kökü `/ana-veri`, izinler `masterdata.view` / `masterdata.manage`, core `packages/core/src/masterdata/**`, web `apps/web/src/modules/masterdata/**`, seed ilgili kısımlar zaten var (`seed/masterdata.ts`).

## Ekranlar
1. `/ana-veri/urunler` — Linear tarzı tablo: SKU (mono), kısa kod, ürün adı, kategori (2→3), tip rozeti, ambalaj, barkod (mono), durum, eldeki stok (tüm depolar), birim maliyet, satış fiyatı. Üstte: arama (ad/SKU/barkod/kısa kod), tip filtresi, kategori filtresi, durum filtresi, "Yeni ürün", "Excel'den içe aktar". Satır tıklama → detay. 84+ ürünle akıcı; 1000+ için Virtuoso.
2. `/ana-veri/urunler/[id]` — Başlık: ad + SKU + durum; sekmeler: Genel (tüm alanlar, düzenle), Barkodlar (ana + ek; EAN-13 checksum doğrulama; aynı barkod başka SKU'da → GS1 uyarısı), Stok (depo/lokasyon/lot kırılımı, SKT rozetleri), Reçete (aktif BOM + versiyonlar), Fiyatlar (fiyat listesi satırları + müşteri özel fiyatlar), Tedarikçiler (supplier_products), Hareketler (stock_moves son 100), Denetim (audit_log).
3. `/ana-veri/urunler/yeni` — **Konuşan kod sihirbazı**: T → AA → BB → CC → PP segment seçicileri (sku_segments'ten, bağlama göre filtreli), canlı SKU önizleme, "sıradaki boş kod" önerisi (aynı T·AA·BB·CC altında en büyük PP+1 veya seçilen ambalaj kodu), çakışma kontrolü, kısa kod otomatik (PLT-/HAM-/EKP-/DMB- + kısaltma), ad/barkod/kategori (segmentten otomatik), uom, KDV, raf ömrü, min/max, tedarikçi. Ürün adı ve barkod **oluşturulduktan sonra kilitlenir** (düzenleme ekranında salt okunur; değiştirme yalnızca `admin.settings` izniyle ve audit gerekçesiyle).
4. `/ana-veri/kod-yapisi` — Segment sözlüğü (T/AA/BB/CC/PP tabloları), yeni kod ekleme (rezerve işaretleme), kurallar metni (Excel "Kurallar").
5. `/ana-veri/cariler` — tablo: kod, ad, tip (müşteri/tedarikçi/ikisi), kanal, vade, bakiye (renkli: alacak yeşil/borç kırmızı), kalite skoru (tedarikçi), aktif. Filtre tip/kanal; arama. Detay: Genel, Adresler, Kişiler, Bakiye & Hareketler (faturalar/tahsilatlar/siparişler listesi — kanal), Özel Fiyatlar, Tedarikçi Ürünleri, Kalite Skoru, Denetim. Form: yeni cari (kod otomatik `C-000001`/`S-000001`), VKN doğrulama (10/11 hane), e-fatura mükellefi bayrağı.
6. `/ana-veri/receteler` — BOM listesi (ürün, versiyon, durum, çıktı miktarı, hesaplanan birim maliyet); detay: satırlar (ürün, miktar, uom, fire %, yan ürün), **canlı maliyet toplaması** (satır maliyeti = miktar × (lot ortalama maliyeti | averageCost | son alış fiyatı), genel gider, verim → birim maliyet), versiyon geçmişi, "Yeni versiyon" (kopyala), "Aktifleştir" (aynı ürünün diğer aktif BOM'unu arşivler), "Arşivle". Form: ürün combobox (mamul/yarı mamul), satır ekle/sil/sırala.
7. `/ana-veri/depolar` — Tire + Buca: lokasyon ağacı (katlanabilir), her düğümde eldeki değer/miktar özet, usage rozeti; lokasyon ekle/düzenle; etiket yazdır (QR: `LOC:<code>`), barkod ata.
8. `/ana-veri/import` — **Excel import sihirbazı**: dosya yükle (anaveri.xlsx) → `parseAnaVeri` → önizleme tablosu (yeni / değişen alanlar (diff) / çakışma: ad veya barkod farklı → "korunacak", uyarılar) → "Deneme çalıştır" özet → "Uygula" (importAnaVeri) → sonuç + audit. Aynı dosya ikinci kez → 0 değişiklik.

## Core servisleri
- `masterdata/products.ts`: `createProduct`, `updateProduct` (ad/barkod değişimi reddedilir; `allowIdentityChange` yalnızca admin), `suggestNextSku(tx, segments)`, `validateSku`, `generateShortCode`, `isValidEan13`, `findByBarcode(tx, code)` (products.barcode, caseBarcode, product_barcodes, ayrıca `LOT:`/`LOC:` önekli QR çözümü → `scan/resolve.ts`).
- `masterdata/partners.ts`: CRUD, `nextPartnerCode`, `getPartnerSummary` (bakiye, açık fatura, son sipariş).
- `masterdata/boms.ts`: `createBomVersion`, `activateBom`, `archiveBom`, `explodeBom(tx, bomId, qty)` → satır miktarları (fire dahil), `rollupBomCost(tx, bomId)` → { lines[], materialCost, overhead, unitCost }.
- `masterdata/locations.ts`: `createLocation` (path türetme), `getLocationTree(warehouseId)` (quant özetleriyle), `getDescendantIds`.

## Kabul kriterleri
- Excel'deki 84 satırın adı ve barkodu DB ile birebir (SQL kanıtı).
- Yeni ürün sihirbazı `110010012` gibi bir kod önerir ve çakışmayı engeller.
- BOM maliyeti reçete değişince anında güncellenir (client tarafı hesap + server doğrulama).
- Tüm ekranlar 390px'te kullanılabilir.
