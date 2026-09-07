/** Tur 9 kritik kartı güncellemesi — artifacts/critic/bakim.json (docs/DESIGN-SCORECARD.md kural 1-3). */
import { readFileSync, writeFileSync } from 'node:fs';

const p = 'artifacts/critic/bakim.json';
const card = JSON.parse(readFileSync(p, 'utf8'));
const R = card.routes;
card.round = 9;
card.measuredAt = new Date().toISOString();
card.note =
  'Tur 9: 7 rotanın tamamı yeniden ölçüldü (artifacts/critic/measure-bakim-r9/*.json, scripts/probe-bakim-r9{,b,c,d,e,f,g}.ts). ' +
  'Yeni bulgu: /bakim/is-emirleri masaüstü liste görünümünde filtre 0 sonuç verdiğinde soğuk-başlangıç boş durumu basılıyor (P1). ' +
  'Kod taraması temiz: bakım modülünde transition-all / ease-in / scale(0) / ≥300ms süre / origin-* hatası yok; Tailwind v4 hover varyantı zaten @media (hover:hover) ile korunuyor.';

// --- /bakim/makineler : k9 5→4 (KPI şeridi mobilde kesik — ölçüldü)
R['/bakim/makineler'].round = 9;
R['/bakim/makineler'].scores = [5, 5, 5, 5, 5, 5, 5, 5, 4, 5, 5, 5];
R['/bakim/makineler'].total = 59;
R['/bakim/makineler'].verdict = 'Plantero';
R['/bakim/makineler'].scoreNotes =
  'Tur 9 delta (−1): k9 5→4. Gerekçe (yeni ölçüm): KPI şeridi @390x844 scrollWidth 632 > clientWidth 358; 4 karttan yalnızca 2 tanesi tam görünüyor, ' +
  'operasyonel olarak en kritik olan "Arızalı" kartı ekran kenarında kesik (scripts/…/g.ts). Kök neden ortak bileşen (kpi-strip.tsx) — ' +
  'bakim-oee-04 (P2, shell) altında BİR KEZ izleniyor, burada tekrar açılmadı; kazanmayı engellemez (toplam 59 ≥ 57, hiçbir kriter <4, açık P0/P1 yok). ' +
  'Diğer ölçümler değişmedi: satır 36,5–37px × 36 @13px, mobil kart 63,5px, scrollWidth 1440=1440 / 390=390 (overflowX false), fontSizes {13:238, 11:110, 12:12}, ' +
  'distinctColors 17/15, h1 24px/600 (mobil 20px/600), 390px’te 44px altı görünür dokunma hedefi yok. Filtrelenmiş boş durum DOĞRU ' +
  '("Eşleşen kayıt yok / Arama ya da filtreleri değiştirmeyi deneyin." — probe-bakim-r9e.ts).';

// --- /bakim/planlar : değişmedi
R['/bakim/planlar'].round = 9;
R['/bakim/planlar'].verdict = 'Plantero';
R['/bakim/planlar'].scoreNotes =
  'Tur 9 delta 0. Yeniden ölçüm: satır 36px × 12, mobil kart 63,5px, scrollWidth 1440=1440 / 390=390 (overflowX false), fontSizes {13:94, 12:21, 11:14}, ' +
  'distinctColors 17/15, h1 24px/600. Mobil kartlarda <8px yatay boşluklu metin çifti YOK (probe-bakim-r9.ts planlar390 = []). ' +
  'Bu rotada KPI şeridi yok — k9 5 kalır. Filtrelenmiş boş durum doğru ("Eşleşen kayıt yok", probe-bakim-r9e.ts).';

// --- /bakim/is-emirleri : YENİ P1
R['/bakim/is-emirleri'].round = 9;
R['/bakim/is-emirleri'].scores = [5, 5, 5, 5, 5, 5, 4, 5, 5, 5, 4, 5];
R['/bakim/is-emirleri'].total = 58;
R['/bakim/is-emirleri'].verdict = 'Linear';
R['/bakim/is-emirleri'].scoreNotes =
  'Tur 9 delta (−2): k7 5→4 ve k11 5→4. Gerekçe: bakim-isemirleri-11 (P1) — masaüstü liste görünümünde arama/filtre 0 sonuç verdiğinde ' +
  'DataTable’a externallyFiltered geçilmediği için SOĞUK-BAŞLANGIÇ boş durumu basılıyor: sayfa başlığı "6 iş emri — 1 açık" ve sayaç "0 kayıt" derken ' +
  'boş durum "Henüz bakım iş emri yok / Arıza bildirin ya da bir bakım planından iş emri üretin." diyor (yanlış bilgi + yanlış ikon: SearchX yerine Inbox). ' +
  'Aynı durumda mobil dal DOĞRU metni basıyor ("Eşleşen kayıt yok / Arama ya da filtreleri değiştirmeyi deneyin.") — aynı bileşen, aynı durum, iki farklı ' +
  'sonuç olduğu için k11 (tutarlılık) da düştü. Ölçüm: scripts/probe-bakim-r9d.ts. Diğer ölçümler değişmedi: satır 36px × 6, mobil kart 62–64,5px, ' +
  'scrollWidth 1440=1440 / 390=390, distinctColors 25/23, h1 24px/600, tr h-9 + hover:bg-accent/50 + focus-visible:outline-2 + tabindex=0.';
R['/bakim/is-emirleri'].open = [
  {
    id: 'bakim-isemirleri-11',
    criterion: 7,
    severity: 'P1',
    text:
      'Masaüstü liste görünümünde arama/filtre 0 sonuç ürettiğinde soğuk-başlangıç boş durumu basılıyor: "Henüz bakım iş emri yok — Arıza bildirin ya da bir bakım planından iş emri üretin." ' +
      'Oysa sayfa başlığı "6 iş emri — 1 açık", sayaç "0 kayıt" diyor; kullanıcıya kaydın hiç olmadığı söyleniyor. Mobil dal aynı durumda doğru metni basıyor — masaüstü/mobil tutarsızlığı (k11).',
    measure:
      'Tur 9 (scripts/probe-bakim-r9d.ts, /bakim/is-emirleri, arama "zzzzqq"): masaüstü 1440x900 → ["0 kayıt", "Henüz bakım iş emri yok", "Arıza bildirin ya da bir bakım planından iş emri üretin."]; ' +
      'mobil 390x844 → ["Eşleşen kayıt yok", "Arama ya da filtreleri değiştirmeyi deneyin."]. Kanban görünümü aynı durumda 5 adet "Bu durumda iş emri yok" sütunu gösteriyor, aktif filtreye dair hiçbir iz yok. ' +
      'Kök neden: orders-view.tsx:187 masaüstü dalı `externallyFiltered` prop’unu geçmiyor (mobil dal 185. satırda geçiyor); DataTable data-table.tsx:271 bu bayrağa göre "Eşleşen kayıt yok" + SearchX ikonunu seçiyor. ' +
      'Kanıt: artifacts/critic/bakim-r9-bos-1440.png, bakim-r9-bos-kanban-1440.png.',
    target:
      'Masaüstü liste dalına da `externallyFiltered={isFiltering}` geçilsin → 0 sonuçta başlık "Eşleşen kayıt yok", açıklama "Arama ya da filtreleri değiştirmeyi deneyin.", ikon SearchX olsun (mobil ile birebir aynı). ' +
      'Kanban dalında da filtre aktifken 0 sonuçta sütun ızgarası yerine aynı "Eşleşen kayıt yok" boş durumu gösterilsin. Doğrulama: probe-bakim-r9d.ts çıktısında desktop === mobile.',
    file: 'apps/web/src/modules/maintenance/components/orders-view.tsx:187 (ve kanban dalı için 187. satırdaki OrdersBoard sarmalayıcısı)',
    openedRound: 9,
  },
];

// --- /bakim/is-emirleri/[id]
R['/bakim/is-emirleri/[id]'].round = 9;
R['/bakim/is-emirleri/[id]'].sampleId = 'ba035ca9-d4a3-4985-b584-246976080a7b (MO-2026-000001, 2 fotoğraf)';
R['/bakim/is-emirleri/[id]'].verdict = 'Plantero';
R['/bakim/is-emirleri/[id]'].scoreNotes =
  'Tur 9 delta 0 (veritabanı yeniden tohumlandı, örnek id değişti). Yeniden ölçüm: scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 19/18, ' +
  'h1 24px/600 (mobil 20px/600), fontSizes {13:47, 12:24, 11:18}, 390px’te 44px altı görünür dokunma hedefi yok. ' +
  'Fotoğraf ızgarası ölçüldü (probe-bakim-r9.ts photoTiles1440): md:grid-cols-4 → 270,5px sütun, döşeme 271×299px (271 kare + 28px zaman damgası satırı) — ' +
  'devasa gri blok yok, bakim-isemirleri-06 kapalı kalır. Kod taraması: order-detail.tsx’te transition-all/ease-in/scale(0)/≥300ms yok.';

// --- /bakim/makineler/[id]
R['/bakim/makineler/[id]'].round = 9;
R['/bakim/makineler/[id]'].sampleId = 'aa5d7575-e217-4929-b1ec-16c44bb628bc (MK-001)';
R['/bakim/makineler/[id]'].verdict = 'Plantero';
R['/bakim/makineler/[id]'].scoreNotes =
  'Tur 9 delta 0 (yeniden tohumlama sonrası MK-001 id değişti). Yeniden ölçüm: scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 19/18, ' +
  'h1 24px/600 (mobil 20px/600), fontSizes {13:37, 11:9, 12:9, 14:8}; "Son iş emirleri" bağlantı satırları 44px (min-h-11), sekmeler mobilde yatay kaydırma + soldurma ile; ' +
  '390px’te 44px altı görünür dokunma hedefi yok. Bu rotada KPI şeridi yok — k9 5 kalır.';

// --- /bakim/is-emirleri/yeni
R['/bakim/is-emirleri/yeni'].round = 9;
R['/bakim/is-emirleri/yeni'].verdict = 'Plantero';
R['/bakim/is-emirleri/yeni'].scoreNotes =
  'Tur 9 delta 0. Yeniden ölçüm: scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 16/15, h1 24px/600 (mobil 20px/600), fontSizes {13:30, 14:4, 11:3}. ' +
  'Yeni doğrulama (scripts/probe-bakim-r9b.ts, 390x844, sayfa sonuna kaydırılmış — maxScroll 70): fotoğraf ekleme döşemesi 103×103px, y 544→646; ' +
  'sabit aksiyon çubuğunun butonu y 708→752 (44px), alt gezinme y 787→844 — elementFromPoint ile döşemenin %15/%50/%90 noktalarında ÖRTÜLME YOK. ' +
  '390px’te 44px altı tek dokunma hedefi FormSelect’in 1×1 gizli native <select>’i (ortak bileşen, görünmez). Bu rotada KPI şeridi yok — k9 5 kalır.';

// --- /bakim/oee
R['/bakim/oee'].round = 9;
R['/bakim/oee'].verdict = 'Plantero';
R['/bakim/oee'].scoreNotes =
  'Tur 9 (kritik yeniden ölçümü) delta 0 — k5 5 (bakim-oee-13 Tur 9’da kapandı: YAxis domain [0,100], en üst tick %100), k9 4 (bakim-oee-04 açık, P2). ' +
  'Yeniden ölçüm: KpiStripRow @390 scrollWidth 792 > clientWidth 358, 5 karttan 2’si tam görünüyor (3. kart "Performans" kesik) — değişmedi. ' +
  'Rakam sunumu doğrulandı (probe-bakim-r9f.ts): "Hat bazlı OEE" tablosundaki tüm sayısal hücreler font-variant-numeric: tabular-nums + text-align: right; ' +
  'KPI değerleri 13px/tabular-nums. Odak halkası doğrulandı (probe-bakim-r9g.ts): "Tüm hatlar/HAT1/HAT2/HAT3" çipleri gerçek Tab ile :focus-visible eşleşiyor ve ' +
  'outline-ring/50 renginde görünür halka çiziyor (artifacts/critic/bakim-r9-oee-focus-chip.png) — k8 5 doğrulandı. ' +
  'Diğer: satır 36px × 3, scrollWidth 1440=1440 / 390=390, distinctColors 17/15, h1 24px/600. ' +
  'Toplam 59 ≥ Stripe 56, hiçbir kriter <4, açık P0/P1 yok → KAZANAN: Plantero (bakim-oee-04 P2 kazanmayı engellemez).';
R['/bakim/oee'].open[0].measure =
  'Tur 9 (yeniden ölçüldü, değişmedi): KpiStripRow scrollWidth 792 > clientWidth 358 @390x844; 5 karttan yalnızca 2’si tam görünür, 3. kart ("Performans") 390px kenarında kesik. ' +
  'Aynı kök neden /bakim/makineler’de de ölçüldü: scrollWidth 632 > clientWidth 358, 4 karttan 2’si tam, "Arızalı" kesik. Belge kökünde taşma yok (390=390).';

writeFileSync(p, JSON.stringify(card, null, 2) + '\n');
const t = Object.entries(R).map(([k, v]: any) => `${k}: ${v.total} (${v.verdict}) open=${(v.open || []).map((o: any) => o.id + '/' + o.severity).join(',') || '-'}`);
process.stdout.write(t.join('\n') + '\n');
