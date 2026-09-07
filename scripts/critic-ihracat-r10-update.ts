/** Tur 10: ihracat puan kartını güncelle (docs/DESIGN-SCORECARD.md protokolü). */
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'artifacts/critic/ihracat.json';
const card = JSON.parse(readFileSync(P, 'utf8'));

card.round = 10;
card.shipmentIdUsed = '1a86b964-2697-43e7-84a5-b2650344fe39 (EXP-2026-000002, gümrükte) · 9460f226-79a1-49c8-a721-00616a598678 (EXP-2026-000001, kapalı) · 91139318-419d-4ec2-ba1a-8b08b531b0a3 (EXP-2026-000003, taslak) — veritabanı yeniden tohumlandığı için Tur 9 kimlikleri geçersiz';
card.note =
  'Tur 10. Tur 9 puan kartından (commit 30a360e) bu yana ihracat modülünde VE ortak bileşenlerde hiçbir kaynak değişikliği yok — ' +
  'git diff 30a360e..HEAD -- apps/web/src/modules/export, apps/web/src/app/(app)/ihracat, apps/web/src/components, apps/web/src/app/globals.css = boş; ' +
  'aradaki tek değişiklikler kokpit/bakım/ar-ge/core dosyalarında. 6 rotanın 6\'sı da yeniden çekildi (1440x900 + 390x844), ' +
  'ayrıca detay sayfasının 4 sekmesi × (1440 + 390) × 3 sevkiyat durumu (gümrükte / kapalı / taslak) ve liste 1024x768 çekildi; ekran görüntüleri Read ile incelendi. ' +
  'Ölçüm: measure-ihracat-r10/ (12 dosya), probe-ihracat-r10.json (sütun genişliği/dolu oran/distinct + hover), r10b (gerçek klavye Tab ile odak halkası + boş arama + mobil dokunma hedefleri), ' +
  'r10c/r10d (tabular-nums yaprak seviyesi + KPI + koyu tema + 1024), r10e (detay sekmelerinde mobil kart yükseklikleri). ' +
  'Sonuç: 6 rotanın 6\'sı da KAZANIYOR, açık P0/P1 yok. Tur 9\'un 3 açık P2 bulgusu yeniden ölçüldü ve HEPSİ AÇIK kaldı (kök neden packages/db/src/seed/export.ts, dokunulmadı). ' +
  '1 yeni P2 açıldı (ihracat-detay-21, Çeki listesi Net/Brüt kg = 0). Puanlarda delta YOK — kaynak değişmediği için puan değiştirmek gerekçesiz olurdu (protokol kural 2). ' +
  'Kod taraması TEMİZ: modül dosyalarında transition-all / transition: all / ease-in / scale(0) / ≥300ms süre / origin-* yok; tek animasyon fetch-rates-button.tsx animate-spin (yükleniyor). ' +
  '5 hover: kullanımının 5\'i de globals.css:10 @custom-variant hover ile (hover:hover) and (pointer:fine) altında kapalı. ' +
  'Odak halkası gerçek klavye Tab ile doğrulandı: outline 1px auto oklab(0.55 -0.141 0.075 / 0.5) (marka yeşili), offset 0-1px. ' +
  'Satır hover: tıklanabilir tabloda (sevkiyat listesi) oklab(0.955 …/0.5); tıklanamayan tablolarda (belgeler/kurlar/gtip) yok — KASITLI, hover tonu tıklanabilirlik sinyali. ' +
  'Boş durumlar: 4 listede de ikon + "Eşleşen kayıt yok" + "Arama ya da filtreleri değiştirmeyi deneyin." + arama alanında × temizleme. ' +
  'Mobilde (390) 4 listede 44px altı ETKİLEŞİMLİ hedef YOK; /yeni\'deki 3 adet 1×1 px SELECT shadcn Select\'in gizli yerli form elemanı (görünür tetikleyici 44px+), bulgu değil. ' +
  'Sayfa düzeyi yatay taşma 6 rotada da yok (scrollWidth = clientWidth = 390/1440). Koyu tema (kurlar) doğrulandı: grafik çizgileri, kırmızı/yeşil delta ve hairline ayraçlar okunur.';

card.measurements = {
  tool: 'pnpm measure + scripts/probe-ihracat-r10{,b,c,d,e}.ts',
  files: [
    'artifacts/critic/measure-ihracat-r10/{sevkiyatlar,belgeler,kurlar,gtip,yeni,detay}-{1440,390}.json',
    'artifacts/critic/probe-ihracat-r10.json',
    'artifacts/critic/probe-ihracat-r10b.json',
    'artifacts/critic/probe-ihracat-r10c.json',
    'artifacts/critic/probe-ihracat-r10d.json',
    'artifacts/critic/probe-ihracat-r10e.json',
  ],
  ozet: {
    satirYuksekligi1440: 'sevkiyatlar 36 · belgeler 36 · kurlar 36 · gtip 36.5–37 · detay 36 (hedef 36–40 ✓)',
    mobilKartYuksekligi: 'sevkiyatlar 64 · belgeler 60 · gtip 60 · kurlar 64 · detay sekmeleri 56–88 (hedef 56–72; Çeki listesi 88 tek satır/6 alan, kabul)',
    tasma: '6 rota × 2 viewport: scrollWidth = clientWidth (1440/390), overflowX=false',
    dokunmaHedefi390: '0 gerçek ihlal (yalnız breadcrumb metni ve gizli yerli select)',
    fontKademesi1440: '24 (h1) / 13 (gövde) / 12–11 (etiket) — 3 kademe',
    farkliRenk: 'sevkiyatlar 22 · belgeler 20 · kurlar 15 · gtip 15 · yeni 13 (hesaplanmış metin+zemin, ton dahil)',
    odakHalkasi: 'outline 1px auto oklab(0.55 -0.141272 0.0751154 / 0.5)',
    tabularNums: 'Para/kur/miktar hücrelerinin tamamı mono ya da tabular-nums; yalnız tarih sütunları Inter (Inter varsayılan rakamları eşit genişlikte, sütun hizası ölçümde bozulmuyor)',
    at1024: 'liste tablosu 1115px, kapsayıcı 736px → tablo KENDİ overflow-x kapsayıcısında kayıyor; belge scrollWidth 1024 = clientWidth 1024 (sayfa taşması yok)',
  },
};

const now = (r: string) => card.routes[r];

// --- Açık bulguların yeniden ölçümü (protokol kural 1) ---
now('/ihracat/sevkiyatlar/[id]').open[0].recheck = {
  round: 10,
  verdict: 'AÇIK KALDI',
  measure:
    '1440x900, probe-ihracat-r10.json detay:Belgeler → Vade width=155 rows=8 filled=0 distinct=1 (tümü "—"), Belge no width=281 rows=8 filled=1 distinct=2. ' +
    'İki sütun 436px / tablo 1152px = %37,8 (Tur 9 ile birebir aynı). psql: select count(*)=30, count(due_date)=0, count(responsible_id)=0 from export_documents. ' +
    'packages/db/src/seed/export.ts Tur 9\'dan beri değişmedi (git diff boş).',
};
now('/ihracat/belgeler').open[0].recheck = {
  round: 10,
  verdict: 'AÇIK KALDI',
  measure:
    '1440x900 /ihracat/belgeler KPI şeridi = [30, 13, 0, 13] → 3 farklı değer, "Bekleyen" ile "Sorumlusuz" özdeş, "Vadesi geçmiş" 0. ' +
    'psql doğrulaması: export_documents 30 satır, due_date 0 dolu, responsible_id 0 dolu. app/(app)/ihracat/belgeler/page.tsx:17-19 değişmedi.',
};
now('/ihracat/kurlar').open[0].recheck = {
  round: 10,
  verdict: 'AÇIK KALDI',
  measure:
    '1440x900, probe-ihracat-r10.json kurlar → Kaynak width=185 rows=25 filled=25 distinct=1 ("TCMB"), tablonun %16\'sı. ' +
    'psql: exchange_rates.source → TCMB-SEED 172, TCMB 8 (ikisi de UI\'da "TCMB"). Mobilde de her kartın alt satırında 25 kez "TCMB" tekrar ediyor (390x844 ekran görüntüsü).',
};

// --- Yeni bulgu ---
now('/ihracat/sevkiyatlar/[id]').open.push({
  id: 'ihracat-detay-21',
  criterion: 3,
  severity: 'P2',
  openedRound: 10,
  text:
    'Sevkiyat detayının "Çeki listesi" sekmesinde 8 sütunun 2\'si ("Net kg", "Brüt kg") hiçbir satırda dolu değil ve tablo genişliğinin %19\'unu kaplıyor; ' +
    'aynı boşluk üstteki "Proforma & gümrük" kartında "Net / brüt ağırlık — / —" olarak ikinci kez görünüyor. ' +
    'Kök neden ihracat-detay-20 ile aynı aile ama farklı bir alan: export_packages.net_weight_kg / gross_weight_kg NULL değil, 0.0000 tohumlanmış; ' +
    'MoneyCell/QtyCell sıfırı "—" bastığı için ekranda "hiç girilmemiş" gibi okunuyor. Bir çeki listesi (packing list) gümrükte net/brüt ağırlıksız kabul edilmediği için ' +
    'bu yalnız yoğunluk değil, belgenin de eksik görünmesine yol açıyor.',
  measure:
    '1440x900, probe-ihracat-r10.json detay:Çeki listesi → Net kg width=110 rows=1 filled=0 distinct=1; Brüt kg width=110 rows=1 filled=0 distinct=1; ' +
    'toplam 220px / tablo 1152px = %19,1. psql: select count(*)=2, count(net_weight_kg)=2, sum(net_weight_kg)=0.0000 from export_packages; ' +
    'export_shipments.net_weight_kg/gross_weight_kg = 0.0000 (EXP-2026-000001, -000002), NULL (-000003).',
  target:
    'Çeki listesindeki her görünür sütun satırların en az %50\'sinde gerçek bir değer taşısın. Tercih edilen kök neden düzeltmesi: ' +
    'packages/db/src/seed/export.ts her export_packages satırına ürünün birim ağırlığından türetilmiş gerçekçi net/brüt kg yazsın (brüt = net + ambalaj darası) ve ' +
    'export_shipments.net_weight_kg / gross_weight_kg bunların toplamı olsun. Kabul ölçütü: probe-ihracat-r10.ts ile detay:Çeki listesi\'nde ' +
    'Net kg ve Brüt kg sütunlarında filled/rows ≥ 0,5 VE "Proforma & gümrük" kartındaki "Net / brüt ağırlık" alanı "—/—" basmıyor; deadRightPx 0 kalsın (ihracat-detay-19 regresyona uğramasın).',
  file: 'packages/db/src/seed/export.ts (export_packages.net_weight_kg / gross_weight_kg, export_shipments.net_weight_kg / gross_weight_kg) — alternatif: apps/web/src/modules/export/components/packing-list-table.tsx',
});

// --- Puanlar: delta yok, gerekçe ---
const deltaNote = (extra: string) =>
  'Tur 9→10: delta YOK. Gerekçe: ihracat modülünde ve ortak bileşenlerde tek satır kaynak değişikliği yok (git diff 30a360e..HEAD boş), ' +
  'ölçümler Tur 9 ile birebir aynı çıktı. ' + extra;

now('/ihracat/sevkiyatlar').round = 10;
now('/ihracat/sevkiyatlar').scoreNotes = deltaNote(
  '60/57. Yeniden doğrulandı: satır 36px/13px, tablo 1152 = kapsayıcı 1152 (taşma yok), 10 sütunun 8\'i ≥2 farklı değer, ' +
  'para sütunları sağ hizalı ve mono; hover oklab(0.955 …/0.5) yalnız tıklanabilir satırlarda; 390\'da 3 kart × 64px, 44px altı hedef yok; ' +
  'KPI şeridi 4 blok dikey hairline ayraçla (Stripe kalıbı). Not (bulgu DEĞİL): "Müşteri" (distinct=1, 190px) ve "Oluşturma" (distinct=1) sütunlarının tek değerli olması ' +
  'yapısal değil, tohum darlığı (tek ihracat müşterisi, hepsi aynı gün yaratılmış) — gerçek veride ayrışır, bu yüzden bulgu açılmadı.'
);
now('/ihracat/sevkiyatlar/[id]').round = 10;
now('/ihracat/sevkiyatlar/[id]').scoreNotes = deltaNote(
  '59/57. Kriter 3 KASITLI olarak 4\'te kalıyor (Tur 8/9 ile aynı gerekçe, yeniden ölçülerek): Belgeler sekmesinde "Vade" 0/8 + "Belge no" 1/8 = tablonun %37,8\'i (ihracat-detay-20) ' +
  've Tur 10\'da ölçülen Çeki listesi "Net kg"/"Brüt kg" 0/1 = %19,1 (ihracat-detay-21). Diğer 11 kriter 5: DocumentChain düğümleri kendi para biriminde, ' +
  '"Devam belgesi yok" kesikli yer tutucusu, taslak sevkiyatta eylem şeridi ve alan etiketleri duruma göre değişiyor (Proforma gönder / İrsaliyeye bağla; "ETGB no" ↔ "Gümrük beyanname no"), ' +
  'Fatura & kur sekmesinde "Henüz bağlı fatura yok" boş durumu ikon+başlık+açıklama ile ve olmayan eylemi adlandırmadan, kur ₺37,2000 × €16.800 = ₺624.960,00 /ihracat/kurlar ile birebir, ' +
  '1440 ve 390\'da taşma yok, mobilde belge zinciri yatay snap-scroll ile aktif düğüm görünür, 4 sekme de mobilde kart görünümünde.'
);
now('/ihracat/sevkiyatlar/yeni').round = 10;
now('/ihracat/sevkiyatlar/yeni').scoreNotes = deltaNote(
  '60/57. Yeniden doğrulandı: tek kolon 1064px form, 2 sütunlu alan ızgarası, 13px etiket + 24px h1, ' +
  '"İhracat siparişi" seçicisi 11 seçenek (boş değil), 390\'da tek kolona iniyor ve eylem şeridi (Vazgeç / Sevkiyat oluştur) alta sabitleniyor; ' +
  'renk sayısı 13 (modülün en düşüğü), 44px altı etkileşimli hedef yok.'
);
now('/ihracat/belgeler').round = 10;
now('/ihracat/belgeler').scoreNotes = deltaNote(
  '60/57. Yeniden doğrulandı: 30 satır × 36px, ilk ekranda 17 satır, 5 sütun, taşma yok; 390\'da 30 kart × 60px (tek tip yükseklik); ' +
  'boş arama durumu ikon + başlık + ipucu. Açık P2 (ihracat-belgeler-04) KPI şeridinin bilgi taşımasıyla ilgili, tablo anatomisiyle değil. ' +
  'Not (bulgu DEĞİL): "Müşteri" sütunu 342px/distinct=1 — tohum darlığı (tek ihracat müşterisi), yapısal değil.'
);
now('/ihracat/kurlar').round = 10;
now('/ihracat/kurlar').scoreNotes = deltaNote(
  '60/56 (Stripe). Yeniden doğrulandı: 2 KPI dikey hairline ayraçla + altında "Alış" ikincil satırı, çizgi grafik EUR mor / USD mavi + 5 yatay ızgara + hairline, ' +
  '25 satır × 36px, "Günlük değişim" 25/25 satırda 2 ondalıklı ve işaretli (yeşil/kırmızı = anlam), para 4 ondalıklı mono, sayfalama 1–25 / 180. ' +
  'Koyu temada grafik ve deltalar okunur. Açık P2 (ihracat-kurlar-13) tek değerli "Kaynak" sütunu.'
);
now('/ihracat/gtip').round = 10;
now('/ihracat/gtip').scoreNotes = deltaNote(
  '60/57. Yeniden doğrulandı: 39 satır × 36,5–37px, 4 sütun, GTİP kodu kartları (4 kod, birim rozeti sağ üstte), ' +
  'satır içi GTİP seçicisi şeffaf kenarlıklı (Linear kalıbı: yalnız hover/focus\'ta kenarlık), mobilde tetikleyici h-11 = 44px. ' +
  'Sütunların 4\'ü de ≥2 farklı değer taşıyor. "Eşlenmemiş 38" KPI\'ı tohum durumu; UI kusuru değil.'
);

writeFileSync(P, JSON.stringify(card, null, 1));
console.error('yazıldı: ' + P);
for (const [r, v] of Object.entries<any>(card.routes)) {
  console.error(`${r}\t${v.total}\t${v.reference}\topen=${v.open.length} (P0/P1=${v.open.filter((o: any) => o.severity !== 'P2').length})`);
}
