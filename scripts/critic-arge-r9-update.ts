/**
 * Tur 9 — artifacts/critic/arge.json puan kartı güncellemesi (gorsel-critic).
 * docs/DESIGN-SCORECARD.md protokolü: açık bulgular yeniden ölçüldü, kriterler yeniden puanlandı.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'artifacts/critic/arge.json';
const card = JSON.parse(readFileSync(path, 'utf8')) as any;

card.round = 9;
card.updatedAt = '2026-09-07';

// ---------------------------------------------------------------- /arge/projeler
{
  const r = card.routes['/arge/projeler'];
  r.round = 9;
  r.scores = [5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 59;
  r.winner = 'Plantero';
  r.scoreNotes =
    'Tur 9. Tek açık bulgu (arge-projeler-08, c2, P2) yeniden ölçüldü: ilk tablo satırı viewport 238px / <main> ofseti 190px — yedi turdur (4,5,6,7,8,9) birebir aynı, AÇIK KALIYOR (c2=4). Diğer 11 kriter yeniden ölçüldü, tur 8 ile aynı: satır 36px×3, 1440/390 scrollWidth=clientWidth (taşma yok), 390px\'te <44px ETKİLEŞİMLİ hedef yok (yalnız etkileşimsiz breadcrumb metni 47.8×19.5), mobil kart 63,5px, h1 24/600 (mobil 20/600), 17/16 renk. Bu tur ek olarak kardeş tablo anatomisi bire bir karşılaştırıldı (/arge/receteler ile): thead zemini oklch(0.967 0.001 286.4), th 12px/500 muted, satır ayracı 1px border/50, satır 36px, kapsayıcı çerçevesi 0px — iki tabloda BİREBİR AYNI, c5/c11 sapması yok. Odak halkası görsel doğrulamayla teyit edildi: Button focus-visible → ring oklab(0.55 -0.141 0.075 / 0.5) 0 0 0 3px (c8=5). Kod taraması (modules/rnd + app/(app)/arge): transition:all / ease-in / scale(0) / >300ms YOK (en uzun 200ms), hover global `@custom-variant hover` ile (hover:hover)+(pointer:fine)\'a kapatılı, prefers-reduced-motion bloğu var. Açık P0/P1 yok, toplam 59 ≥ 57 → KAZANAN: Plantero (delta 0).';
  r.measures.round9 = {
    scrollWidth_1440: 1440,
    clientWidth_1440: 1440,
    overflowX_1440: false,
    scrollWidth_390: 390,
    clientWidth_390: 390,
    overflowX_390: false,
    rowHeights_1440: [36, 36, 36],
    rowHeights_390: [63.5, 63.5, 63.5],
    h1_1440: '24px/600',
    h1_390: '20px/600',
    fontSizes_1440: { '10': 2, '11': 8, '12': 11, '13': 32, '14': 3, '15': 1, '18': 1, '24': 1 },
    distinctColors_1440: 17,
    distinctColors_390: 16,
    firstRowTop_viewport: 238,
    firstRowTop_mainOffset: 190,
    touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Projeler" 47.8x19.5 (etkileşimsiz metin)'],
    tabloAnatomisi:
      'thead bg oklch(0.967 0.001 286.4) · th 12px/500 oklch(0.552 0.016 285.9) · satır ayracı 1px oklab(0.92 …/0.5) · kapsayıcı border 0px · satır 36px — /arge/receteler ile birebir aynı',
    birimMaliyetRenkleri: [
      { t: '₺31,92', color: 'oklch(0.72 0.17 70) = warning' },
      { t: '₺166,17', color: 'oklch(0.21 0.006 285.9) = foreground' },
      { t: '₺103,41', color: 'oklch(0.72 0.17 70) = warning' },
    ],
    odakHalkasi: 'Button focus-visible → boxShadow oklab(0.55 -0.141272 0.0751154 / 0.5) 0px 0px 0px 3px (görsel: artifacts/critic/arge-r9-focus-yeniproje.png)',
  };
  r.open[0].measure =
    'tur 9 yeniden ölçüm: ilk tablo satırı viewport 238px / <main> ofseti 190px (tur 4,5,6,7,8 ile birebir aynı). Hedef ≤112px. Kök neden değişmedi: PageHeader başlık bloğu ile DataTable araç çubuğu iki ayrı yatay şerit (shell kompozisyonu).';
  r.open[0].reMeasuredRound = 9;
  r.open[0].lastMeasuredRound = 9;
}

// ---------------------------------------------------------------- /arge/receteler
{
  const r = card.routes['/arge/receteler'];
  r.round = 9;
  r.scores = [5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 4, 5];
  r.total = 58;
  r.winner = 'Plantero';
  r.scoreNotes =
    'Tur 9. İki açık P2 yeniden ölçüldü, İKİSİ DE AÇIK: (02, c2) ilk tablo satırı viewport 208px / <main> ofseti 160px — tur 5,6,7,8 ile aynı, hedef ≤112px. (03, c11) Birim maliyet sütunu 3/3 satır oklch(0.21 0.006 285.9)=foreground iken /arge/projeler AYNI iki değeri (₺31,92, ₺103,41) oklch(0.72 0.17 70)=warning ile basıyor → aynı olgu iki kardeş ekranda iki farklı dille anlatılıyor (c11=4). Diğer 10 kriter yeniden ölçüldü, tur 8 ile aynı: satır 36px×3, 1440/390 taşma yok, mobil kart 63,5px, h1 24/600 (mobil 20/600), 21/20 renk, <44px etkileşimli hedef yok. Tablo anatomisi /arge/projeler ile BİREBİR aynı ölçüldü (thead zemini, th 12/500, 1px hairline ayraç, kapsayıcı çerçevesi 0px) → c5=5 teyit. Kod taraması temiz. Açık P0/P1 yok, toplam 58 ≥ 57 → KAZANAN: Plantero (delta 0).';
  r.measures = r.measures ?? {};
  r.measures.round9 = {
    scrollWidth_1440: 1440,
    clientWidth_1440: 1440,
    overflowX_1440: false,
    scrollWidth_390: 390,
    clientWidth_390: 390,
    overflowX_390: false,
    rowHeights_1440: [36, 36, 36],
    rowHeights_390: [63.5, 63.5, 63.5],
    h1_1440: '24px/600',
    h1_390: '20px/600',
    fontSizes_1440: { '10': 2, '11': 5, '12': 9, '13': 37, '14': 1, '15': 1, '18': 1, '24': 1 },
    distinctColors_1440: 21,
    distinctColors_390: 20,
    firstRowTop_viewport: 208,
    firstRowTop_mainOffset: 160,
    touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Deneme Reçeteleri" 117.4x19.5 (etkileşimsiz metin)'],
    birimMaliyetRenkleri: [
      { t: '₺166,17', color: 'oklch(0.21 0.006 285.9) = foreground' },
      { t: '₺103,41', color: 'oklch(0.21 0.006 285.9) = foreground' },
      { t: '₺31,92', color: 'oklch(0.21 0.006 285.9) = foreground' },
    ],
    tabloAnatomisi: '/arge/projeler ile birebir aynı: thead bg oklch(0.967 0.001 286.4), th 12px/500, satır ayracı 1px oklab(0.92 …/0.5), kapsayıcı border 0px, satır 36px',
  };
  for (const o of r.open) {
    o.reMeasuredRound = 9;
    o.lastMeasuredRound = 9;
  }
  r.open[0].measure =
    'tur 9 yeniden ölçüm: ilk tablo satırı viewport 208px / <main> ofseti 160px (tur 5,6,7,8 ile aynı; hedef ≤112px). Kalan bütçe PageHeader başlığı ile DataTable araç çubuğunun iki ayrı şerit olmasından geliyor.';
  r.open[1].measure =
    'tur 9: /arge/receteler Birim maliyet sütunu 3/3 satır oklch(0.21 0.006 285.9)=foreground; /arge/projeler aynı değerler için 2/3 satır oklch(0.72 0.17 70)=warning (₺31,92 ve ₺103,41). Kök neden değişmedi.';
}

// ------------------------------------------------- /arge/projeler/[id]/board
{
  const r = card.routes['/arge/projeler/[id]/board'];
  r.round = 9;
  r.scores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 60;
  r.winner = 'Plantero';
  r.scoreNotes =
    'Tur 9. Açık bulgu yok; 12 kriter yeniden ölçüldü, tur 8 ile aynı. 1440: sayfa scrollWidth=clientWidth=1440 (yatay taşma YOK — kanban kendi `overflow-x:auto` kaydırıcısında, sw 1864 / cw 1152, scroll-fade-x kenar ipucu var), h1 24/600, 19 renk, font kademeleri 11/13/14 ağırlıklı. 390: scrollWidth=clientWidth=390, <44px etkileşimli hedef YOK, h1 20/600, 17 renk. Kart etkileşimi doğrudan ölçüldü: rest border oklab(0.92 …/0.6) + shadow 0 1px 2px rgba(0,0,0,.04) → hover border oklch(0.92 0.004 286.3) + shadow 0 1px 3px/0 1px 2px (fare hareketiyle doğrulandı), kart <button tabindex=0>, active:scale-[0.98] yalnız :not(:focus-visible) altında. Kod taraması: transition-[transform,box-shadow,opacity] duration-150 ease-out — transition:all / ease-in / scale(0) / >300ms YOK. Toplam 60 ≥ 57, hiçbir kriter <4, açık P0/P1 yok → KAZANAN: Plantero (delta 0).';
  r.measures = r.measures ?? {};
  r.measures.round9 = {
    scrollWidth_1440: 1440,
    clientWidth_1440: 1440,
    overflowX_1440: false,
    scrollWidth_390: 390,
    clientWidth_390: 390,
    overflowX_390: false,
    kanbanScroller: 'scrollbar-thin scroll-fade-x … snap-x → scrollWidth 1864 / clientWidth 1152, overflow-x:auto',
    h1_1440: '24px/600',
    h1_390: '20px/600',
    distinctColors_1440: 19,
    distinctColors_390: 17,
    touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Pano" 31.3x19.5 (etkileşimsiz metin)'],
    kartHover: 'rest border oklab(0.92 …/0.6) + shadow 0 1px 2px rgba(0,0,0,.04) → hover border oklch(0.92 0.004 286.3) + shadow 0 1px 3px rgba(0,0,0,.1), 0 1px 2px -1px',
    kartAnatomi: 'button tabindex=0, min-h-11, rounded-lg, border-border/60, p-2.5, başlık 13px/500, meta 11px tabular-nums',
  };
}

// -------------------------------------------- /arge/projeler/[id]/receteler
{
  const r = card.routes['/arge/projeler/[id]/receteler'];
  r.round = 9;
  r.scores = [5, 5, 5, 5, 5, 5, 5, 5, 4, 5, 5, 5];
  r.total = 59;
  r.winner = 'Stripe';
  r.scoreNotes =
    'Tur 9 (Stripe 56). c9 5→4 GERİLEME (gerekçeli): tur 8 bu route\'u DEVREDİLMİŞ bir projede (v2, editable=false) ölçmüştü — o durumda Kaydet/Onaya gönder butonları hiç render edilmiyor, dolayısıyla üst eylem şeridi taşmıyordu. Tur 9\'da göreve verilen ilk kayıtta (Fıstık Bazı, v1 · Taslak, editable=true) şerit 390px\'te scrollWidth 364 > clientWidth 344 ve sayfanın BİRİNCİL eylemi "Onaya gönder" 20px kırpılıyor; 375px\'te 35px (44px butonun yalnız 9px\'i görünür). Yeni P1: arge-recete-39. Diğer 11 kriter yeniden ölçüldü, tur 8 ile aynı: para hücreleri 8/8 tabular-nums + sağa hizalı, 1440 sayfa taşması yok, h1 24/600 (mobil 20/600), 21/18 renk, font kademeleri 11/13 ağırlıklı, hedef bandı tek vurgu rengiyle (%14 hedef üstü), boş/yükleniyor durumları (loading.tsx + EmptyState) yerinde, Button focus-visible ring 3px görsel olarak doğrulandı. Kod taraması temiz (en uzun 200ms; transition:all / ease-in / scale(0) yok). Toplam 59 ≥ 56 AMA açık P1 var → KAZANAN: Stripe (delta -1).';
  r.measures = r.measures ?? {};
  r.measures.round9 = {
    scrollWidth_1440: 1440,
    clientWidth_1440: 1440,
    overflowX_1440: false,
    scrollWidth_390: 390,
    clientWidth_390: 390,
    overflowX_390: false,
    eylemSeridi_390: { barClientWidth: 344, barScrollWidth: 364, tasmaPx: 20, onayaGonderHiddenPx: 20 },
    eylemSeridi_375: { barClientWidth: 329, barScrollWidth: 364, tasmaPx: 35, onayaGonderHiddenPx: 35 },
    eylemSeridi_diger_projeler:
      'Şekersiz Protein ve Oat Barista v2 (editable=false): 390 ve 375px\'te sw=cw, taşma 0 — kusur YALNIZ düzenlenebilir (Taslak) durumda',
    dokunmaHedefleri_390: 'Versiyon 160×44, Yeni reçete 44×44, Yeni versiyon 44×44, Kaydet 44×44, Onaya gönder 44×44 → <44px hedef YOK',
    paraHucreleri: '8/8 font-variant-numeric: tabular-nums, text-align: right (₺31,92 / ₺28,00 / ₺5,81 / ₺2,40 / ₺120,00 / ₺0,03 …)',
    h1_1440: '24px/600',
    h1_390: '20px/600',
    distinctColors_1440: 21,
    distinctColors_390: 18,
    fontSizes_1440: { '10': 2, '11': 19, '12': 8, '13': 67, '14': 7, '15': 1, '18': 1, '24': 2 },
    touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Deneme Reçeteleri" 117.4x19.5 (etkileşimsiz metin)'],
    odakHalkasi: '"Onaya gönder" focus-visible → boxShadow oklab(0.55 -0.141272 0.0751154 / 0.5) 0px 0px 0px 3px (görsel: artifacts/critic/arge-r9-focus-onaya.png)',
  };
  r.open = r.open ?? [];
  r.open.push({
    id: 'arge-recete-39',
    criterion: 9,
    severity: 'P1',
    text:
      '390px\'te düzenlenebilir (Taslak) reçetede üst eylem şeridi taşıyor ve sayfanın BİRİNCİL eylemi "Onaya gönder" görünür alanın dışında kalıyor — kullanıcı şeridi yatay kaydırmadan birincil eylemi göremiyor. Şeritteki beş kontrol (Versiyon 160 + Yeni reçete 44 + Yeni versiyon 44 + Kaydet 44 + Onaya gönder 44 + 4 boşluk) 364px, kartın iç genişliği 344px.',
    measure:
      '/arge/projeler/c2913daa-05c6-46bc-9f48-942e864a651f/receteler @390: eylem şeridi scrollWidth 364 > clientWidth 344 (taşma 20px), "Onaya gönder" right=387 > şerit right=367 → hiddenPx 20. @375: cw 329, sw 364, hiddenPx 35 (44px butonun yalnız 9px\'i görünür). Devredilmiş projelerde (Şekersiz Protein, Oat Barista v2) taşma 0 — kusur yalnız editable=true durumunda.',
    target:
      '375 ve 390px\'te eylem şeridi scrollWidth ≤ clientWidth VE "Onaya gönder" hiddenPx = 0 (ör. mobilde "Yeni deneme reçetesi" + "Yeni versiyon" ikonlarını bir taşma menüsüne al, ya da Versiyon SelectTrigger w-40 160px → w-32 128px)',
    file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx (~268: `flex flex-nowrap items-center gap-2 overflow-x-auto` şeridi; Versiyon SelectTrigger `w-40`)',
    openedRound: 9,
    lastMeasuredRound: 9,
  });
}

writeFileSync(path, JSON.stringify(card, null, 1));
console.log('güncellendi:', path);
for (const [route, v] of Object.entries<any>(card.routes)) {
  console.log(route, '| total', v.total, '| winner', v.winner, '| open', (v.open ?? []).length);
}
