/** Tur 12 kritik kartı güncellemesi (docs/DESIGN-SCORECARD.md). Yalnızca artifacts/critic/bakim.json yazar. */
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'artifacts/critic/bakim.json';
const card = JSON.parse(readFileSync(path, 'utf8')) as any;
const R = 12;

card.round = R;
card.measuredAt = new Date().toISOString();
card.note =
  'Tur 12: 7 rotanın tamamı yeniden çekildi (pnpm shot) ve ölçüldü (artifacts/critic/measure-bakim-r12/*.json, ' +
  'scripts/probe-bakim-r12{,b,c,d,f,g,h,i,j,k}.ts). KAPANDI: bakim-isemirleri-detay-13 (P1, k5) — 6/6 iş emrinde ' +
  '"Olay geçmişi" yaşam döngüsü sırasına monoton (rank dizileri [0,2,3] / [1,2,3] / [0]) ve betik art arda iki kez ' +
  'çalıştırıldığında DOM sırası birebir aynı (deterministik). AÇIK KALDI: bakim-oee-04 (P2, k9, ortak kpi-strip.tsx) — ' +
  '@390 KpiStripRow scrollWidth 792 > clientWidth 358, 5 karttan 2\'si tam görünür; aynı bileşen /bakim/makineler\'de ' +
  '632 > 358 (4 karttan 2\'si). YENİ: bakim-oee-05 (P2, k6) — "Hat bazlı OEE" tablosunda 4 yüzde sütunundan 3\'ü ' +
  'satırdan satıra farklı ondalık basıyor. YENİ: bakim-isemirleri-detay-14 (P2, k4) — kapanmış iş emrinin geçmişindeki ' +
  '"Yapılıyor" noktası sonsuz nabız atıyor. YANLIŞ ALARM (bulgu AÇILMADI): getComputedStyle ile okunan box-shadow ' +
  'Playwright\'ta bayat gelebiliyor; birincil buton/arama kutusu/filtre düğmesinin odak halkası odaklı-odaksız ' +
  'ekran görüntüsü farkıyla doğrulandı (3px ring-ring/50 görünür) → k8 5 kalır. Kod taraması TEMİZ: 7 rotanın ' +
  'tamamında hesaplanmış stilde transition-property:all / ≥300ms süre / ease-in ihlali 0 (probe-bakim-r12i.ts); ' +
  'kaynakta transition-all / scale(0) / origin-* yok; `hover:` globals.css:10-16\'da @media (hover:hover) and ' +
  '(pointer:fine) ile korunuyor. VERİ NOTU (tasarım bulgusu DEĞİL): "Tamamlandı" iş emirlerinde checklist_results ' +
  'maddeleri hâlâ done:false — ekran veriyi doğru basıyor, çelişki seed tarafında.';

const routes = card.routes;

function closeFinding(routeKey: string, id: string, measureAfter: string, verifiedBy: string) {
  const r = routes[routeKey];
  const idx = (r.open ?? []).findIndex((f: any) => f.id === id);
  if (idx >= 0) {
    const f = r.open.splice(idx, 1)[0];
    f.closedRound = R; f.measureAfter = measureAfter; f.verifiedBy = verifiedBy;
    r.closed = r.closed ?? []; r.closed.push(f);
  } else {
    // builder tarafından zaten closed'a taşınmışsa yalnızca kritik doğrulamasını ekle
    const c = (r.closed ?? []).find((f: any) => f.id === id);
    if (c) c.criticVerifiedRound = R, c.criticMeasure = measureAfter;
  }
}

// 1) /bakim/is-emirleri/[id] — detay-13 kritik doğrulaması + k5 geri 5'e
{
  const r = routes['/bakim/is-emirleri/[id]'];
  r.round = R;
  r.sampleId = '4a9cca52-d4ec-4d48-ae31-4e8912f03da6 (MO-2026-000005)';
  closeFinding('/bakim/is-emirleri/[id]', 'bakim-isemirleri-detay-13',
    'scripts/probe-bakim-r12.ts (Tur 12 kritik, güncel id\'lerle, 1440x900): 6/6 iş emri monotonic=true — MO-…001/002 ["Bildirildi","Yapılıyor","Tamamlandı"] rank [0,2,3]; MO-…003/004/005 ["Planlandı","Yapılıyor","Tamamlandı"] rank [1,2,3]; MO-…006 ["Bildirildi"] rank [0]. İki tam geçiş yapıldı, DOM sırası birebir aynı (timelineDeterministic=true). Ekran kanıtı: artifacts/screens/bakim-is-emirleri-4a9cca52-d4ec-4d48-ae31-4e8912f03da6/{desktop,mobile}.png.',
    'ölçüm (scripts/probe-bakim-r12.ts x2 geçiş, Tur 12 kritik)');
  r.scores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 60;
  r.verdict = 'Plantero';
  r.open = r.open ?? [];
  r.open.push({
    id: 'bakim-isemirleri-detay-14', criterion: 4, severity: 'P2',
    text: 'Kapanmış (status=done) iş emrinin "Olay geçmişi" listesinde geçmişte kalmış "Yapılıyor" olayının noktası sonsuz nabız atıyor. Nabız hareketi "şu anda sürüyor" anlamı taşır; kapanmış bir kaydın ortasındaki tarihli olayda bu anlam yanlış ve sayfada duran tek sürekli hareket olduğu için gözü sürekli oraya çekiyor.',
    measure: 'scripts/probe-bakim-r12i.ts (/bakim/is-emirleri/4a9cca52-…, 1440x900): main içinde animationName!=="none" olan tek öğe SPAN.absolute…size-2.5 → animationName "pulse", animationDuration 2s. Kayıt durumu "Tamamlandı" ve nabız atan olay listenin SON olayı değil (sıra: Planlandı → Yapılıyor → Tamamlandı). 6 iş emrinin 5\'i done → 5/6 detay sayfasında aynı durum.',
    target: 'order-timeline.tsx: nabız yalnızca olay hem listenin SONUNCUSU hem de iş emrinin güncel durumu in_progress iken uygulansın (ör. `pulse && isLast && currentStatus === "in_progress"`). Kabul: probe ile 5 "Tamamlandı" iş emrinin detayında animationName!=="none" öğe sayısı 0; "Yapılıyor" durumundaki bir iş emrinde 1.',
    file: 'apps/web/src/modules/maintenance/components/order-timeline.tsx:19 (PULSE_STATUSES) + :47',
    openedRound: R,
  });
  r.scoreNotes =
    'Tur 12 delta (+1): k5 4→5. Gerekçe: bakim-isemirleri-detay-13 (P1) kapandı — scripts/probe-bakim-r12.ts ile 6/6 iş emrinde ' +
    'zaman çizgisi yaşam döngüsü sırasına monoton ve iki geçişte birebir aynı (deterministik); queries.ts getMaintenanceOrderEvents ' +
    'artık asc(at) + durum-rank CASE + asc(id) üçlü anahtarıyla sıralıyor. Yeni P2 (detay-14, nabız) kazanmayı engellemez ve k4\'ün ' +
    'ölçüm maddelerini (nötr zemin, tek vurgu, durum renkleri anlam taşır, ≤4 ton) ihlal etmediği için k4 5 kalır — hareket kanalı ' +
    'kriter metninde ayrı bir alt ölçüm değil, bu yüzden puan düşürülmedi, bulgu listelendi. Ölçümler: scrollWidth 1440=1440 / 390=390 ' +
    '(overflowX false), distinctColors 20/19, fontSizes {13:44, 12:20, 11:12}, h1 24px/600 (mobil 20px/600). 390px\'te 44px altı ' +
    'ölçülen öğeler gerçek dokunma hedefi DEĞİL: breadcrumb "Detay" (span, aria-current), disabled kontrol listesi kutuları (16px, ' +
    'salt okunur) ve satır içi "Haftalık stick nozul temizliği" bağlantısı (display:inline, 35,5px). Odak halkası doğrulandı ' +
    '(probe-bakim-r12h.ts: odaklı/odaksız kırpma bayt farkı) → k8 5. Toplam 60 ≥ 57, hiçbir kriter <4, açık P0/P1 yok → KAZANAN: Plantero.';
}

// 2) /bakim/oee — yeni P2 (ondalık) + k6 5→4
{
  const r = routes['/bakim/oee'];
  r.round = R;
  r.open = r.open ?? [];
  const o4 = r.open.find((f: any) => f.id === 'bakim-oee-04');
  if (o4) o4.measure =
    'Tur 12 yeniden ölçüm (scripts/probe-bakim-r12.ts, 390x844): KpiStripRow scrollWidth 792 > clientWidth 358, 5 karttan tam görünen 2 — Tur 9/10/11 ile birebir aynı, değişmedi. Aynı bileşen /bakim/makineler @390\'da scrollWidth 632 > clientWidth 358 (4 kart, tam görünen 2).';
  r.open.push({
    id: 'bakim-oee-05', criterion: 6, severity: 'P2',
    text: '"Hat bazlı OEE" tablosunda yüzde sütunları satırdan satıra farklı sayıda ondalık basıyor. Sağa hizalı tabular-nums bir sütunda ondalık virgülü hizası kayıyor: OEE sütunu %0,14 / %0,24 / %1,2, Kullanılabilirlik %100 / %99,48 / %99,38, Performans %0,14 / %0,26 / %1,2. Kök neden hücrelerin `formatPct(v)` çağırması; formatPct varsayılanı minimumFractionDigits 0 / maximumFractionDigits 2 (lib/format.ts:89-97) — "en fazla 2" olduğu için basamak sayısı değere göre 0–2 arasında salınıyor.',
    measure: 'scripts/probe-bakim-r12b.ts (/bakim/oee, 1440x900): sütun bazında ondalık basamak kümesi → OEE {1,2}, Kullanılabilirlik {0,2}, Performans {1,2}, Kalite {2}. 4 yüzde sütununun 3\'ü karışık. Satırlar: HAT3 %0,14/%100/%0,14/%3,33 · HAT2 %0,24/%99,48/%0,26/%6,63 · HAT1 %1,2/%99,38/%1,2/%9,97.',
    target: 'Sabit ondalıklı yerel bir biçimlendirici (ör. Intl.NumberFormat("tr-TR",{style:"percent",minimumFractionDigits:2,maximumFractionDigits:2})) — ortak lib/format.ts DEĞİŞTİRİLMEDEN, /ihracat/kurlar\'daki formatDailyChangePct deseniyle aynı. Kabul: probe-bakim-r12b.ts çıktısında 4 yüzde sütununun her birinde decimalsPerCol tek elemanlı olsun.',
    file: 'apps/web/src/app/(app)/bakim/oee/page.tsx:121-124 (hat tablosu) ve :158-159 (makine tablosu); biçimlendirici apps/web/src/lib/format.ts:89 formatPct',
    openedRound: R,
  });
  r.scores = [5, 5, 5, 5, 5, 4, 5, 5, 4, 5, 5, 5];
  r.total = 58;
  r.verdict = 'Plantero';
  r.scoreNotes =
    'Tur 12 delta (−1): k6 5→4. Gerekçe: YENİ bakim-oee-05 (P2) — kriter 6\'nın "birim/para tutarlı ondalık" alt ölçümü doğrudan ' +
    'ihlal ediliyor; "Hat bazlı OEE" tablosunda 4 yüzde sütunundan 3\'ü karışık ondalık basıyor (OEE {1,2}, Kullanılabilirlik {0,2}, ' +
    'Performans {1,2}) ve sağa hizalı tabular-nums sütunda virgül hizası kayıyor. Kriterin diğer alt ölçümleri geçiyor (tabular-nums ' +
    'var, sağ hizalı, birimli, sıfırlar sönük), bu yüzden 4 — 3 değil. k9 4 kalır: bakim-oee-04 yeniden ölçüldü, değişmedi ' +
    '(scrollWidth 792 > clientWidth 358, 5 karttan 2 tam görünür) + "Hat bazlı OEE" tablosu @390 yatay kaydırıyor (588 > 324, ' +
    'bilinçli scrollbar-thin scroll-fade-x deseni). Değişmeyen ölçümler: masaüstü scrollWidth 1440=1440, mobil 390=390 ' +
    '(overflowX false), tablo satırı 36px × 3, distinctColors 17/15, h1 24px/600 (mobil 20px/600), fontSizes {13:43, 11:38, 12:11}. ' +
    'Toplam 58 ≥ 56, hiçbir kriter <4, açık P0/P1 yok → KAZANAN: Plantero.';
}

// 3) Değişmeyen 5 rota: tur damgası + doğrulama notu
const unchanged: Array<[string, string]> = [
  ['/bakim/makineler',
    'Tur 12 delta 0. Yeniden ölçüm (measure-bakim-r12/makineler-{1440,390}.json): satır 36,5–37px × 36 @13px, mobil kart 63,5px × 36, ' +
    'scrollWidth 1440=1440 / 390=390 (overflowX false), fontSizes {13:238, 11:110, 12:12}, distinctColors 17/15, h1 24px/600 (mobil 20px/600). ' +
    '390px\'te 44px altı tek öğe breadcrumb "Makineler" (span, aria-current) — dokunma hedefi değil. Boş durum doğrulandı ' +
    '(probe-bakim-r12k.ts: ikon + "Eşleşen kayıt yok" + "Arama ya da filtreleri değiştirmeyi deneyin."). k9 4 kalır: bakim-oee-04 ' +
    'kapsamında ortak KpiStripRow @390 scrollWidth 632 > clientWidth 358 (4 karttan 2\'si tam görünür). Toplam 59 ≥ 57, hiçbir kriter <4, ' +
    'açık P0/P1 yok → KAZANAN: Plantero.'],
  ['/bakim/planlar',
    'Tur 12 delta 0. Yeniden ölçüm: satır 36px × 12 @13px, mobil kart 63,5px × 12, scrollWidth 1440=1440 / 390=390 (overflowX false), ' +
    'fontSizes {13:94, 12:21, 11:14}, distinctColors 17/15, h1 24px/600 (mobil 20px/600), 390px\'te 44px altı gerçek dokunma hedefi yok. ' +
    'Mobil kartların tamamında satır aksiyonu (…) render edildiği için rozet sütunu tırtıklı değil (is-emirleri\'ndeki shell bulgusunun ' +
    'etkisi bu rotada yok). Boş durum doğrulandı. Toplam 60 ≥ 57 → KAZANAN: Plantero.'],
  ['/bakim/is-emirleri',
    'Tur 12 delta 0. k5 4 kalır: mobil kart rozet sütunu hâlâ tırtıklı — satır aksiyonu YALNIZCA açık iş emrinde (MO-2026-000006) ' +
    'render edildiğinden o kartta rozet sağ kenarı diğer 5 karttan ~50px içeride (artifacts/screens/bakim-is-emirleri/mobile.png). ' +
    'Kök neden ORTAK bileşen (components/data-table/mobile-cards.tsx) → shell-mobile-card-action-gutter-01 (P2, shell.json Tur 25\'te AÇIK); ' +
    'DESIGN-SCORECARD kural 5 gereği bu modülde bulgu açılmadı. Ölçümler: masaüstü satır 36px × 6, mobil kart 62–64,5px, scrollWidth ' +
    '1440=1440 / 390=390 (overflowX false), h1 24px/600 (mobil 20px/600), distinctColors 25/23. Etkileşim doğrulandı: satır hover ' +
    'arka planı değişiyor, satır focus-visible 2px solid ring (outline-offset −2px), birincil buton / arama kutusu / filtre düğmesi ' +
    'odakta 3px ring-ring/50 (probe-bakim-r12h.ts odaklı-odaksız kırpma farkı) → k8 5. Boş durum: ikon + başlık + ipucu. ' +
    'Toplam 59 ≥ 57, açık P0/P1 yok → KAZANAN: Plantero.'],
  ['/bakim/makineler/[id]',
    'Tur 12 delta 0 (MK-001 / daa41905-b9ad-4454-8e79-ea1448c88af3). Yeniden ölçüm: scrollWidth 1440=1440 / 390=390 (overflowX false), ' +
    'distinctColors 19/18, h1 24px/600 (mobil 20px/600), fontSizes {13:37, 14:8, 12:9, 11:9}, "Son iş emirleri" satırı 44px. ' +
    'Sekme şeridi mobilde yatay kaydırma + kenar soldurma; 390px\'te 44px altı tek öğe breadcrumb "Detay" (span). Bu rotada KPI şeridi ' +
    'yok → k9 5. Boş bölüm metinleri yerinde ("Duruş kaydı yok."), boş alanlar "Boş alanları göster (4)" ile varsayılan gizli. ' +
    'Toplam 60 ≥ 57 → KAZANAN: Plantero.'],
  ['/bakim/is-emirleri/yeni',
    'Tur 12 delta 0. Yeniden ölçüm: scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 16/15, h1 24px/600 (mobil 20px/600), ' +
    'fontSizes {13:30, 14:4, 11:3}. 390px\'te 44px altı iki ölçüm de gerçek dokunma hedefi DEĞİL: breadcrumb "Yeni" (span) ve Radix ' +
    'Select\'in görsel dışı yerel <select>\'i (1×1px, position:absolute, aria-hidden="true", tabIndex=−1). Görünen form kontrollerinin ' +
    'hiçbiri 44px altında değil (probe-bakim-r12.ts formControls=[]). QR alanı otomatik odaklı ve odak halkası görünür. ' +
    'Toplam 60 ≥ 57 → KAZANAN: Plantero.'],
];
for (const [key, note] of unchanged) {
  const r = routes[key];
  r.round = R;
  r.scoreNotes = note;
}
routes['/bakim/makineler/[id]'].sampleId = 'daa41905-b9ad-4454-8e79-ea1448c88af3 (MK-001)';

writeFileSync(path, JSON.stringify(card, null, 2) + '\n', 'utf8');
const summary = Object.entries(routes).map(([k, v]: any) => `${k}: ${v.total}/${v.referenceTotal} ${v.verdict} açık=${(v.open ?? []).length} (P0/P1=${(v.open ?? []).filter((f: any) => f.severity !== 'P2').length})`);
console.log(summary.join('\n'));
