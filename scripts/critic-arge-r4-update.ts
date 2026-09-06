/** gorsel-critic Tur 4 — artifacts/critic/arge.json güncellemesi. */
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'artifacts/critic/arge.json';
type Finding = Record<string, unknown>;
const card = JSON.parse(readFileSync(path, 'utf8')) as {
  module: string; round: number; updatedAt: string;
  routes: Record<string, { round: number; reference: string; referenceTotal: number; scores: number[]; total: number; winner: string; scoreNotes: string; measures: Record<string, unknown>; open: Finding[]; closed: Finding[] }>;
};

card.round = 4;
card.updatedAt = '2026-09-06';

const R = card.routes;

// ---------------------------------------------------------------- /arge/projeler
{
  const r = R['/arge/projeler']!;
  r.round = 4;
  r.scores = [5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 59;
  r.winner = 'Plantero';
  r.scoreNotes =
    'Tur 4. Tek açık bulgu (arge-projeler-08, c2, P2) yeniden ölçüldü ve AÇIK KALIYOR: tbody ilk satır viewport 238px / <main> ofseti 190px — tur 3 ile birebir aynı, iyileşme yok. Diğer 11 kriter değişmedi ve yeniden doğrulandı: satır 36px×3, scrollWidth 1440 = clientWidth (taşma yok), 390px\'te <44px etkileşimli hedef YOK (yalnız etkileşimsiz breadcrumb span\'i), mobil kart 63,5px, "Yeni proje" 358×44, h1 24px/600 (mobil 20px/600), 18 farklı renk (yeşil vurgu + turuncu hedef-üstü + nötr). Açık P0/P1 yok, toplam 59 ≥ 57 → KAZANAN: Plantero.';
  r.measures = {
    ...r.measures,
    round4: {
      scrollWidth: 1440, clientWidth: 1440, overflowX: false,
      rowHeights_1440: [36, 36, 36], rowHeights_390: [63.5, 63.5, 63.5],
      firstRowTop_viewport: 238, firstRowTop_mainOffset: 190,
      h1: '24px/600', mobilH1: '20px/600',
      touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Projeler" 47.8x19.5 (etkileşimsiz metin)'],
      yeniProjeBtn_390: '358x44',
      fontSizes_1440: { 10: 2, 11: 8, 12: 11, 13: 24, 14: 3, 15: 1, 18: 1, 24: 1 },
      distinctColors: 18,
    },
  };
  r.open = [{
    ...(r.open[0] as Finding),
    measure: 'tur 4: tbody ilk satır top = 238px (viewport), <main> ofseti 190px — tur 3 ile aynı (238/190), iyileşme yok',
    reMeasuredRound: 4,
  }];
}

// ---------------------------------------------------------------- /arge/receteler
{
  const r = R['/arge/receteler']!;
  r.round = 4;
  r.scores = [5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 4, 5];
  r.total = 58;
  r.winner = 'Plantero';
  r.scoreNotes =
    'Tur 4. arge-receteler-02 (c2, P2) yeniden ölçüldü, AÇIK KALIYOR: ilk satır <main> ofseti 184px / viewport 232px — tur 3 ile aynı. c11=4 KALIYOR: mobil kart meta ayracının sol boşluğu hâlâ çöküyor ("Şekersiz Protein· v1"); DOM metninde boşluk VAR ("Şekersiz Protein · v1") ama ayraç span\'i overflow-hidden alt başlık kutusunun hemen ardında geldiği için baştaki boşluk daraltılıyor — kök neden ortak bileşen (components/data-table/mobile-cards.tsx:287), shell.json\'da shell-mobile-card-meta-sep-space-01 / shell-mobcard-separator-gap-01 olarak zaten AÇIK; protokol kural 5 gereği arge\'de tekrar açılmadı. Diğer ölçümler değişmedi: satır 36px×3, mobil kart 64px, overflowX=false, 390px\'te <44px etkileşimli hedef yok, ₺ tutarlar sağa yaslı tabular-nums. Açık P0/P1 yok, toplam 58 ≥ 57 → KAZANAN: Plantero.';
  r.measures = {
    ...r.measures,
    round4: {
      scrollWidth: 1440, clientWidth: 1440, overflowX: false,
      rowHeights_1440: [36, 36, 36], mobilKart_390: [64, 64, 64],
      firstRowTop_viewport: 232, firstRowTop_mainOffset: 184,
      dataTableHeader: '12px / text-transform:none / letter-spacing:normal / muted — modülün referans tablo başlığı',
      mobilKartMetni_390: ['Şekersiz Protein · v1', 'Oat Barista v2 · v2', 'Fıstık Bazı · v1'],
      mobilKartAyraci: 'DOM\'da boşluklu, EKRANDA çökmüş (subtitle span overflow-hidden → sonraki flex öğesinin baştaki boşluğu daraltılıyor) — shell bulgusu',
      touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] (etkileşimsiz)'],
      distinctColors: 22,
    },
  };
  r.open = [{
    ...(r.open[0] as Finding),
    measure: 'tur 4: ilk satır <main> ofseti 184px, viewport top 232px — tur 3 ile aynı, iyileşme yok',
    reMeasuredRound: 4,
  }];
}

// ---------------------------------------------------------------- board
{
  const r = R['/arge/projeler/[id]/board']!;
  r.round = 4;
  r.scores = [5, 5, 5, 5, 5, 5, 5, 5, 4, 5, 5, 5];
  r.total = 59;
  r.winner = 'Plantero';
  r.scoreNotes =
    'Tur 4. arge-board-15 (c9, P2) yeniden ölçüldü, AÇIK KALIYOR: 390px\'te "Pano" sekmesi 31,3×44 — genişlik hâlâ 44px altında (project-nav-tabs.tsx:26 `flex h-11 items-center`, yatay dolgu yok). Aynı kusur /arge/projeler/[id]/receteler rotasında da görünür (tek bileşen, tek bulgu). Diğer ölçümler tur 3 ile birebir doğrulandı: kolon yükseklikleri 588px×6, kaydırıcı scrollW 1864 / clientW 1152, docScrollH 904 (viewport 900) ve 390px\'te 844 = innerHeight (dikey taşma yok), mini-nav pilleri 390px\'te 44px, mobil ölçümde <44px etkileşimli hedef yalnız "Pano". Kod taraması temiz: transition-all / ease-in / >300ms / scale(0) yok; hareket 150–200ms ease-out ve ad verilmiş özelliklerle sınırlı. Açık P0/P1 yok, toplam 59 ≥ 57 → KAZANAN: Plantero.';
  r.measures = {
    ...r.measures,
    round4: {
      scroller_1440: { scrollW: 1864, clientW: 1152 },
      docScrollH_1440: 904, docScrollH_390: 844,
      overflowX_1440: false, overflowX_390: false,
      touchTargetsBelow44_390: ['a "Pano" 31.3x44 (genişlik ihlali)', 'breadcrumb span (etkileşimsiz)'],
      miniNavChips_1440: [{ t: 'Fikir', w: 44, h: 32 }, { t: 'Formülasyon', w: 89, h: 32 }, { t: 'Pilot Üretim', w: 82, h: 32 }, { t: 'Duyusal Test', w: 89, h: 32 }, { t: 'Raf Ömrü', w: 71, h: 32 }, { t: 'Onay', w: 49, h: 32 }],
      distinctColors: 20,
      h1: '24px/600',
    },
  };
  r.open = [{
    ...(r.open[0] as Finding),
    measure: 'tur 4: pnpm measure /arge/projeler/<id>/board --viewport 390x844 → a "Pano" 31.3×44; aynı sekme /receteler rotasında da 31.3×44',
    reMeasuredRound: 4,
  }];
}

// ---------------------------------------------------------------- [id]/receteler
{
  const key = '/arge/projeler/[id]/receteler';
  const r = R[key]!;
  const prevOpen = r.open[0] as Finding; // arge-recete-18
  r.round = 4;
  r.scores = [4, 5, 4, 5, 5, 4, 5, 5, 4, 5, 4, 4];
  r.total = 54;
  r.winner = 'Linear';
  r.scoreNotes =
    'Tur 4. KAPANAN (bağımsız ölçümle doğrulandı): arge-recete-15 (c7) — panele geçişte aria-busy=1 ve 4→51 iskelet öğesi ölçüldü, çıplak spinner YOK, panel 384→498→703px kademeli büyüyor; ayrıca reçetesiz projede EmptyState + route loading.tsx iskeleti var → c7 3→5. arge-recete-16 (c5) — 390px\'te scrollWidth 390 = clientWidth, altı sütunun tamamı etiketiyle görünür (min-w-[800px] gitti) → c5 4→5. arge-recete-17 (c4) — hedef çubuğu ve tutar artık warning (oklch 0.72 0.17 70), /arge/projeler ile aynı ton; <main> içinde 14 farklı renk, 2 vurgu ailesi (yeşil + kehribar) + nötr → c4 4→5. AÇIK KALAN: arge-recete-18 (c9) — 390px\'te hedef maliyet paneli 645,5px\'te başlıyor (tur 3: ≈650), iyileşme yok; P2→P1 (iki turdur açık ve c9\'un 5\'e çıkmasını tek başına engelliyor). DÜŞEN: c1 5→4 — satır tablosunun para hücreleri (MoneyCell) 16px basılıyor (grid kabında font-size yok, gövde 16px tabanı miras alınıyor), AYNI sütundaki düzenlenebilir input 13px, başlık 11px; ekranda 8 boyut kademesi (10/11/12/13/14/15/16/18/24). c3 5→4 — 390px\'te satır yüksekliği 51px\'ten 321px\'e çıktı (tur 3 taşma düzeltmesinin bedeli), 4 malzemelik reçetede doc 1659→2617px, "Satırı sil" tek başına 44px\'lik bir satır tüketiyor. c6 5→4 — "Birim maliyet" sütununda manuel satırın rakam sağ kenarı 1110px, metin satırlarınınki 1122px (12px kayma, ondalıklar hizasız); ayrıca Fire % sıfır değerleri tam foreground (soluk-sıfır kuralı uygulanmıyor). c11 5→4 — satır tablosu başlığı 11px UPPERCASE + tracking 0.275px + bg-muted/40 iken uygulamanın DataTable başlığı 12px, text-transform:none, zeminsiz: tek üründe iki tablo başlığı dili. c12 5→4 — <textarea> resize:vertical (yerel tutamaç görünüyor) ve kartın (916×703) içinde üç ayrı TAM kenarlıklı kutu (882×87 hedef paneli, 882×191 satır tablosu, 882×64 not alanı) — kutu-içinde-kutu. Toplam 54 < 57 → KAZANAN: Linear. Yakınsama (§7): 4 puanlı c1/c3/c6/c9/c11/c12 kriterlerinin HEPSİ için ölçülebilir bulgu açıldı (kapanınca 54+6=60 ≥ 57).';
  r.measures = {
    ...r.measures,
    round4: {
      scrollWidth_1440: 1440, clientWidth_1440: 1440, overflowX_1440: false,
      scrollWidth_390: 390, clientWidth_390: 390, overflowX_390: false,
      rowHeights_1440: [39, 39, 39, 38], rowHeights_390: [321, 321, 321, 320],
      docScrollH_1440: 967, docScrollH_390: 2617,
      yuklemeFazi_1440: { ariaBusy: 1, skeletonCount: '4 → 51', spinner: 0, panelH: '384 → 498 → 703', docH: '900 → 967' },
      moneyCellFontSize: '16px (satır tablosu ₺ değerleri) — aynı sütundaki input 13px, başlık 11px',
      fontSizes_1440: { 10: 2, 11: 27, 12: 1, 13: 34, 14: 7, 15: 3, 16: 7, 18: 1, 24: 1 },
      birimMaliyetSagKenar: { manuelInputRakamSagi: 1110, metinSatirlariSagi: 1122, fark: 12 },
      fireYuzdeSifirRengi: 'oklch(0.21 0.006 285.9) = foreground (3 satırda "0")',
      satirTablosuBaslik: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.275px', bg: 'muted/40' },
      dataTableBaslik_referans: { fontSize: '12px', textTransform: 'none', letterSpacing: 'normal', bg: 'yok' },
      textarea: { resize: 'vertical', h: 64 },
      icIceKenarlikliKutular: [{ cls: 'rounded-xl border bg-card p-4', w: 916, h: 703 }, { cls: 'rounded-lg border p-4 (hedef paneli)', w: 882, h: 87 }, { cls: 'rounded-lg border (satır tablosu)', w: 882, h: 191 }, { cls: 'textarea border', w: 882, h: 64 }],
      touchTargetsBelow44_390: ['button "Kaydet" 91×32', 'button "Onaya gönder" 136×32', 'a "Pano" 31.3×44 (genişlik — arge-board-15)'],
      hedefPaneliTop_390: 645.5,
      satirTablosuTop_390: 1003.5,
      distinctColors_main: 14,
      distinctColors_sayfa: 19,
    },
  };
  const nowOpen: Finding[] = [
    {
      id: 'arge-recete-19', criterion: 1, severity: 'P1',
      text: 'Satır tablosunun para hücreleri (MoneyCell) 16px basılıyor: grid kabında hiçbir font-size sınıfı yok, gövdenin 16px tabanı miras alınıyor. AYNI "Birim maliyet" sütununda manuel satırın input\'u 13px, başlık 11px — bir sütun içinde iki farklı punto. Ekranda 8 boyut kademesi (10/11/12/13/14/15/16/18/24) var; referans üç kademe kullanır (11 etiket / 13 gövde / 20-24 başlık).',
      measure: '1440px: MoneyCell span\'leri font-size 16px (₺120,00 / ₺15,00 / ₺22,00 / satır maliyetleri), kardeş input 13px, başlık 11px; fontSizes_1440 = {10:2, 11:27, 12:1, 13:34, 14:7, 15:3, 16:7, 18:1, 24:1}',
      target: 'Satır tablosu gövdesine text-[13px] (ör. role="table" kabına) → sütundaki tüm değerler 13px; ekrandaki gövde punto kademesi ≤3 (11 etiket / 13 gövde / 15 toplam). Ölçüm: fontSizes içinde 16px sayısı 0.',
      file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx:355 (role="table" kabı) + MoneyCell çağrıları', openedRound: 4,
    },
    {
      id: 'arge-recete-20', criterion: 9, severity: 'P1',
      text: '390px\'te panelin birincil eylemleri "Kaydet" ve "Onaya gönder" 32px yüksekliğinde — sayfadaki diğer tüm kontroller (form alanları, satır kontrolleri, versiyon butonları) 44px\'e çıkarılmışken bu iki buton atlanmış.',
      measure: 'pnpm measure /arge/projeler/<id>/receteler --viewport 390x844 → button "Kaydet" 90.8×32, button "Onaya gönder" 136.4×32 (touchTargetsBelow44 listesinde)',
      target: '390px\'te ikisi de ≥44px yükseklik (h-11 md:h-8 — sayfadaki mevcut desen); measure touchTargetsBelow44 içinde kalan tek etkileşimli öğe olmayacak.',
      file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx (başlık şeridi Kaydet/Onaya gönder butonları)', openedRound: 4,
    },
    {
      id: 'arge-recete-21', criterion: 3, severity: 'P1',
      text: '390px\'te malzeme satırı 321px yükseklik kaplıyor (tur 3\'te 51px\'ti; taşma düzeltmesi her alanı kendi etiketiyle alt alta yığdı). 4 malzemelik bir reçetede yalnız satırlar 1284px, sayfa 2617px. "Satırı sil" butonu kendi başına 44px\'lik tam bir satır tüketiyor (col-span-2).',
      measure: '390×844: [role=row] yükseklikleri [321, 321, 321, 320]; document.scrollHeight 2617 (tur 3: 1659); "Satırı sil" satırı 44px, yalnız ikon taşıyor',
      target: '390px\'te satır yüksekliği ≤200px (etiket-değer çiftleri tek satırda yan yana: etiket solda muted, değer sağda; sil ikonu ürün satırının sağ ucuna) → 4 satır ≤800px, document.scrollHeight ≤2100.',
      file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx:360-470 (satır grid\'i, FieldLabel)', openedRound: 4,
    },
    {
      id: 'arge-recete-22', criterion: 6, severity: 'P1',
      text: '"Birim maliyet" sütununda ondalıklar hizasız: manuel satırın input\'undaki rakamlar 12px daha solda bitiyor (input\'un 12px sağ dolgusu), metin satırlarının MoneyCell değerleri sütun kenarına dayanıyor. Ayrıca "Fire %" sütununda sıfır değerleri tam foreground renginde — soluk-sıfır kuralı uygulanmıyor (aynı ilke shell-kpicard-zero-tone-01).',
      measure: '1440px: manuel satır input rakam sağ kenarı 1110px, metin satırları 1122px (Δ12px); Fire % "0" değerleri color oklch(0.21 0.006 285.9) = foreground (3/4 satır)',
      target: 'Sütundaki tüm değerlerin rakam sağ kenarı ±1px içinde (input\'a md:pr-0 ya da MoneyCell\'e eşdeğer sağ dolgu); sıfır değerler text-muted-foreground.',
      file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx:437-455 (birim maliyet hücresi) ve 457-470 (fire % hücresi)', openedRound: 4,
    },
    {
      id: 'arge-recete-23', criterion: 11, severity: 'P1',
      text: 'Satır tablosunun başlığı uygulamanın kendi tablo başlığından farklı bir dil konuşuyor: 11px UPPERCASE + tracking 0.275px + bg-muted/40 zemin şeridi; buna karşılık aynı modülün /arge/receteler ve /arge/projeler tabloları (ortak DataTable) 12px, text-transform:none, zeminsiz, muted. Tek üründe iki tablo başlığı anatomisi.',
      measure: 'cost-simulator satır tablosu başlığı: font-size 11px, text-transform uppercase, letter-spacing 0.275px, background oklab(...0.4) = muted/40. DataTable th: font-size 12px, text-transform none, letter-spacing normal, background transparent.',
      target: 'Satır tablosu başlığı DataTable ile aynı: 12px, text-transform:none, letter-spacing:normal, zeminsiz (yalnız alt hairline), muted renk. (Aynı düzeltme CostSimulatorSkeleton\'daki başlık şeridine de uygulanmalı ki iskelet gerçek başlığı yansıtsın.)',
      file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx:356-368 + recipe-workspace.tsx:170-176 (iskelet başlığı)', openedRound: 4,
    },
    {
      id: 'arge-recete-24', criterion: 12, severity: 'P1',
      text: 'Kutu-içinde-kutu + varsayılan HTML izi: 916×703 kenarlıklı kartın içinde üç ayrı TAM kenarlıklı kutu daha var (hedef maliyet paneli 882×87, satır tablosu 882×191, not alanı 882×64) ve <textarea> resize:vertical olduğu için sağ alt köşede tarayıcının yerel tutamacı görünüyor (field-sizing-content zaten otomatik büyütüyor, tutamaç işlevsiz süs).',
      measure: '1440px: <main> içinde tam kenarlıklı (4 kenar) kutu sayısı 4 ve iç içe: kart 916×703 > {882×87, 882×191, 882×64}; textarea computed resize = "vertical"',
      target: 'İç içe tam kenarlıklı kutu sayısı ≤2 (kart + satır tablosu): hedef maliyet paneli kenarlıksız blok (yalnız üst/alt hairline ya da bg-muted/30), not alanı odak dışında kenarlıksız; textarea resize:none (resize-none sınıfı).',
      file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx:254 (hedef paneli), :505 (Textarea)', openedRound: 4,
    },
  ];
  r.open = [
    { ...prevOpen, severity: 'P1', criterion: 9, measure: 'tur 4 (390×844): "Hedef maliyete göre" paneli top = 645,5px (viewport\'un %76,5\'i); satır tablosu top = 1003,5px — ilk ekranda tek bir malzeme satırı yok. Tur 3: ≈650px → iyileşme yok.', reMeasuredRound: 4 },
    ...nowOpen,
  ];
  r.closed = [
    ...r.closed,
  ];
}

writeFileSync(path, JSON.stringify(card, null, 1) + '\n');
console.log('ok');
