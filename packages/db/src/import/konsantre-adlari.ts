/**
 * Konsantre mamul adı düzeltmesi (docs/ASSUMPTIONS.md A16).
 *
 * Kullanıcı kararı: "Badem Sütü Konsantresi son üründür, Badem Bazı ara üründür, badem hammaddedir."
 * Ana Veri Excel'inde satılabilir konsantre mamuller "X BAZI" adıyla gelir; bu ad yarı mamulün
 * ("Badem Bazı 250ml") adıyla karışır. Aşağıdaki tablo, mamullerin adını "X Sütü Konsantresi" kalıbına çeker.
 *
 *  - SKU ve barkodlar DEĞİŞMEZ.
 *  - CLAUDE.md kural 6 ("ürün adları Excel'den geldiği gibi kalır") korunur: bu bir iş kararıdır ve tek seferlik,
 *    audit'li yeniden adlandırmadır (`seed/uretim-bom.ts` → `updateProduct` + `allowIdentityChange` + gerekçe).
 *  - `from` Excel'deki ad ile BİREBİR aynı olmalıdır (test doğrular); farklıysa yeniden adlandırma atlanır.
 *  - Barista mamulleri (120xxxxxx "BARISTA BASE - …") kapsam dışıdır; kullanıcıya sorulacak (rapor).
 */
export type ConcentrateRename = { sku: string; from: string; to: string };

export const CONCENTRATE_RENAME_REASON = 'A16 — Konsantre mamul adı kullanıcı kararıyla Excel ana verideki "X BAZI" yerine "X Sütü Konsantresi" olarak düzeltildi (Badem Bazı = ara ürün, Badem Sütü Konsantresi = son ürün)';

export const CONCENTRATE_RENAMES: ConcentrateRename[] = [
  { sku: '110010001', from: 'BADEM BAZI', to: 'Badem Sütü Konsantresi' },
  { sku: '110010002', from: '2x Badem Bazı', to: '2x Badem Sütü Konsantresi' },
  { sku: '110010003', from: '3x Badem Bazı', to: '3x Badem Sütü Konsantresi' },
  { sku: '110010006', from: '6x Badem Bazı', to: '6x Badem Sütü Konsantresi' },
  { sku: '110020001', from: 'FINDIK BAZI', to: 'Fındık Sütü Konsantresi' },
  { sku: '110020002', from: '2x Fındık', to: '2x Fındık Sütü Konsantresi' },
  { sku: '110020003', from: '3x Fındık Bazı', to: '3x Fındık Sütü Konsantresi' },
  { sku: '110020006', from: '6x Fındık Bazı', to: '6x Fındık Sütü Konsantresi' },
  { sku: '110030001', from: 'KAJU BAZI', to: 'Kaju Sütü Konsantresi' },
  { sku: '110030002', from: '2x Kaju Bazı', to: '2x Kaju Sütü Konsantresi' },
  { sku: '110030003', from: '3x Kaju Bazı', to: '3x Kaju Sütü Konsantresi' },
  { sku: '110030006', from: '6x Kaju Bazı', to: '6x Kaju Sütü Konsantresi' },
  { sku: '110030101', from: 'Kaju Bazı ABD_alternatif', to: 'Kaju Sütü Konsantresi (ABD alternatif)' },
  { sku: '110040001', from: 'YULAF BAZI', to: 'Yulaf Sütü Konsantresi' },
];
