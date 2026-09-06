/** Tur 6 kritik puan kartı güncellemesi (docs/DESIGN-SCORECARD.md) — yalnızca artifacts/critic/arge.json yazar. */
import { readFileSync, writeFileSync } from 'node:fs';
const p = 'artifacts/critic/arge.json';
const d = JSON.parse(readFileSync(p, 'utf8'));
d.round = 6;
d.updatedAt = '2026-09-06';
const R = d.routes;

// ---- /arge/projeler ----
{
  const r = R['/arge/projeler'];
  r.round = 6;
  r.scores = [5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 59;
  r.winner = 'Plantero';
  r.scoreNotes = 'Tur 6. Tek açık bulgu (arge-projeler-08, c2, P2) yeniden ölçüldü: ilk satır viewport 238px / <main> ofseti 190px — dört turdur değişmemiş, AÇIK KALIYOR (c2=4). Diğer 11 kriter yeniden ölçüldü: satır 36px×3, taşma yok (1440 ve 390 scrollWidth=clientWidth), 390px\'te <44px ETKİLEŞİMLİ hedef yok (yalnız breadcrumb metni), mobil kart 63,5px, h1 24/600 (mobil 20/600), 17 farklı renk, tablo başlığı ile değer sağ kenarları birebir (₺31,92 / th "Birim maliyet" ikisi de 1176px). Kod taraması temiz: transition:all / ease-in / >300ms / scale(0) yok. Açık P0/P1 yok, toplam 59 ≥ 57 → KAZANAN: Plantero (delta 0).';
  r.measures.round6 = {
    scrollWidth_1440: 1440, clientWidth_1440: 1440, overflowX_1440: false,
    scrollWidth_390: 390, clientWidth_390: 390, overflowX_390: false,
    rowHeights_1440: [36, 36, 36], rowHeights_390: [63.5, 63.5, 63.5],
    h1_1440: '24px/600', h1_390: '20px/600',
    fontSizes_1440: { '10': 2, '11': 8, '12': 11, '13': 32, '14': 3, '15': 1, '18': 1, '24': 1 },
    distinctColors_1440: 17, distinctColors_390: 16,
    firstRowTop_viewport: 238, firstRowTop_mainOffset: 190,
    theadValueRightAlign: 'th "Birim maliyet" 1176 = td ₺31,92 1176 (±0px)',
    touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Projeler" 47.8x19.5 (etkileşimsiz metin)'],
  };
  r.open[0].reMeasuredRound = 6;
  r.open[0].lastMeasuredRound = 6;
  r.open[0].measure = 'tur 6 yeniden ölçüm: ilk tablo satırı viewport 238px / <main> ofseti 190px (tur 4 ve 5 ile aynı). Hedef ≤112px. Kök neden: PageHeader başlık bloğu ile DataTable araç çubuğu (arama+Durum+sayaç+görünüm seçici) iki ayrı yatay şerit; tek satırda birleşmeleri shell (PageHeader/DataTable kompozisyonu) değişikliği ister.';
}

// ---- /arge/receteler ----
{
  const r = R['/arge/receteler'];
  r.round = 6;
  r.scores = [5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 4, 5];
  r.total = 58;
  r.winner = 'Plantero';
  r.scoreNotes = 'Tur 6. Tek açık bulgu (arge-receteler-02, c2, P2) yeniden ölçüldü: ilk satır viewport 208px / <main> ofseti 160px — tur 5 ile aynı, AÇIK KALIYOR (c2=4). c11=4 korunuyor (gerekçe değişmedi): "birim maliyet hedefin üstünde" olgusu /arge/projeler tablosunda warning turuncusuyla basılırken bu tabloda 3/3 satır nötr foreground — aynı olgu iki ekranda iki dilde. Diğer kriterler yeniden ölçüldü: satır 36px×3, mobil kart 63,5px, taşma yok, h1 24/600 (mobil 20/600), 390px\'te <44px etkileşimli hedef yok, th/td sağ kenarları birebir (1171,3). Mobil kart meta ayracının sol boşluğunun çökmesi ("Şekersiz Protein· v1", ölçüm: subtitle kutusu right 118,8 = meta kutusu left 118,8, gap 0px) ORTAK BİLEŞEN kaynaklı → shell.json (shell-mobile-card-meta-gap-01, P2); bu modülde tekrar açılmadı. Açık P0/P1 yok, toplam 58 ≥ 57 → KAZANAN: Plantero (delta 0).';
  r.measures.round6 = {
    scrollWidth_1440: 1440, clientWidth_1440: 1440, overflowX_1440: false,
    scrollWidth_390: 390, clientWidth_390: 390, overflowX_390: false,
    rowHeights_1440: [36, 36, 36], rowHeights_390: [63.5, 63.5, 63.5],
    h1_1440: '24px/600', h1_390: '20px/600',
    fontSizes_1440: { '10': 2, '11': 5, '12': 9, '13': 37, '14': 1, '15': 1, '18': 1, '24': 1 },
    distinctColors_1440: 21, distinctColors_390: 20,
    firstRowTop_viewport: 208, firstRowTop_mainOffset: 160,
    theadValueRightAlign: 'th "Birim maliyet" 1171,3 = td ₺166,17 1171,3 (±0px)',
    birimMaliyetRenkleri: '3/3 satır foreground (renksiz) — /arge/projeler aynı değerleri warning ile basıyor (c11=4 gerekçesi)',
    mobilKartAyraci_390: 'subtitle kutusu right 118,8 / meta kutusu left 118,8 → gap 0px, ekranda "Şekersiz Protein· v1" (shell)',
    touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Deneme Reçeteleri" 117.4x19.5 (etkileşimsiz metin)'],
  };
  r.open[0].reMeasuredRound = 6;
  r.open[0].lastMeasuredRound = 6;
  r.open[0].measure = 'tur 6 yeniden ölçüm: ilk tablo satırı viewport 208px / <main> ofseti 160px (tur 5 ile aynı; hedef ≤112px). Kalan bütçe PageHeader başlığı + DataTable araç çubuğunun iki ayrı şerit olmasından geliyor (shell).';
}

// ---- /arge/projeler/[id]/board ----
{
  const r = R['/arge/projeler/[id]/board'];
  r.round = 6;
  r.scores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 60;
  r.winner = 'Plantero';
  r.scoreNotes = 'Tur 6. c9: 4→5 — tur 5\'te açık kalan arge-board-15 (Pano sekmesi 31,3px genişlik) builder tarafından kapatıldı ve ölçümle doğrulandı: project-nav-tabs.tsx px-2 md:px-0.5 ile sekme 47,3×44 oldu; pnpm measure 390x844 touchTargetsBelow44 listesinde artık YALNIZCA etkileşimsiz breadcrumb metni var (31,3×19,5). Diğer kriterler yeniden ölçüldü: taşma yok (1440/390 scrollWidth=clientWidth), kanban kolon şeridi scrollWidth 1864 / clientWidth 1152 (yatay kaydırma kanban\'ın kendi ekseni, scroll-fade-x affordansı var), kolon genişliği ~310px (390px\'te tek kolon tam sığıyor), h1 24/600 (mobil 20/600), 18 renk, mount\'ta boş ilk kolonun atlanması (scrollLeft 268) kasıtlı ve yorumlanmış (arge-board-12 düzeltmesi). Motion temiz: layout spring .35/bounce .15, transition-colors 150ms, transition-[transform,box-shadow,opacity] 150ms ease-out — transition:all / ease-in / >300ms / scale(0) yok. Açık P0/P1 yok, toplam 60 ≥ 57 → KAZANAN: Plantero (delta +1).';
  r.measures = r.measures ?? {};
  r.measures.round6 = {
    scrollWidth_1440: 1440, clientWidth_1440: 1440, overflowX_1440: false,
    scrollWidth_390: 390, clientWidth_390: 390, overflowX_390: false,
    h1_1440: '24px/600', h1_390: '20px/600',
    fontSizes_1440: { '10': 2, '11': 25, '12': 1, '13': 35, '14': 9, '15': 1, '18': 1, '24': 1 },
    distinctColors_1440: 18, distinctColors_390: 16,
    kanbanScroller: { scrollWidth: 1864, clientWidth_1440: 1152, clientWidth_390: 358, scrollLeftOnMount: 268 },
    panoSekmesi_390: '47,3×44 (tur 5: 31,3×44)',
    touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Pano" 31.3x19.5 (etkileşimsiz metin)'],
  };
}

// ---- /arge/projeler/[id]/receteler ----
{
  const r = R['/arge/projeler/[id]/receteler'];
  r.round = 6;
  r.scores = [5, 5, 4, 5, 4, 4, 5, 5, 4, 5, 5, 4];
  r.total = 55;
  r.winner = 'Stripe';
  r.scoreNotes = 'Tur 6 (Stripe 56). Builder\'ın tur-5 kapanışları ÖLÇÜMLE DOĞRULANDI: (18) hedef paneli üst kenarı 390px v1 taslakta 275px ≤280 ✓ (v2 devredilmiş versiyonda 340px, aradaki fark bilgilendirici "BOM\'a devredildi" bandı — meşru içerik); (25) tüm para değerleri Inter/tabular-nums, font-mono kalmadı, mobil sağ kenarlar eşit ✓; (26) hedef bandı metriği 24px/600, <main> kademeleri 11/12/13/14/24 (14px yalnız dondurulmuş Button/Input text-sm) ✓ → c1 4→5; (28) native <select> sayısı 0 ✓; (30) th METNİ ile değer metni sağ kenarı BİREBİR (1122 / 1346 / 1226 — tur 5\'te ölçüm cell-box üzerinden yapılıp 4px sanılmıştı) ✓ → c11 4→5. AMA yeni ölçümler üç kriteri düşürüyor/tutuyor: c5 5→4 (sayfanın VARSAYILAN açılışı olan salt-okunur v2 görünümünde ürün adı sarıyor → satır yükseklikleri 39/46/39/46/39/38, 7px oynama; düzenlenebilir v1 görünümünde 39/39/39/39/39/38); c6 4 (Miktar sütununda birim kodu sayının SAĞINDA akışta → sayı sağ kenarı KG satırlarında 814,8px, ADET satırlarında 800,8px, 14px tırtık); c12 4 (dinlenmede kart içindeki GÖRÜNÜR yuvarlak dikdörtgen sayısı 19 (390: 20) — 12\'si tablo hücre kontrolü: tur 5\'te border kaldırıldı ama shadow-xs = rgba(0,0,0,.05) 0 1px 2px duruyor, yani kutu hâlâ çiziliyor; border-width tabanlı eski ölçüm bunu göremiyordu); c3 4 ve c9 4 (kart üstü krom 329px, mobil malzeme kartı 129px/104,5px — referans bandı 56–72). Toplam 55 < 56 → KAZANAN: Stripe. DESIGN-SCORECARD §7 gereği 4 puanlı BEŞ kriterin (c3, c5, c6, c9, c12) her biri için ölçülebilir bulgu açıldı; beşi de kapanırsa toplam 60 ≥ 56.';
  r.measures = r.measures ?? {};
  r.measures.round6 = {
    scrollWidth_1440: 1440, clientWidth_1440: 1440, overflowX_1440: false,
    scrollWidth_390: 390, clientWidth_390: 390, overflowX_390: false,
    h1_1440: '24px/600', h1_390: '20px/600',
    fontSizes_main_1440_v2: { '11': 22, '12': 8, '13': 34, '14': 2, '24': 2 },
    fontSizes_main_390_v2: { '11': 45, '12': 2, '13': 31, '14': 2, '20': 1, '24': 1 },
    distinctColors_1440: 22, distinctColors_390: 20,
    rowHeights_1440_v2_saltOkunur: [39, 46, 39, 46, 39, 38],
    rowHeights_1440_v1_duzenlenebilir: [39, 39, 39, 39, 39, 38],
    rowHeights_390_v2_saltOkunur: [104.5, 104.5, 104.5, 104.5, 104.5, 103.5],
    rowHeights_390_v1_duzenlenebilir: [129, 129, 129, 129, 129, 128],
    thTextRight_vs_valueRight: { 'Birim maliyet': '1122 / 1122', 'Fire %': '1226 / 1226', 'Satır maliyeti': '1346 / 1346' },
    miktarSayiSagKenari: { KG_satirlari: 814.8, ADET_satirlari: 800.8, fark: 14 },
    heroMetrik: '₺103,41 Inter 24px/600 tabular-nums (hedef etiketi 11px, hedef değeri 12px/500 muted)',
    paraTipografisi: 'tümü Inter + tabular-nums (font-mono kalmadı); 13px gövde, 13px/600 özet toplamı, 24px/600 hero',
    nativeSelects_main: 0,
    dinlenmeDikdortgenleri: { '1440': { toplam: 19, yalnizKenarlik: 3, yalnizGolge: 12, ikisi: 4 }, '390': { toplam: 20, yalnizKenarlik: 2, yalnizGolge: 12, ikisi: 6 } },
    kartUstuKrom_1440: 'kart üst kenarı 313px → ilk malzeme satırı 642px = 329px (banner 38 + hedef bandı 130 + fark satırı + 4 parti alanı 32px + başlık şeridi 35)',
    tableTop_1440: 606,
    docScrollH: { '1440_v2': 1044, '390_v2': 1528, '1440_v1': 1072, '390_v1': 1676 },
    hedefPaneliUst_390: { v1_taslak: 275, v2_devredilmis: 340 },
    touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Deneme Reçeteleri" 117.4x19.5 (etkileşimsiz metin)'],
    saltOkunurDisabledKontroller: '15 disabled <input> (opacity .5, cursor not-allowed) — devredilmiş versiyonda simülasyon kapalı; disabled durumu görsel olarak ayırt edilebiliyor (c8 düşürülmedi)',
  };
  r.open = [
    {
      id: 'arge-recete-31', criterion: 6, severity: 'P1',
      text: 'Miktar sütununda birim kodu (KG/ADET) sayının SAĞINDA aynı akışta duruyor; kod uzunluğu değiştikçe sayının sağ kenarı kayıyor. KG satırlarında sayı sağ kenarı 814,8px, ADET satırlarında 800,8px → sağa hizalı sayı sütununda 14px tırtık. Aynı sorun salt-okunur v2 görünümünde de var (0,2000 KG / 1,0000 ADET).',
      measure: '1440px: Miktar input sağ kenarı KG satırları 814,8 / ADET satırları 800,8 (fark 14px). 390px: 113,6 / 99,6 (fark 14px).',
      target: 'Birim kodu sabit genişlikli kendi hücresinde (ör. w-10, sola yaslı); Miktar sütunundaki TÜM sayıların sağ kenarı ±1px içinde (tek x).',
      file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx (Miktar hücresi ızgara şablonu / birim kodu span\'ı)',
      openedRound: 6,
    },
    {
      id: 'arge-recete-32', criterion: 5, severity: 'P1',
      text: 'Sayfanın VARSAYILAN açılışı olan salt-okunur (devredilmiş v2) görünümünde ürün adı + SKU 172px\'lik "Ürün" sütununa sığmayıp iki satıra sarıyor: satır yükseklikleri 39/46/39/46/39/38 — aynı tabloda %18 oynama. Düzenlenebilir v1 görünümünde combobox truncate ettiği için satırlar eşit (39). Linear/Stripe tablolarında satır ritmi sabittir.',
      measure: '1440px salt-okunur v2: [39, 46, 39, 46, 39, 38] (sapan satırlar "Hurma Şurubu" ve "Kavanoz 500ml"); düzenlenebilir v1: [39, 39, 39, 39, 39, 38].',
      target: 'Salt-okunur satırda ürün adı tek satır (truncate + title); tablodaki tüm satır yükseklikleri ±1px içinde ve ≤40px.',
      file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx (salt-okunur ürün hücresi)',
      openedRound: 6,
    },
    {
      id: 'arge-recete-33', criterion: 12, severity: 'P1',
      text: 'Tur 5\'te "hücre kontrolleri dinlenmede kenarlıksız" düzeltmesi border-width\'i sıfırladı ama `shadow-xs` (rgba(0,0,0,.05) 0 1px 2px) duruyor — saydam zeminli kontrolde bu gölge EKRANDA yuvarlak bir kutu çiziyor. Dinlenmede kart içinde görünür (kenarlık VEYA saydam olmayan gölge) dikdörtgen sayısı 19 (390px: 20); 12\'si Miktar/Fire % hücre kontrolü. Kenarlık tabanlı eski ölçüm (8/9) bu kutuları saymıyordu.',
      measure: '1440px maliyet kartı içinde >20×16px ve (border-width>0 VEYA box-shadow saydam değil): toplam 19 (3 yalnız kenarlık + 12 yalnız gölge + 4 ikisi). 390px: 20 (2 + 12 + 6).',
      target: 'Tablo hücre kontrolleri dinlenmede `shadow-none` + kenarlıksız (affordans yalnız hover/focus-within); aynı ölçümle kart içindeki görünür dikdörtgen sayısı ≤10 (1440 ve 390).',
      file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx (hücre Input/NumberInput/Select sınıfları — shadow-xs ezilmeli)',
      openedRound: 6,
    },
    {
      id: 'arge-recete-34', criterion: 3, severity: 'P1',
      text: 'Yoğunluk: 1440×900\'de ilk malzeme satırı 642px\'te başlıyor — kartın üst kenarı (313px) ile ilk satır arasında 329px krom var (bilgi bandı 38px + hedef maliyet bandı 130px + fark satırı + 4 adet 32px parti alanı + 35px başlık şeridi). 900px\'lik ekranda 6 malzemenin ancak 4\'ü görünüyor; ekranın %71\'i tablo ÖNCESİ içeriğe gidiyor.',
      measure: '1440x900: kart üstü 313px, ilk malzeme satırı üstü 642px (arada 329px), tablo başlığı 606px; ilk ekranda görünen malzeme satırı 4/6; docScrollHeight 1044.',
      target: 'Kart üstü ile ilk malzeme satırı arası ≤220px (parti parametreleri tek 32px şeride, hedef bandı ≤96px) → 1440×900\'de 6/6 malzeme satırı ilk ekranda; satır yüksekliği 36–40px bandında.',
      file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx (hedef bandı + parti parametreleri bloğu)',
      openedRound: 6,
    },
    {
      id: 'arge-recete-35', criterion: 9, severity: 'P1',
      text: 'Mobilde malzeme kartı hâlâ referans bandının çok üstünde: düzenlenebilir v1\'de 129px, salt-okunur v2\'de 104,5px (referans mobil kart 56–72px). 6 malzemelik bir reçetede yalnız satırlar 627–774px; doc yüksekliği 1528px (v2) / 1676px (v1). Tur 5\'te kabul edilen ≤130px ara hedefti, 5 puanlık çıta değil.',
      measure: '390x844 malzeme kartı yükseklikleri: salt-okunur v2 [104.5×5, 103.5], düzenlenebilir v1 [129×5, 128]; docScrollHeight 1528 (v2) / 1676 (v1).',
      target: 'Salt-okunur mobil kart ≤72px (tek satır: ürün adı + miktar·birim + satır maliyeti; birim maliyet/fire/kaynak ikincil satıra ya da genişletilebilir detaya); düzenlenebilir kart ≤104px. docScrollHeight (v2, 6 malzeme) ≤1200px.',
      file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx (mobil satır ızgarası)',
      openedRound: 6,
    },
  ];
}
writeFileSync(p, JSON.stringify(d, null, 1) + '\n');
console.log('arge.json tur 6 güncellendi');
