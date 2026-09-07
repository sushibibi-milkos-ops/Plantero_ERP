/** Tur 8 kritik puan kartı güncellemesi (docs/DESIGN-SCORECARD.md). */
import { readFileSync, writeFileSync } from 'node:fs';

const p = 'artifacts/critic/ihracat.json';
const card = JSON.parse(readFileSync(p, 'utf8')) as any;
const R = card.routes as Record<string, any>;

card.round = 8;
card.shipmentIdUsed = '55c8d9d4-d91f-4db5-aa15-4d3861bfb52a (EXP-2026-000002)';
card.measurements = {
  ...(card.measurements ?? {}),
  round8:
    'artifacts/critic/measure-ihracat-r8/*.json (6 rota × 1440x900 + 390x844); sütun slack: scripts/probe-ihracat-r8-fix.ts; ' +
    'ek ölçüm: scripts/probe-ihracat-r8c.ts (kur delta ondalıkları + detay Belgeler sekmesi tablo/panel oranı); ' +
    'ekran görüntüleri: artifacts/screens/ihracat-*/{desktop,mobile}.png + artifacts/screens/ihracat-r8c-tabs/*.png (4 sekme × 2 viewport).',
};
card.note =
  'Tur 8. Tur 7 sonrası commit 10aa15a ("4 tablo sütun genişliği") yeniden ölçüldü. KAPANDI: ihracat-belgeler-03 (5 sütunun tamamı slack ≤114px), ' +
  'ihracat-gtip-09 (Ürün 519/420 → 99), ihracat-detay-18 kısmen (Sipariş satırları Ürün slack 380→24, Çeki listesi 230→24). ' +
  'AÇILDI: ihracat-detay-19 (P1) — Belgeler sekmesindeki slack, tabloyu 365px\'e küçülterek "çözülmüş": panel 1152px, araç çubuğu 1152px, tablo/thead/satır 365px → sağda 787px (%68) ölü blok; ' +
  'ihracat-kurlar-11 (P2) — yeni "Günlük değişim" sütununda 25 satırın 4\'ü tek ondalıklı (formatPct minimumFractionDigits:0), sağa hizalı tabular sütunda virgül kayıyor; ' +
  'ihracat-kurlar-12 (P2) — aynı sütunun slack\'i 203px (width:200 verilmiş ama auto-layout 320px\'e şişiriyor). ' +
  'Kod taraması temiz: modül dosyalarında transition-all / ease-in / scale(0) / ≥300ms süre / transform-origin yok; hover globals.css\'te (hover:hover) ile kapılı. ' +
  'Sonuç: 6 rotanın 5\'i kazanıyor, /ihracat/sevkiyatlar/[id] açık P1 nedeniyle kaybediyor.';

// 1) /ihracat/sevkiyatlar — değişiklik yok
R['/ihracat/sevkiyatlar'].round = 8;
R['/ihracat/sevkiyatlar'].scoreNotes =
  'Tur 7→8: 60 → 60. Yeniden ölçüldü (measure-ihracat-r8/sevkiyatlar-{1440,390}.json, probe-ihracat-r8-fix.ts): 1440x900 scrollWidth=clientWidth=1440, ' +
  'tbody 4/4 satır 36px, gövde 13px (51 düğüm), h1 24/600, 23 renk; 10 sütunun slack profili sağlıklı (en geniş Durum 45px, medyan 26px, hiçbiri >45px). ' +
  '390x844: scrollWidth=clientWidth=390, kart 63,5px, 44px altı etkileşimli hedef 0 (yalnız breadcrumb metni). Yeni bulgu yok.';

// 2) /ihracat/sevkiyatlar/[id]
const det = R['/ihracat/sevkiyatlar/[id]'];
det.round = 8;
det.scores = [5, 5, 4, 5, 4, 5, 5, 5, 5, 5, 5, 5];
det.total = 58;
det.scoreNotes =
  'Tur 7→8: 59 → 58. Kriter 5: 5→4 (GEREKÇELİ DÜŞÜŞ — yeni ölçüm scripts/probe-ihracat-r8c.ts): Belgeler sekmesinde tablo, thead şeridi ve satır ayraçları 365px\'te bitiyor, ' +
  'oysa sekme paneli ve üstündeki araç çubuğu (arama + Durum + "8 kayıt" + sütun seçici) 1152px — sağda 787px boş blok, tablo panelin sol üçte birine sıkışmış (ihracat-detay-19). ' +
  'Kriter 3 hâlâ 4: aynı ölçüm, bilgi/piksel oranı panelin %32\'sinde. Tur 7\'nin diğer slack bulguları KAPANDI: Sipariş satırları Ürün 292/268 → slack 24 (önce 380), ' +
  'Çeki listesi Ürün 246/222 → 24 (önce 230). Diğer 10 kriter 5: DocumentChain 4 düğüm kendi para birimiyle (€16.800,00 / ₺624.960,00), Fatura & kur sekmesinde ' +
  'Kur (TCMB) ₺37,2000 + kur tarihi 07.09.2026 /ihracat/kurlar ile birebir, "Henüz bağlı fatura yok" boş durumu ikon+başlık+açıklama ile özenli, ' +
  '1440 ve 390\'da taşma yok (measure-ihracat-r8/detay-*.json), 390\'da 44px altı hedef yalnızca breadcrumb + inline belge linki.';
det.open = [
  {
    id: 'ihracat-detay-19',
    criterion: 5,
    severity: 'P1',
    text:
      'Belgeler sekmesinde tablo panelin sol üçte birine sıkışıyor: araç çubuğu (arama + Durum filtresi + "8 kayıt" + sütun seçici) ve panel 1152px genişlikte, ' +
      'ama <table>, thead arka plan şeridi ve satır ayraç hairline\'ları 365px\'te kesiliyor; sağda 787px boş blok kalıyor. ' +
      'Tur 7\'de "Belge sütunu 982px\'e şişiyor" bulgusu (ihracat-detay-18) documents-table.tsx:137\'deki `[&_table]:!w-auto [&_table]:!min-w-0` ile tabloyu küçülterek kapatıldı — ' +
      'ölü alan sütunun içinden tablonun sağına taşındı, ortadan kalkmadı. Aynı bileşen /ihracat/belgeler\'de 1152px genişlikte render ediliyor (aynı bileşen, iki farklı anatomi).',
    measure:
      '1440x900, scripts/probe-ihracat-r8c.ts: panelWidth=1152, toolbarWidth=1152, tableWidth=365, theadRowWidth=365, rowWidth=365 → deadRightPx=787 (panelin %68\'i). ' +
      'Ekran görüntüsü: artifacts/screens/ihracat-r8c-tabs/documents-desktop.png',
    target:
      'Tablo genişliği ≥ panelin %95\'i (≥1094px) VE hiçbir sütunun slack\'i >150px. Kalıp kurlar-10 düzeltmesiyle aynı: boşluğu bilgiyle doldur — ' +
      'documents-table.tsx\'te showShipmentColumn=false varyantında `docNo` (Belge no) ve `dueDate` (Vade) sütunları `sparseDefault` yerine varsayılan görünür olsun ' +
      '(4–5 gerçek sütun 1152px\'i doldurur) ve satır 137\'deki `[&_table]:!w-auto [&_table]:!min-w-0` kilidi kaldırılsın. ' +
      'Alternatif kabul: gömülü sekmede DataTable araç çubuğu (arama+filtre+sayaç+sütun seçici) kapatılıp panel genişliğinde kompakt liste render edilsin — ' +
      'ölçüt her iki durumda da tablo/liste genişliği ile panel genişliği farkı ≤58px.',
    file: 'apps/web/src/modules/export/components/documents-table.tsx:104-112,137',
    openedRound: 8,
  },
];
det.closed = [
  ...det.closed,
  {
    id: 'ihracat-detay-18',
    closedRound: 8,
    verifiedBy:
      'ölçüm (scripts/probe-ihracat-r8-fix.ts): Sipariş satırları Ürün width 292 / maxContent 268 → slack 24 (tur 7: 562/182 → 380); ' +
      'Çeki listesi Ürün 246/222 → 24 (tur 7: 412/230 → 230). Belgeler sekmesi kısmı ise slack\'i taşıyarak kapatıldığı için yeni bulgu ihracat-detay-19 olarak açıldı.',
  },
];

// 3) /ihracat/sevkiyatlar/yeni
R['/ihracat/sevkiyatlar/yeni'].round = 8;
R['/ihracat/sevkiyatlar/yeni'].scoreNotes =
  'Tur 7→8: 60 → 60. Yeniden ölçüldü (measure-ihracat-r8/yeni-{1440,390}.json): 1440 ve 390\'da scrollWidth=clientWidth, h1 24/600 (mobil 20/600), gövde 13px, ' +
  '13 renk (1440) / 12 (390) — modüldeki en dar palet, tek kolon → iki kolon (md) form, alt eylem çubuğu "Vazgeç | Sevkiyat oluştur". ' +
  '390\'da 44px altı hedef yalnızca breadcrumb metni ve görünmez native select shim\'leri (w=h=1px; gerçek dokunma hedefi 44px sarmalayıcı). Yeni bulgu yok.';

// 4) /ihracat/belgeler
const bel = R['/ihracat/belgeler'];
bel.round = 8;
bel.scores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
bel.total = 60;
bel.scoreNotes =
  'Tur 7→8: 59 → 60. Kriter 3: 4→5 (GEREKÇELİ ARTIŞ — ihracat-belgeler-03 kapandı): 5 sütunun tamamının slack\'i ≤114px (Belge 330/220→110, Sevkiyat 225/150→75, ' +
  'Müşteri 342/228→114, Durum 195/91→104, Eylemler 60/50→10); tur 7\'de üç sütunda toplam 528px ölü alan vardı. Diğer 11 kriter 5: 40 satır × 36px, gövde 13px (138 düğüm), ' +
  '22 renk, taşma yok; 390x844 kart 60px, 44px altı hedef 0, durum rozetleri sessiz (Gerekmiyor gri / Gerekli amber / Gönderildi mavi / Alındı yeşil).';
bel.closed = [
  ...bel.closed,
  {
    id: 'ihracat-belgeler-03',
    closedRound: 8,
    verifiedBy:
      'ölçüm (scripts/probe-ihracat-r8-fix.ts): Belge 330/220 → slack 110 (tur 7: 403/192 → 211), Müşteri 342/228 → 114 (316/146 → 171), Sevkiyat 225/150 → 75 (263/117 → 146). Hedef ≤120px karşılandı.',
  },
];

// 5) /ihracat/kurlar
const kur = R['/ihracat/kurlar'];
kur.round = 8;
kur.scores = [5, 5, 4, 5, 5, 4, 5, 5, 5, 5, 5, 5];
kur.total = 58;
kur.scoreNotes =
  'Tur 7→8: 59 → 58 (referans Stripe 56 — kazanma korunuyor, iki bulgu da P2). Kriter 6: 5→4 (GEREKÇELİ DÜŞÜŞ — yeni ölçüm probe-ihracat-r8c.ts): ' +
  'yeni "Günlük değişim" sütununda 25 satırın 21\'i iki ondalıklı, 4\'ü tek ondalıklı ("+%0,5", "-%0,6"×3) → sağa hizalı tabular-nums sütunda ondalık virgülü 4 satırda kayıyor. ' +
  'Kriter 3 hâlâ 4: aynı sütun width 320 / maxContent 117 → slack 203px (modüldeki en büyük slack); diğer 5 sütun ≤113px. ' +
  'Diğer 10 kriter 5: 25 satır × 36px, 4 ondalık ₺ kurlar tabular ve sağ hizalı, KPI iki blok dikey ince ayraçla, çizgi grafik iki seri (EUR mor / USD mavi) + susturulmuş grid + gölgesiz kart, ' +
  '1440/390\'da taşma yok, 390\'da 44px altı hedef 0, sayfalama 1–25 / 180, delta mobil kartta da görünüyor.';
kur.open = [
  {
    id: 'ihracat-kurlar-11',
    criterion: 6,
    severity: 'P2',
    text:
      '"Günlük değişim" sütunu satırdan satıra farklı ondalık basıyor: çoğu satır iki ondalık (+%0,74), dördü tek ondalık (+%0,5 / -%0,6). ' +
      'Sağa hizalı tabular-nums sütunda ondalık virgülü hizasını kaybediyor. Kök neden: hücre formatPct(d, 2) çağırıyor, formatPct ise ' +
      'Intl.NumberFormat\'a minimumFractionDigits: 0 veriyor (apps/web/src/lib/format.ts:89-97) — sondaki sıfır kırpılıyor.',
    measure:
      '1440x900 /ihracat/kurlar, scripts/probe-ihracat-r8c.ts: dailyChange 25 hücre → ondalık dağılımı {2: 21, 1: 4}; örnek "+%0,5", "-%0,6", "-%0,6", "-%0,6".',
    target:
      'Sütundaki 25/25 hücre aynı ondalık sayısıyla (2) basılsın; ölçüt: decimalDistribution = {2: 25}. ' +
      'Paylaşılan format.ts DEĞİŞTİRİLMEDEN rates-table.tsx hücresinde sabit iki ondalıklı yerel biçimlendirme kullanılsın ' +
      '(ör. Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%" öneki).',
    file: 'apps/web/src/modules/export/components/rates-table.tsx:89-100',
    openedRound: 8,
  },
  {
    id: 'ihracat-kurlar-12',
    criterion: 3,
    severity: 'P2',
    text:
      '"Günlük değişim" sütununa meta.width: 200 verilmiş ama DataTable\'ın auto table-layout\'u onu 320px\'e şişiriyor (kalan genişliği width\'i olan sütunlara da oransal yayıyor) — ' +
      'sütunun %63\'ü boş. Modüldeki en büyük tekil slack.',
    measure: '1440x900, scripts/probe-ihracat-r8-fix.ts: Günlük değişim width=320 / maxContent=117 → slack=203; diğer 5 sütun slack 72–113.',
    target:
      'Slack ≤120px. channels-table.tsx kalıbı: TD\'ye meta.width VE içerik span\'ine birebir aynı `max-w-[200px]` kilidi; ' +
      'ölçüt: probe-ihracat-r8-fix.ts çıktısında kurlar tablosunun hiçbir sütununda slack > 120.',
    file: 'apps/web/src/modules/export/components/rates-table.tsx:89',
    openedRound: 8,
  },
];
kur.closed = [
  ...kur.closed,
  {
    id: 'ihracat-kurlar-10-r8-dogrulama',
    closedRound: 8,
    verifiedBy:
      'yeniden ölçüm (probe-ihracat-r8-fix.ts): Tarih 160/71→88, Para birimi 161/89→72, Alış 176/62→113, Satış 176/62→113, Kaynak 160/71→89 — hepsi ≤120px, ' +
      'ancak yeni eklenen Günlük değişim sütunu 203px slack taşıyor (ihracat-kurlar-12 olarak açıldı) ve ondalık tutarlılığı bozuk (ihracat-kurlar-11).',
  },
];

// 6) /ihracat/gtip
const gtip = R['/ihracat/gtip'];
gtip.round = 8;
gtip.scores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
gtip.total = 60;
gtip.scoreNotes =
  'Tur 7→8: 59 → 60. Kriter 3: 4→5 (GEREKÇELİ ARTIŞ — ihracat-gtip-09 kapandı): Ürün sütunu 519/420 → slack 99 (tur 7: 692/353 → 339); ' +
  'diğer sütunlar SKU 179/70→109, Tip 151/71→81, GTİP 303/279→24. Diğer 11 kriter 5: 39 satır × 36,5–37px, gövde 13px (176 düğüm), 15 renk (modüldeki en disiplinli palet), ' +
  'GTİP hücresi satır içi select (mobil 44px / masaüstü 36px, şeffaf kenarlık → hover:border-input), 4 GTİP kodu kartı başlık+açıklama+birim ile, ' +
  '1440 ve 390\'da taşma yok, 390\'da 44px altı hedef 0.';
gtip.closed = [
  ...gtip.closed,
  {
    id: 'ihracat-gtip-09',
    closedRound: 8,
    verifiedBy: 'ölçüm (scripts/probe-ihracat-r8-fix.ts): Ürün width 519 / maxContent 420 → slack 99 (tur 7: 692/353 → 339). Hedef ≤120px karşılandı.',
  },
];

writeFileSync(p, JSON.stringify(card, null, 1) + '\n', 'utf8');
console.log('ok');
