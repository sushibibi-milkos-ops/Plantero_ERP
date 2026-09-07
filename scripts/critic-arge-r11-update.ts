/** Tur 11 kritik puan kartı güncellemesi — artifacts/critic/arge.json (docs/DESIGN-SCORECARD.md). */
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'artifacts/critic/arge.json';
const card = JSON.parse(readFileSync(path, 'utf8'));
const R = 11;
card.round = R;
card.updatedAt = '2026-09-07';

const R11 = card.routes;

// ---------- /arge/projeler ----------
{
  const r = R11['/arge/projeler'];
  r.round = R;
  r.scores = [5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 59;
  r.winner = 'Plantero';
  r.measures.round11 = {
    scrollWidth_1440: 1440, clientWidth_1440: 1440, overflowX_1440: false,
    scrollWidth_390: 390, clientWidth_390: 390, overflowX_390: false,
    rowHeights_1440: [36, 36, 36], rowHeights_390: [63.5, 63.5, 63.5],
    h1_1440: '24px/600', h1_390: '20px/600',
    fontSizes_1440: { '10': 2, '11': 8, '12': 11, '13': 32, '14': 3, '15': 1, '18': 1, '24': 1 },
    distinctColors_1440: 17, distinctColors_390: 16,
    firstRowTop_viewport: 238, firstRowTop_mainOffset: 190, theadTop_mainOffset: 154, h1Top_mainOffset: 24,
    firstCardTop_390_viewport: 306, firstCardTop_390_mainOffset: 258, mobileCardH: 64,
    touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Projeler" 47.8x19.5 (etkileşimsiz metin)'],
    rowRest: 'rgba(0,0,0,0)', rowHover: 'oklab(0.955 … / 0.5) = accent/50',
    rowKeyboardFocus: 'outline 2px solid oklch(0.55 0.16 152), offset -2px, transform none',
    money: '3/3 tabular-nums + sağa hizalı; ₺31,92 ve ₺103,41 warning (hedef üstü), ₺166,17 foreground; hiçbirinde title/aria yok',
    emptyState: 'arama "zzzqqq" → ikon + "Eşleşen kayıt yok" + "Arama ya da filtreleri değiştirmeyi deneyin." (tek görünür kopya)',
  };
  r.scoreNotes =
    'Tur 11. Açık bulgu arge-projeler-08 (c2, P2) yeniden ölçüldü: ilk tablo satırı viewport 238px / <main> ofseti 190px — dokuz turdur (4-11) birebir aynı; 390px ölçümü EKLENDİ: ilk kart 306px (viewport %36) → AÇIK KALIYOR (c2=4). Diğer 11 kriter yeniden ölçüldü ve tur 10 ile aynı: satır 36px×3, 1440/390 sw=cw (taşma yok), mobil kart 64px, h1 24/600 (mobil 20/600), 17/16 renk, para 3/3 tabular-nums + sağa hizalı, satır hover accent/50 ve KLAVYE focus 2px yeşil outline (bu tur Tab ile doğrulandı), boş durum ikon+başlık+ipucu. Yeni P2 (arge-projeler-09, c4): birim maliyet warning rengi ekranda çözülemiyor (kart görünümünde "/ hedef ₺28,00" var, tablo görünümünde yok) — c4 tanımı (renk yalnızca anlam taşır) ihlal edilmediği için PUAN DÜŞMEZ. Kod taraması temiz. Açık P0/P1 yok, toplam 59 ≥ 57 → KAZANAN: Plantero (delta 0).';
  const f = r.open.find((o: { id: string }) => o.id === 'arge-projeler-08');
  f.reMeasuredRound = R;
  f.lastMeasuredRound = R;
  f.measure =
    'tur 11 yeniden ölçüm: 1440px ilk tablo satırı viewport 238px / <main> ofseti 190px (h1 ofseti 24, thead 154) — tur 4-10 ile birebir aynı. 390px: ilk kart viewport 306px / <main> ofseti 258px (844px ekranın %36\'sı başlık+açıklama+tam genişlik buton+arama+filtre şeridi olarak dört ayrı banda gidiyor). Hedef ≤112px (masaüstü) / ≤176px (mobil).';
  r.open.push({
    id: 'arge-projeler-09', criterion: 4, severity: 'P2',
    text: 'Tablo görünümünde "Birim maliyet" değerleri hedef aşımında warning (turuncu) basılıyor ama ekranda hedefi gösteren hiçbir şey yok: ₺31,92 turuncu, ₺166,17 nötr — kullanıcı küçük sayının neden uyarı rengiyle basıldığını çözemiyor. Aynı modülün KART görünümü aynı olguyu "₺31,92 / hedef ₺28,00" ile açıklıyor (project-list.tsx:167-174), tablo görünümü açıklamıyor.',
    measure: 'tur 11 (1440×900): 3/3 para hücresinde title/aria-label yok; renkler ₺31,92 oklch(0.72 0.17 70)=warning, ₺166,17 oklch(0.21 …)=foreground, ₺103,41 warning. Ekranda "hedef" sözcüğü hiç geçmiyor (tablo görünümü).',
    target: 'Hedef üstü hücrelerde hedef değeri ekranda çözülebilir olsun: hücreye title/aria (ör. "Hedef ₺28,00 · %14 üstü") ya da kart görünümündeki gibi "/ hedef ₺X" son eki → renkli 2/2 hücrede hedef bilgisi erişilebilir.',
    file: 'apps/web/src/modules/rnd/components/project-list.tsx:82-89 (tablo sütunu)',
    openedRound: R, lastMeasuredRound: R,
  });
}

// ---------- /arge/projeler/[id]/board ----------
{
  const r = R11['/arge/projeler/[id]/board'];
  r.round = R;
  r.scores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 60;
  r.winner = 'Plantero';
  r.measures = r.measures ?? {};
  r.measures.round11 = {
    scrollWidth_1440: 1440, clientWidth_1440: 1440, overflowX_1440: false,
    scrollWidth_390: 390, clientWidth_390: 390, overflowX_390: false,
    h1_1440: '24px/600', h1_390: '20px/600',
    fontSizes_1440: { '10': 2, '11': 27, '12': 1, '13': 34, '14': 9, '15': 1, '18': 1, '24': 1 },
    distinctColors_1440: 19, distinctColors_390: 17,
    touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Pano" 31.3x19.5 (etkileşimsiz metin)'],
    boardCardFocus: 'board-card.tsx:43 focus-visible:border-ring + ring-[3px] ring-ring/50 (tur 10 CDP forcePseudoState ölçümü geçerli)',
    motion: 'kolon layout spring duration 0.35/bounce 0.15 (büyük eleman, kabul); DragOverlay dropAnimation 220ms cubic-bezier(0.23,1,0.32,1); transition-all / ease-in / scale(0) YOK',
  };
  r.scoreNotes =
    'Tur 11. Açık bulgu yok; 12 kriter yeniden ölçüldü ve tur 10 ile aynı: 1440 ve 390\'da sayfa yatay taşması yok (kanban kendi kapsayıcısında kayıyor, scroll-fade-x), 390\'da <44px etkileşimli hedef yok, h1 24/600 (mobil 20/600), 19/17 renk, kart focus-visible 3px ring. Kod taraması: transition-all / ease-in / scale(0) yok, hover global @custom-variant ile (hover:hover)+(pointer:fine) altında; tek >300ms değer kolon yeniden konumlanmasındaki spring (duration 0.35, bounce 0.15) — büyük eleman için kabul edilebilir, bulgu açılmadı. Toplam 60 ≥ 57 → KAZANAN: Plantero (delta 0).';
}

// ---------- /arge/projeler/[id]/receteler ----------
{
  const r = R11['/arge/projeler/[id]/receteler'];
  r.round = R;
  r.scores = [5, 5, 5, 5, 5, 4, 5, 5, 5, 5, 5, 5];
  r.total = 59;
  r.winner = 'Plantero';
  r.measures = r.measures ?? {};
  r.measures.round11 = {
    scrollWidth_1440: 1440, clientWidth_1440: 1440, overflowX_1440: false,
    scrollWidth_390: 390, clientWidth_390: 390, overflowX_390: false,
    h1_1440: '24px/600', h1_390: '20px/600',
    fontSizes_1440: { '10': 2, '11': 19, '12': 8, '13': 67, '14': 7, '15': 1, '18': 1, '24': 2 },
    distinctColors_1440: 21, distinctColors_390: 18,
    touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Deneme Reçeteleri" 117.4x19.5 (etkileşimsiz metin)'],
    rowAlign_390: '4/4 satırda |cy(B. maliyet) − cy(Kaynak)| = 0px (658/759/860/961) — arge-recete-40 BAĞIMSIZ DOĞRULANDI, kapalı kalır',
    prefixGap: '1440: manuel satır ₺→ilk rakam 42,7px, "Genel gider (parti)" 48,1px; 390: manuel satır 18,7px, "Genel gider (parti)" 108,3px (hedef ≤4px)',
    restBorders: 'satır içi 16/16 kontrol border-width 0px (rest), üstteki 5 form alanı + ürün arama 1px — tur 5 arge-recete-29 kapanışı korunuyor',
    primaryButtons: '1440\'ta eşzamanlı iki dolu-vurgu buton: "Yeni deneme reçetesi" 186×32 ve "Onaya gönder" 136×32 (ikisi de oklch(0.55 0.16 152))',
  };
  r.scoreNotes =
    'Tur 11 (Stripe 56). Tur 10\'un P1\'i arge-recete-40 (390px B. maliyet dikey hizası) BAĞIMSIZ DOĞRULANDI ve KAPALI: 4/4 satırda |Δcy| = 0px. Açık P1 kalmadı. c6 = 4 KORUNUYOR (yükseltilmedi): açık arge-recete-41 (₺ öneki ile rakam arası boşluk) bu tur yeniden ölçüldü ve BÜYÜDÜ — 390px\'te "Genel gider (parti)" alanında 108,3px, manuel satırda 18,7px; masaüstünde 42,7/48,1px (hedef ≤4px). Kök neden ortak `NumberInput` (apps/web/src/components/form/number-input.tsx:117) → shell sahipli, severity P2 (tur 10 değerlendirmesiyle tutarlı, kazanmayı engellemez). Diğer 11 kriter tur 10 ile aynı: 1440/390 sw=cw, satır kontrolleri rest\'te kenarlıksız (16/16 border 0px), para hücreleri tabular-nums, hedef bandı 24px/600 tek vurgu, boş/yükleniyor durumları yerinde. Yeni P2 (arge-recete-42, c1): aynı ekranda iki dolu-vurgu birincil buton. Kod taraması temiz (en uzun 220ms drop animasyonu; transition-all/ease-in/scale(0) yok; hover gated). Toplam 59 ≥ 56, açık P0/P1 YOK → KAZANAN: Plantero (delta 0; c6 4→4).';
  const f41 = r.open.find((o: { id: string }) => o.id === 'arge-recete-41');
  f41.lastMeasuredRound = R;
  f41.owner = 'shell';
  f41.measure =
    'tur 11 yeniden ölçüm (canvas metin genişliğiyle ilk rakamın x\'i): 1440px manuel satır ₺→"38,00" 42,7px, "Genel gider (parti)" ₺→"0,35" 48,1px; 390px manuel satır 18,7px, "Genel gider (parti)" 108,3px. Aynı sütundaki salt-okunur MoneyCell\'lerde ₺ rakama bitişik (₺120,00). Hedef ≤4px.';
  r.open.push({
    id: 'arge-recete-42', criterion: 1, severity: 'P2',
    text: 'Ekranda aynı anda iki DOLU vurgu rengi buton var: sol raydaki "Yeni deneme reçetesi" ve kart başlığındaki "Onaya gönder". Stripe/Linear bir görünümde tek birincil eylem bırakır; ikinci "yeni" eylemi ikincil (outline/ghost + artı ikonu) olur, aksi hâlde ekranın gerçek birincil eylemi (versiyonu onaya göndermek) ikinci bir yeşil blokla rekabet ediyor.',
    measure: 'tur 11 (1440×900): background oklch(0.55 0.16 152) olan görünür buton sayısı 2 — "Yeni deneme reçetesi" 186×32, "Onaya gönder" 136×32.',
    target: 'Görünümde eşzamanlı dolu-vurgu buton sayısı 1 (sol raydaki "Yeni deneme reçetesi" outline/secondary\'ye iner; "Onaya gönder" tek birincil kalır).',
    file: 'apps/web/src/modules/rnd/components/recipe-workspace.tsx (sol ray "Yeni deneme reçetesi" tetikleyicisi)',
    openedRound: R, lastMeasuredRound: R,
  });
}

// ---------- /arge/receteler ----------
{
  const r = R11['/arge/receteler'];
  r.round = R;
  r.scores = [5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 59;
  r.winner = 'Plantero';
  r.measures = r.measures ?? {};
  r.measures.round11 = {
    scrollWidth_1440: 1440, clientWidth_1440: 1440, overflowX_1440: false,
    scrollWidth_390: 390, clientWidth_390: 390, overflowX_390: false,
    rowHeights_1440: [36, 36, 36], rowHeights_390: [63.5, 63.5, 63.5],
    h1_1440: '24px/600', h1_390: '20px/600',
    fontSizes_1440: { '10': 2, '11': 5, '12': 9, '13': 37, '14': 1, '15': 1, '18': 1, '24': 1 },
    distinctColors_1440: 21, distinctColors_390: 20,
    firstRowTop_viewport: 208, firstRowTop_mainOffset: 160, theadTop_mainOffset: 124, h1Top_mainOffset: 24,
    firstCardTop_390_viewport: 220, firstCardTop_390_mainOffset: 172, mobileCardH: 64,
    touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Deneme Reçeteleri" 117.4x19.5 (etkileşimsiz metin)'],
    money: '3/3 tabular-nums + sağa hizalı; renk kodlaması /arge/projeler ile BİREBİR aynı (hedef üstü → warning)',
    emptyState: 'arama "zzzqqq" → ikon + "Eşleşen kayıt yok" + ipucu (tek görünür kopya)',
  };
  r.scoreNotes =
    'Tur 11. Açık bulgu arge-receteler-02 (c2, P2) yeniden ölçüldü: ilk tablo satırı viewport 208px / <main> ofseti 160px (tur 5-11 aynı; hedef ≤112px), 390px ilk kart 220px → AÇIK KALIYOR (c2=4). Diğer 11 kriter tur 10 ile aynı: satır 36px×3, mobil kart 64px, 1440/390 sw=cw, h1 24/600 (mobil 20/600), 21/20 renk, para tabular-nums + sağa hizalı, boş durum özenli. Yeni P2 (arge-receteler-04, c4): /arge/projeler ile aynı çözülemeyen hedef-üstü renk kodlaması (kardeş bulgu arge-projeler-09) — c4 tanımı ihlal edilmediğinden puan düşmez. Kod taraması temiz. Açık P0/P1 yok, toplam 59 ≥ 57 → KAZANAN: Plantero (delta 0).';
  const f = r.open.find((o: { id: string }) => o.id === 'arge-receteler-02');
  f.reMeasuredRound = R;
  f.lastMeasuredRound = R;
  f.measure =
    'tur 11 yeniden ölçüm: 1440px ilk tablo satırı viewport 208px / <main> ofseti 160px (h1 ofseti 24, thead 124) — tur 5-10 ile aynı. 390px: ilk kart viewport 220px / <main> ofseti 172px. Hedef ≤112px (masaüstü). Kök neden değişmedi: PageHeader başlığı ile DataTable araç çubuğu iki ayrı yatay şerit (shell kompozisyonu).';
  r.open.push({
    id: 'arge-receteler-04', criterion: 4, severity: 'P2',
    text: 'Kardeş bulgu arge-projeler-09 ile aynı: "Birim maliyet" hedef aşımında warning basılıyor, ama ekranda hedef değeri yok — ₺103,41 ve ₺31,92 turuncu, ₺166,17 nötr; kullanıcı kuralı ekrandan çözemiyor.',
    measure: 'tur 11 (1440×900): 3/3 para hücresinde title/aria yok; 2/3 hücre warning renginde; ekranda "hedef" bilgisi yok.',
    target: 'Hedef üstü hücreler hedefi ekranda erişilebilir kılsın (title/aria "Hedef ₺X · %Y üstü" ya da "/ hedef ₺X" son eki) → renkli 2/2 hücrede hedef okunabilir.',
    file: 'apps/web/src/modules/rnd/components/all-recipes-table.tsx:34-45',
    openedRound: R, lastMeasuredRound: R,
  });
}

card.sharedComponentRequests = [
  {
    id: 'shell-numberinput-prefix-01', from: 'arge-recete-41', criterion: 6, severity: 'P2',
    file: 'apps/web/src/components/form/number-input.tsx:117',
    text: 'Para öneki `absolute left-2.5`, değer `text-right` → önek ile ilk rakam arasındaki boşluk alan genişliğine ve basamak sayısına göre 18-108px arasında değişiyor; aynı sütundaki salt-okunur MoneyCell\'lerde ₺ rakama bitişik. Uygulama genelinde prefix\'li tüm NumberInput\'ları etkiler.',
    measure: '/arge/projeler/[id]/receteler — 1440: 42,7px ve 48,1px; 390: 18,7px ve 108,3px',
    target: 'Önek değerle birlikte tek sağa yaslı metin bloğu (ör. inline prefix) → ₺ ile ilk rakam arası ≤4px, tüm viewportlarda',
  },
  {
    id: 'shell-pageheader-toolbar-01', from: 'arge-projeler-08 + arge-receteler-02', criterion: 2, severity: 'P2',
    file: 'apps/web/src/components/page-header.tsx + apps/web/src/components/data-table',
    text: 'PageHeader başlık bloğu ile DataTable araç çubuğu iki ayrı yatay şerit olarak istifleniyor; Linear başlık + kayıt sayısı + filtre + görünüm seçiciyi tek satırda tutar.',
    measure: '/arge/projeler 1440: ilk satır <main> ofseti 190px, 390: 258px · /arge/receteler 1440: 160px, 390: 172px',
    target: 'Masaüstünde ilk satır <main> ofseti ≤112px (başlık + sayaç + filtre tek şerit)',
  },
];

writeFileSync(path, JSON.stringify(card, null, 1) + '\n');
console.log('yazıldı:', path, '— tur', R);
