/** Tur 7 — ihracat puan kartı güncellemesi (docs/DESIGN-SCORECARD.md). */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const p = resolve(process.cwd(), 'artifacts/critic/ihracat.json');
const card = JSON.parse(readFileSync(p, 'utf8')) as any;
const R = 7;

type Open = { id: string; criterion: number; severity: string; text: string; measure: string; target: string; file: string; openedRound: number };

const set = (route: string, scores: number[], note: string, open: Open[] = []) => {
  const r = card.routes[route];
  r.round = R;
  r.scores = scores;
  r.total = scores.reduce((a: number, b: number) => a + b, 0);
  r.scoreNotes = note;
  r.open = open;
};

set('/ihracat/sevkiyatlar', [5,5,5,5,5,5,5,5,5,5,5,5],
  'Tur 6→7: 60 → 60. Yeniden ölçüldü (artifacts/critic/measure-ihracat-r7/sevkiyatlar-{1440,390}.json + scripts/probe-ihracat-r7.ts): 1440x900 scrollWidth=clientWidth=1440, tbody 3/3 satır 36px, gövde 13px (49 düğüm), h1 24/600, 22 renk; sütun slack profili sağlıklı (en geniş slack Durum 58px, medyan 27px) — 10 sütun 1152px içinde dengeli. Satır: h-9 + cursor-pointer + hover:bg-accent/50 + focus-visible:outline-2 + tabindex=0. Boş sonuç durumu ikon+başlık+ipucu ile özenli (artifacts/critic/ihracat-r7-bos-1440.png). 390x844: scrollWidth=clientWidth=390, kart 63,5px, 44px altı etkileşimli hedef 0. Yeni bulgu yok.');

set('/ihracat/sevkiyatlar/[id]', [5,5,4,5,5,5,5,5,5,5,5,5],
  'Tur 6→7: 60 → 59. Kriter 3: 5→4 (GEREKÇELİ DÜŞÜŞ — bu tur ilk kez sütun-slack ölçümü yapıldı, scripts/probe-ihracat-r7.ts): "Belgeler" sekmesinde tablo 3 sütuna düşüyor ve "Belge" sütunu 982px genişliğe şişiyorken en uzun içerik 192px → 790px ölü alan (tablonun %69\'u); "Sipariş satırları" sekmesinde "Ürün" 562px / içerik 182px → 380px slack; "Çeki listesi" sekmesinde "Ürün" 412px / 230px → 230px slack. Ekran görüntüsünde belge adı ile durum rozeti arasında bir ekran boyu boşluk var. Diğer 11 kriter 5: DocumentChain 4 düğüm her biri kendi para birimiyle, Fatura & kur sekmesinde Kur ₺37,2000 / kur tarihi 15.08.2026 /ihracat/kurlar ile birebir, 1440 ve 390\'da taşma yok, 390\'da 44px altı hedef 0 (yalnızca metin breadcrumb/inline link).',
  [{ id: 'ihracat-detay-18', criterion: 3, severity: 'P2', text: 'Sevkiyat detayındaki üç sekme tablosunda ilk (esnek) sütun kalan genişliğin tamamını yutuyor: "Belgeler" sekmesinde Belge 982px, "Sipariş satırları"nda Ürün 562px, "Çeki listesi"nde Ürün 412px — hepsinde meta.width tanımı yok, DataTable auto table-layout kalan alanı bu sütuna yığıyor.', measure: '1440x900, tablo 1152px (probe-ihracat-r7.ts): detay-belgeler Belge width 982 / maxContent 192 → slack 790; detay-siparis Ürün width 562 / 182 → slack 380; detay-ceki Ürün width 412 / 230 → slack 230.', target: 'Her tabloda en geniş sütunun slack\'i ≤120px: documents-table.tsx:53 name sütununa meta.width 300, order-lines-table.tsx Ürün sütununa meta.width 320, packing-list-table.tsx Ürün sütununa meta.width 300 + içerik max-w truncate kilidi (satis modülünün Tur 11 kalıbı).', file: 'apps/web/src/modules/export/components/documents-table.tsx:53, order-lines-table.tsx, packing-list-table.tsx', openedRound: R }]);

set('/ihracat/sevkiyatlar/yeni', [5,5,5,5,5,5,5,5,5,5,5,5],
  'Tur 6→7: 60 → 60. Yeniden ölçüldü (measure-ihracat-r7/yeni-{1440,390}.json): 1440 ve 390\'da scrollWidth=clientWidth, h1 24/600 (1440) ve 20/600 (390), gövde 13px, 13 renk (1440) / 12 (390), tek kolon → iki kolon (md) form, yapışkan eylem çubuğu "Vazgeç | Sevkiyat oluştur". 390\'da 44px altı hedef yalnızca breadcrumb metni ve görünmez native select shim\'leri (w=h=1, ekranda görünmüyor; gerçek dokunma hedefi sarmalayıcı 44px). Yeni bulgu yok.');

set('/ihracat/belgeler', [5,5,4,5,5,5,5,5,5,5,5,5],
  'Tur 6→7: 60 → 59. Kriter 3: 5→4 (GEREKÇELİ DÜŞÜŞ — bu tur ilk kez sütun-slack ölçümü yapıldı): 1152px\'lik tabloda görünen 5 sütunun 3\'ü esnek ve toplam 528px ölü alan taşıyor (Belge 403/192 → 211, Müşteri 316/146 → 171, Sevkiyat 263/117 → 146) — tablonun %46\'sı boş. "Belge no", "Vade", "Sorumlu" sütunları sparseDefault ile gizli olduğu için kalan genişlik üç metin sütununa yığılıyor, oysa KPI şeridi "Vadesi geçmiş" ve "Sorumlusuz" sayılarını gösteriyor. Diğer 11 kriter 5: 30 satır × 36px, gövde 13px (112 düğüm), 22 renk, taşma yok; 390x844 kart 60px, 44px altı hedef 0, durum rozetleri sessiz (Gerekmiyor gri / Gerekli amber / Gönderildi mavi / Alındı yeşil).',
  [{ id: 'ihracat-belgeler-03', criterion: 3, severity: 'P2', text: 'Belgeler listesinde üç metin sütunu (Belge, Sevkiyat, Müşteri) meta.width taşımıyor; DataTable auto table-layout kalan 528px\'i bunlara yığıyor ve tablo ortasında ekran boyu ölü alan oluşuyor.', measure: '1440x900, tablo 1152px, 30 satır (probe-ihracat-r7.ts): Belge width 403 / maxContent 192 → slack 211; Sevkiyat 263/117 → 146; Müşteri 316/146 → 171; toplam ölü alan 528px = tablo genişliğinin %46\'sı.', target: 'En geniş sütunun slack\'i ≤120px: documents-table.tsx:53 name meta.width 260, :56 shipmentDocNo meta.width 150, :57 partnerName meta.width 220 (+ max-w truncate). Alternatif/ek: "Vade" ve "Sorumlu" sütunlarını varsayılan görünür yapmak (KPI\'lardaki "Vadesi geçmiş"/"Sorumlusuz" ile aynı veriyi tabloda da göstermek) — boşluğu ölü alan yerine bilgiyle doldurur.', file: 'apps/web/src/modules/export/components/documents-table.tsx:53,56,57,76,77', openedRound: R }]);

set('/ihracat/kurlar', [5,5,4,5,5,5,5,5,5,5,5,5],
  'Tur 6→7: 59 → 59 (değişiklik yok). Kriter 3 hâlâ 4 (referans Stripe da 4 — kazanmayı engellemiyor): 1152px\'lik tabloda 5 sütun, Kaynak 264/71 → 194px slack, Alış 227/62 → 164px, Satış 227/62 → 164px; "TCMB"/"EUR" gibi kısa değerler geniş sütunlarda yüzüyor. Diğer 11 kriter 5: 25 satır × 36px, 4 ondalık ₺ kurlar tabular ve sağ hizalı, KPI iki blok dikey ince ayraçla (USD satış ₺34,2237 / EUR satış ₺37,4000 + altında soluk "Alış"), çizgi grafik iki seri (EUR mor / USD mavi) + susturulmuş yatay grid + gölgesiz kart, 1440 ve 390\'da taşma yok, 390\'da 44px altı hedef 0, sayfalama 1–25 / 180.',
  [{ id: 'ihracat-kurlar-10', criterion: 3, severity: 'P2', text: 'Kur tablosunun 5 sütunu 1152px\'e eşit dağıtılıyor; en uzun değerler 62–71px olmasına rağmen sütunlar 227–264px — üç sütunda toplam 522px ölü alan.', measure: '1440x900, tablo 1152px, 25 satır (probe-ihracat-r7.ts): Kaynak width 264 / maxContent 71 → slack 194; Alış 227/62 → 164; Satış 227/62 → 164.', target: 'En geniş sütunun slack\'i ≤120px: rates-table.tsx sütunlarına meta.width (Tarih 130, Para birimi 110, Alış 140, Satış 140, Kaynak 120) verilip tabloyu sola toplamak ya da bir "Günlük değişim %" sütunu eklemek (Stripe kalıbı: karşılaştırma deltası) — boşluğu bilgiyle doldurur.', file: 'apps/web/src/modules/export/components/rates-table.tsx', openedRound: R }]);

set('/ihracat/gtip', [5,5,4,5,5,5,5,5,5,5,5,5],
  'Tur 6→7: 59 → 59 (değişiklik yok). Kriter 3 hâlâ 4: "Ürün" sütunu 692px, en uzun içerik 353px → 339px slack (probe-ihracat-r7.ts gtip). Diğer 11 kriter 5: 39 satır × 36,5–37px, gövde 13px (183 düğüm), 15 renk (modüldeki en disiplinli palet), GTİP hücresi satır içi select (mobil 44px / masaüstü 36px, şeffaf kenarlık → hover:border-input), 4 GTİP kodu kartı başlık+açıklama+birim ile, 1440 ve 390\'da taşma yok, 390\'da 44px altı hedef 0.',
  [{ id: 'ihracat-gtip-09', criterion: 3, severity: 'P2', text: '"Ürün" sütunu meta.width taşımadığı için kalan genişliği yutuyor; ürün adı ile "Tip" sütunu arasında ~340px ölü alan var.', measure: '1440x900, tablo 1152px, 39 satır (probe-ihracat-r7.ts): Ürün width 692 / maxContent 353 → slack 339 (SKU 130/70, Tip 110/71, GTİP 220/196 sağlıklı).', target: 'Ürün sütununa meta.width 380 + max-w-[380px] truncate; en geniş sütunun slack\'i ≤120px.', file: 'apps/web/src/modules/export/components/gtip-mapping-table.tsx', openedRound: R }]);

card.round = R;
writeFileSync(p, JSON.stringify(card, null, 2) + '\n');
console.log('güncellendi', p);
for (const [k, v] of Object.entries(card.routes) as any) console.log(k, v.total, JSON.stringify(v.scores), 'open:', v.open.length);
