/**
 * Tur 8 — artifacts/critic/arge.json güncellemesi (gorsel-critic, docs/DESIGN-SCORECARD.md).
 * Ölçüm kaynakları: artifacts/critic/measure-arge-r8/*.json, artifacts/critic/probe-arge-r8.json,
 * artifacts/critic/probe-arge-r8b.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';

type Finding = Record<string, unknown>;
type Route = {
  round: number;
  reference: string;
  referenceTotal: number;
  scores: number[];
  total: number;
  winner: string;
  scoreNotes: string;
  measures: Record<string, unknown>;
  open: Finding[];
  closed: Finding[];
};

const path = 'artifacts/critic/arge.json';
const card = JSON.parse(readFileSync(path, 'utf8')) as {
  module: string;
  round: number;
  updatedAt: string;
  routes: Record<string, Route>;
};

card.round = 8;
card.updatedAt = '2026-09-07';

// ---------------------------------------------------------------- /arge/projeler
{
  const r = card.routes['/arge/projeler']!;
  r.round = 8;
  r.scores = [5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 59;
  r.winner = 'Plantero';
  r.measures.round8 = {
    scrollWidth: 1440,
    clientWidth: 1440,
    overflowX: false,
    rowHeights_1440: [36, 36, 36],
    rowHeights_390: [63.5, 63.5, 63.5],
    h1: '24px/600',
    mobilH1: '20px/600',
    distinctColors_1440: 17,
    distinctColors_390: 16,
    touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Projeler" 47.8x19.5 (etkileşimsiz metin)'],
    firstRowTop_viewport: 238,
    firstRowTop_mainOffset: 190,
    thTdRightEdges: 'th ve td sağ kenarları 7/7 sütunda birebir aynı (380.4/776/896/1046/1176/1306/1416)',
    birimMaliyetRenkleri: [
      { t: '₺31,92', color: 'oklch(0.72 0.17 70) = warning' },
      { t: '₺166,17', color: 'oklch(0.21 0.006 285.9) = foreground' },
      { t: '₺103,41', color: 'oklch(0.72 0.17 70) = warning' },
    ],
    rowHover: 'tr:hover → oklab(0.955 … / 0.5) = accent/50 (fare hareketiyle doğrulandı, rest saydam)',
    rowFocus: 'tr[tabindex=0] focus → outline oklch(0.55 0.16 152) solid 2px',
  };
  r.scoreNotes =
    'Tur 8. Tek açık bulgu (arge-projeler-08, c2, P2) yeniden ölçüldü: ilk tablo satırı viewport 238px / <main> ofseti 190px — altı turdur (4,5,6,7,8) birebir aynı, AÇIK KALIYOR (c2=4). Diğer 11 kriter yeniden ölçüldü, tur 7 ile aynı: satır 36px×3, taşma yok (1440/390 scrollWidth=clientWidth), 390px\'te <44px ETKİLEŞİMLİ hedef yok (yalnız etkileşimsiz breadcrumb metni), mobil kart 63,5px, h1 24/600 (mobil 20/600), 17/16 renk, th/td sağ kenarları 7/7 sütunda ±0. Bu tur ayrıca etkileşim doğrudan ölçüldü: satır hover accent/50 (rest saydam), satır odağı 2px primary outline → c8=5 teyit. Kod taraması (modules/rnd + app/(app)/arge): transition:all / ease-in / scale(0) / >300ms YOK (en uzun 220ms drop), hover global `@custom-variant hover` ile (hover:hover)+(pointer:fine)\'a kapatılı, prefers-reduced-motion bloğu var. Açık P0/P1 yok, toplam 59 ≥ 57 → KAZANAN: Plantero (delta 0).';
  const f = r.open.find((x) => x.id === 'arge-projeler-08')!;
  f.measure =
    'tur 8 yeniden ölçüm: ilk tablo satırı viewport 238px / <main> ofseti 190px (tur 4,5,6,7 ile birebir aynı). Hedef ≤112px. Kök neden değişmedi: PageHeader başlık bloğu ile DataTable araç çubuğu iki ayrı yatay şerit (shell kompozisyonu).';
  f.reMeasuredRound = 8;
  f.lastMeasuredRound = 8;
}

// ---------------------------------------------------------------- board
{
  const r = card.routes['/arge/projeler/[id]/board']!;
  r.round = 8;
  r.scores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 60;
  r.winner = 'Plantero';
  r.measures = {
    ...r.measures,
    round8: {
      scrollWidth_1440: 1440,
      clientWidth_1440: 1440,
      scrollWidth_390: 390,
      clientWidth_390: 390,
      overflowX: false,
      h1: '24px/600 (mobil 20px/600)',
      distinctColors: { '1440': 18, '390': 16 },
      touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Pano" 31.3x19.5 (etkileşimsiz metin)'],
      kolonSeridi: 'scrollbar-thin scroll-fade-x … scrollWidth 1864 / clientWidth 1152 — kendi ekseninde kayar, sağ kenarda soldurma affordansı görsel olarak doğrulandı (artifacts/screens/…-board/desktop.png sağ kenar kırpması)',
      kolonGenislikleri: '5 kolon × 256px görünür, sağdaki 6. kolon kenardan kırpılıyor (kaydırma ipucu)',
      motion: 'layout spring .35/bounce .15, DragOverlay drop 220ms cubic-bezier(0.23,1,0.32,1), sürükleme scale 1.02–1.04 spring',
    },
  };
  r.scoreNotes =
    'Tur 8. 12/12 kriter yeniden ölçüldü, tur 6 ve 7 ile aynı: 1440 ve 390\'da yatay sayfa taşması yok (scrollWidth=clientWidth); kanban kolon şeridi kendi ekseninde kayıyor (1864/1152) ve sağ kenarda scroll-fade-x soldurması ekran görüntüsünde doğrulandı; 390px\'te <44px etkileşimli hedef YOK (yalnız etkileşimsiz breadcrumb metni 31,3×19,5); h1 24/600 (mobil 20/600); 18/16 renk. Motion temiz: layout spring .35/bounce .15, drop 220ms ease-out; transition:all / ease-in / >300ms / scale(0) yok; hover global olarak (hover:hover)+(pointer:fine) ile korunuyor. Açık P0/P1 yok, toplam 60 ≥ 57 → KAZANAN: Plantero (delta 0).';
}

// ---------------------------------------------------------------- proje reçeteleri
{
  const r = card.routes['/arge/projeler/[id]/receteler']!;
  r.round = 8;
  r.scores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 60;
  r.winner = 'Plantero';
  r.measures = {
    ...r.measures,
    round8: {
      urunSutunu: 'gridTemplateColumns başlıkları ölçüldü: Ürün 238px (172→238), Miktar 144, Maliyet kaynağı 128, B. maliyet 112, Fire % 64, Satır maliyeti 112',
      urunAdiKirpma: '6/6 ad span clientWidth=scrollWidth=153px → kırpılan ad 0/6 (arge-recete-36 DOĞRULANDI)',
      basikDegerHizasi: 'sağa hizalı 4 sütunda th ve td sağ kenarı ±0: Miktar 907/907, B. maliyet 1163/1163, Fire % 1235/1235, Satır maliyeti 1355/1355',
      tabloCercevesi: 'div[role=table] className="text-[13px]" — kendi border/rounded-lg\'si yok (arge-recete-38 DOĞRULANDI)',
      kartIciCerceveSayisi: '1440: 5 (hedef ≤10) — devir bildirimi + 4 üst form kontrolü; tablo hücrelerinde kenarlıklı kutu yok',
      satirYukseklikleri_1440: [39, 39, 39, 39, 39, 38],
      ilkEkran: 'docScrollHeight 900 = innerHeight 900 → 6/6 malzeme satırı ilk ekranda, sıfır kaydırma',
      mobil390: 'Versiyon SelectTrigger 160×44, metin "v2 · Devredildi" tam (span cw=sw=88), native select 0, docScrollWidth=clientWidth=390, satır yükseklikleri 48–49px (arge-recete-37 DOĞRULANDI)',
      touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Deneme Reçeteleri" 117.4x19.5 (etkileşimsiz metin)'],
      distinctColors: { '1440': 23, '390': 20 },
      h1: '24px/600 (mobil 20px/600)',
    },
  };
  r.scoreNotes =
    'Tur 8 (Stripe 56). Builder\'ın tur-7 kapanışlarının ÜÇÜ DE bağımsız ölçümle DOĞRULANDI: (36) Ürün sütunu 172→238px, 6/6 ad span clientWidth=scrollWidth=153px → kırpılan ürün adı 0/6; ayrıca sağa hizalı DÖRT sütunda th/td sağ kenarı ±0 (907/1163/1235/1355) → c5 4→5. (37) 390px Versiyon seçici 112→160px, "v2 · Devredildi" tam görünür (span cw=sw=88), native select 0, yatay taşma yok, satırlar 48–49px, tüm etkileşimli hedefler ≥44px → c9 4→5. (38) div[role=table] artık yalnız "text-[13px]" — dış rounded-xl kartla eşmerkezli ikinci çerçeve kalktı; kart içi kenarlıklı dikdörtgen 1440\'ta 5 (hedef ≤10) ve kalanların hiçbiri tablo hücresi değil → c12 4→5. Diğer 9 kriter yeniden ölçüldü, tur 7 ile aynı: satır 38–39px, 6/6 satır ilk ekranda (docScrollHeight 900 = innerHeight), h1 24/600, 23/20 renk, hedef çubuğu + %3 hedef üstü tek vurgu rengiyle. Kod taraması temiz (transition:all / ease-in / scale(0) / >300ms yok; hover (hover:hover)+(pointer:fine) ile korunuyor). Toplam 57→60 ≥ 56, hiçbir kriter <4, açık P0/P1 YOK → KAZANAN: Plantero (delta +3, tur 7\'de Stripe kazanıyordu).';
  for (const id of ['arge-recete-36', 'arge-recete-37', 'arge-recete-38']) {
    const f = r.closed.find((x) => x.id === id);
    if (f) {
      f.verifiedByCriticRound = 8;
      f.verifiedBy = 'ölçüm (tur 8 kritik bağımsız doğrulaması)';
    }
  }
}

// ---------------------------------------------------------------- /arge/receteler
{
  const r = card.routes['/arge/receteler']!;
  r.round = 8;
  r.scores = [5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 4, 5];
  r.total = 58;
  r.winner = 'Plantero';
  r.measures = {
    ...r.measures,
    round8: {
      firstRowTop_viewport: 208,
      firstRowTop_mainOffset: 160,
      rowHeights_1440: [36, 36, 36],
      rowHeights_390: [63.5, 63.5, 63.5],
      thTdRightEdges: 'th/td sağ kenarları 7/7 sütunda ±0 (707.8/831.2/921.3/1051.3/1171.3/1276/1416)',
      birimMaliyetRenkleri: '3/3 satır oklch(0.21 0.006 285.9) = foreground (₺166,17 / ₺103,41 / ₺31,92)',
      bosDurum: 'arama "zzzz" → "Eşleşen kayıt yok" + "Arama ya da filtreleri değiştirmeyi deneyin." + ikon (artifacts/critic/arge-r8-bos-1440.png)',
      distinctColors: { '1440': 21, '390': 20 },
      touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Deneme Reçeteleri" 117.4x19.5 (etkileşimsiz metin)'],
    },
  };
  r.scoreNotes =
    'Tur 8. İki açık P2 yeniden ölçüldü, İKİSİ DE AÇIK: (02) ilk tablo satırı viewport 208px / <main> ofseti 160px — tur 5,6,7 ile aynı, hedef ≤112px (c2=4). (03) Birim maliyet sütunu 3/3 satır foreground; aynı iki değer /arge/projeler\'de warning turuncusu → kardeş ekranlar çelişkili sinyal veriyor (c11=4). Kök neden bu tur dosya düzeyinde doğrulandı: all-recipes-table.tsx unitCost hücresi düz `<MoneyCell …/>`, project-list.tsx ise `cn(overTarget && \'text-warning\')` uyguluyor; RecipeSummaryRow\'da targetUnitCost alanı yok (queries.ts:203) — şema değişikliği gerekmiyor, rndProjects.targetUnitCost select\'e eklenip aynı kural uygulanabilir. Diğer 10 kriter yeniden ölçüldü, tur 7 ile aynı: satır 36px×3, mobil kart 63,5px, taşma yok, h1 24/600 (mobil 20/600), th/td sağ kenarları ±0, boş durum ikon+başlık+yönlendirme ile özenli, 390px\'te <44px etkileşimli hedef yok. Açık P0/P1 yok, toplam 58 ≥ 57 → KAZANAN: Plantero (delta 0).';
  for (const id of ['arge-receteler-02', 'arge-receteler-03']) {
    const f = r.open.find((x) => x.id === id);
    if (!f) continue;
    f.reMeasuredRound = 8;
    f.lastMeasuredRound = 8;
    if (id === 'arge-receteler-02') {
      f.measure =
        'tur 8 yeniden ölçüm: ilk tablo satırı viewport 208px / <main> ofseti 160px (tur 5,6,7 ile aynı; hedef ≤112px). Kalan bütçe PageHeader başlığı ile DataTable araç çubuğunun iki ayrı şerit olmasından geliyor (shell).';
    } else {
      f.measure =
        'tur 8: /arge/receteler Birim maliyet sütunu 3/3 satır oklch(0.21 0.006 285.9)=foreground; /arge/projeler aynı değerler için 2/3 satır oklch(0.72 0.17 70)=warning. Kök neden: all-recipes-table.tsx:35 düz MoneyCell (project-list.tsx:87 `cn(overTarget && "text-warning")` uyguluyor) ve RecipeSummaryRow targetUnitCost taşımıyor (queries.ts:203).';
    }
  }
}

writeFileSync(path, `${JSON.stringify(card, null, 1)}\n`);
console.log('arge.json tur 8 güncellendi');
for (const [route, r] of Object.entries(card.routes)) {
  console.log(` ${route}: ${r.total}/${r.referenceTotal} ${r.winner} open=${r.open.length} scores=${r.scores.join(',')}`);
}
