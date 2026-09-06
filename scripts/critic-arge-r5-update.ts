import { readFileSync, writeFileSync } from 'node:fs';
const p = '/home/user/Plantero_ERP/artifacts/critic/arge.json';
const c = JSON.parse(readFileSync(p, 'utf8'));
c.round = 5;
c.updatedAt = '2026-09-06';

const R = c.routes as Record<string, any>;

// ---------------- /arge/projeler ----------------
{
  const r = R['/arge/projeler'];
  r.round = 5;
  r.scores = [5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 59;
  r.winner = 'Plantero';
  r.open = [
    {
      ...r.open[0],
      measure: 'tur 5: tbody ilk satır viewport top 238px / <main> ofseti 190px — tur 3 ve 4 ile birebir aynı (238/190), iyileşme yok',
      lastMeasuredRound: 5,
    },
  ];
  r.measures = {
    ...r.measures,
    round5: {
      scrollWidth_1440: 1440, clientWidth_1440: 1440, overflowX_1440: false,
      scrollWidth_390: 390, clientWidth_390: 390, overflowX_390: false,
      rowHeights_1440: [36, 36, 36], rowHeights_390: [63.5, 63.5, 63.5],
      h1_1440: '24px/600', h1_390: '20px/600',
      fontSizes_1440: { '10': 2, '11': 8, '12': 11, '13': 32, '14': 3, '15': 1, '18': 1, '24': 1 },
      distinctColors_1440: 17, distinctColors_390: 16,
      touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Projeler" 47.8x19.5 (etkileşimsiz metin)'],
      firstRowTop_viewport: 238, firstRowTop_mainOffset: 190,
    },
  };
  r.scoreNotes = 'Tur 5. Tek açık bulgu (arge-projeler-08, c2, P2) yeniden ölçüldü: 238/190px — üç turdur değişmemiş, AÇIK KALIYOR. Diğer 11 kriter yeniden ölçüldü ve doğrulandı: satır 36px×3, taşma yok (scrollWidth=clientWidth 1440 ve 390), 390px\'te <44px etkileşimli hedef YOK, mobil kart 63,5px, h1 24/600 (mobil 20/600), 17 farklı renk (yeşil vurgu + hedef-üstü warning + nötr). Açık P0/P1 yok, toplam 59 ≥ 57 → KAZANAN: Plantero (delta 0).';
}

// ---------------- /arge/receteler ----------------
{
  const r = R['/arge/receteler'];
  r.round = 5;
  r.scores = [5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 4, 5];
  r.total = 58;
  r.winner = 'Plantero';
  r.open = [
    {
      ...r.open[0],
      measure: 'tur 5: ilk satır <main> ofseti 184px, viewport top 232px — tur 3 ve 4 ile aynı, iyileşme yok',
      lastMeasuredRound: 5,
    },
  ];
  r.measures = {
    ...r.measures,
    round5: {
      scrollWidth_1440: 1440, clientWidth_1440: 1440, overflowX_1440: false,
      scrollWidth_390: 390, clientWidth_390: 390, overflowX_390: false,
      rowHeights_1440: [36, 36, 36], rowHeights_390: [63.5, 63.5, 63.5],
      h1_1440: '24px/600', h1_390: '20px/600',
      fontSizes_1440: { '10': 2, '11': 5, '12': 9, '13': 37, '14': 2, '15': 1, '18': 1, '24': 1 },
      distinctColors_1440: 21, distinctColors_390: 20,
      touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Deneme Reçeteleri" 117.4x19.5 (etkileşimsiz metin)'],
      firstRowTop_viewport: 232, firstRowTop_mainOffset: 184,
      c11_gerekce: 'Birim maliyet sütunu bu listede foreground (renksiz); /arge/projeler listesinde AYNI kayıtlar (₺31,92 · ₺103,41) warning tonunda. Hedef bilgisi bu listede yok, bu yüzden savunulabilir ama modül içi renk anlamı iki listede farklı.',
    },
  };
  r.scoreNotes = 'Tur 5. Tek açık bulgu (arge-receteler-02, c2, P2) yeniden ölçüldü: 232/184px — değişmemiş, AÇIK KALIYOR. Diğer kriterler yeniden ölçüldü: satır 36px, mobil kart 63,5px, taşma yok, h1 24/600, 390px\'te <44px etkileşimli hedef yok. c11=4 korunuyor (gerekçe measures.round5.c11_gerekce: birim maliyet renk anlamı /arge/projeler ile ayrışıyor) — kazanmayı engellemiyor. Açık P0/P1 yok, toplam 58 ≥ 57 → KAZANAN: Plantero (delta 0).';
}

// ---------------- /arge/projeler/[id]/board ----------------
{
  const r = R['/arge/projeler/[id]/board'];
  r.round = 5;
  r.scores = [5, 5, 5, 5, 5, 5, 5, 5, 4, 5, 5, 5];
  r.total = 59;
  r.winner = 'Plantero';
  r.open = [
    {
      ...r.open[0],
      measure: 'tur 5: 390x844 → a "Pano" 31.3×44 (yükseklik 44 doğru, genişlik 31.3). Aynı sekme /receteler rotasında da 31.3×44. Kardeş sekme "Deneme Reçeteleri" 117.4×44.',
      lastMeasuredRound: 5,
    },
  ];
  r.measures = {
    ...r.measures,
    round5: {
      scrollWidth_1440: 1440, clientWidth_1440: 1440, overflowX_1440: false,
      scrollWidth_390: 390, clientWidth_390: 390, overflowX_390: false,
      h1_1440: '24px/600', h1_390: '20px/600',
      fontSizes_1440: { '10': 2, '11': 27, '12': 1, '13': 34, '14': 9, '15': 1, '18': 1, '24': 1 },
      distinctColors_1440: 19, distinctColors_390: 17,
      touchTargetsBelow44_390: ['a "Pano" 31.3×44 (genişlik)', 'span[data-slot=breadcrumb-page] "Pano" (etkileşimsiz)'],
      kanbanKolonGenisligi: 256,
      motion: 'kanban-board.tsx: layout spring duration .35 bounce .15, DragOverlay 220ms cubic-bezier(.23,1,.32,1), transition-colors 150ms — 300ms üstü CSS geçişi yok, transition:all yok, ease-in yok, scale(0) yok',
    },
  };
  r.scoreNotes = 'Tur 5. Tek açık bulgu (arge-board-15, c9, P2) yeniden ölçüldü: "Pano" sekmesi hâlâ 31.3px geniş → AÇIK KALIYOR, c9=4 korunuyor. Diğer kriterler yeniden doğrulandı: taşma yok (1440 ve 390), kanban kolonları 256px, h1 24/600, motion disiplini temiz (spring .35/bounce .15, DragOverlay 220ms, transition-colors 150ms; transition:all / ease-in / scale(0) / >300ms CSS yok). Açık P0/P1 yok, toplam 59 ≥ 57 → KAZANAN: Plantero (delta 0).';
}

// ---------------- /arge/projeler/[id]/receteler ----------------
{
  const r = R['/arge/projeler/[id]/receteler'];
  r.round = 5;
  r.scores = [4, 5, 4, 5, 5, 4, 5, 5, 4, 5, 4, 4];
  r.total = 54;
  r.winner = 'Stripe';
  const keep18 = {
    ...r.open[0],
    severity: 'P1',
    measure: 'tur 5: "Hedef maliyete göre" panelinin üst kenarı 390x844\'te 329px (viewport) / 281px (<main> ofseti) — tur 4\'te 313px ölçülmüştü, 16px GERİLEME. Araç çubuğu kartı 248px\'te başlıyor.',
    lastMeasuredRound: 5,
  };
  r.open = [
    keep18,
    {
      id: 'arge-recete-25', criterion: 6, severity: 'P1', openedRound: 5,
      text: 'Tek ekranda para için İKİ tipografi: hedef bandındaki ₺31,92 / ₺28,00 JetBrains Mono 11px/500, tablodaki ve özetteki tüm para değerleri Inter (13px/400, özet 15px/600). AYNI değer (₺31,92) ekranda iki farklı yazı tipi ve iki farklı boyutla iki kez görünüyor. Ayrıca 390px\'te mobil malzeme kartında birim maliyet değerleri sağa hizalı değil (etiketin peşine takılıyor): ₺120,00 sağ kenar 163px, ₺15,00 ve ₺22,00 155px → 8px tırtıklı sütun. Üçüncü olarak "Parti miktarı" alanı 0 ondalıkla ("1"), satır miktarları 4 ondalıkla ("1,0000") — aynı boyut için iki ondalık politikası.',
      measure: 'hero ₺31,92 = JetBrains Mono 11px/500; tablo ₺120,00 = Inter 13px/400; özet ₺31,92 = Inter 15px/600. 390px sağ kenarlar: 163 / 155 / 155. Parti miktarı input value "1" vs satır miktarı "1,0000".',
      target: 'Tüm para değerleri tek tipografi (MoneyCell varsayılanı, Inter tabular-nums) — font-mono sınıfı kaldırılır; 390px mobil kartta değerler sağa hizalı, aynı sütundaki tüm sağ kenarlar eşit (±0,5px); parti miktarı satır miktarlarıyla aynı ondalık politikasını kullanır.',
      file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx:335 (font-mono font-medium tabular-nums) ve mobil kart ızgarası (grid grid-cols-2 gap-x-3)',
    },
    {
      id: 'arge-recete-26', criterion: 1, severity: 'P1', openedRound: 5,
      text: 'Stripe finans referansında ana metrik büyük ve tabular; burada ekranın birincil çıktısı (birim maliyet) hiçbir yerde 15px\'i geçmiyor. Hedef bandındaki metrik 11px — kendi etiketiyle ("Hedef maliyete göre", 11px) AYNI boyut, yani metrik ile etiket arasında tipografik kademe yok. Ayrıca <main> içinde 6 boyut kademesi var (11/12/13/14/15/24); 15px yalnız 2 kez kullanılan tek-kullanımlık bir kademe.',
      measure: '<main> fontSizes 1440: {11:19, 12:7, 13:28, 14:6, 15:2, 24:1} → 6 kademe. Hedef bandı metriği 11px/500; özetteki aynı değer 15px/600. Ekrandaki en büyük sayı 15px.',
      target: 'Hedef maliyet bandının ana metriği ≥24px/600 tabular-nums, hedef değeri 12px muted etiket; 15px kademesi 13px ya da ana metriğe katlanır → <main> kademe sayısı ≤4 (11/12/13 + h1 24).',
      file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx:330-355 (hedef bandı) ve özet satırı text-[15px]',
    },
    {
      id: 'arge-recete-27', criterion: 3, severity: 'P1', openedRound: 5,
      text: '390px\'te her malzeme satırı 194,5px yüksekliğinde bir kart (4 ayrı satır: ürün+sil / miktar+birim+kaynak / birim maliyet+fire / satır maliyeti). 4 malzeme = 778px, yani 844px\'lik ekranın tamamı 4 satır veriye gidiyor. Referans mobil kart 56-72px; düzenlenebilir satır için bile bu üç katı.',
      measure: '390x844 malzeme kartı yükseklikleri: [194.5, 194.5, 194.5, 193.5]; doc scrollHeight 1726px',
      target: 'Malzeme kartı ≤130px: "Satır maliyeti" ürün adının sağına (aynı satıra) alınır ve "Fire %" miktar satırına katılır → 4 satır yerine 2 satır + 44px kontrol yüksekliği.',
      file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx (mobil satır ızgarası: grid grid-cols-2 gap-x-3 gap-y-1.5 border-b border-border/40 p-3)',
    },
    {
      id: 'arge-recete-28', criterion: 11, severity: 'P1', openedRound: 5,
      text: '390px\'te versiyon seçici NATIVE <select> (appearance: auto → tarayıcının kendi oku), hemen altındaki "Birim / KG" ise shadcn Select trigger (ChevronDown 16px). Aynı ekranda iki farklı seçici görünümü; native select ayrıca uygulamanın focus ring\'i ve hover tonunu taşımıyor.',
      measure: '390px: select[aria-label="Versiyon"] 112×44, appearance "auto", uygulamada başka hiçbir yerde native select yok; aynı ekranda [data-slot=select-trigger] "KG" 164×44 ve 4 adet Combobox trigger 262×44.',
      target: '390px\'te native <select> sayısı 0 — paylaşılan Select bileşeni kullanılır (ya da en azından appearance-none + ChevronDown ikonu + aynı focus-visible ring); measure çıktısında main içinde select elemanı kalmayacak.',
      file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx:246-262',
    },
    {
      id: 'arge-recete-29', criterion: 12, severity: 'P1', openedRound: 5,
      text: 'Kutu-içinde-kutu tur 4\'te çözüldü ama "çerçeve çorbası" duruyor: tek maliyet kartının içinde 26 adet dört tarafı kenarlıklı dikdörtgen var (390px\'te 27). Bunların ~20\'si malzeme tablosunun hücre kontrolleri — her satırda 5 kutu (ürün, miktar, kaynak, birim maliyet, fire). Linear/Stripe düzenlenebilir tablolarında hücre kontrolleri rest hâlinde kenarlıksızdır, kenarlık yalnız hover/focus\'ta belirir.',
      measure: '1440px: maliyet kartı içinde dört tarafı kenarlıklı ve >20×16px eleman sayısı 26 (390px: 27). Satır başına 5 kenarlıklı kontrol × 4 satır.',
      target: 'Malzeme tablosu hücre kontrolleri rest\'te border-transparent (yalnız satır altı hairline), hover/focus-within\'de border-input → kart içindeki tam kenarlıklı dikdörtgen sayısı ≤10.',
      file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx (satır tablosu hücreleri) + Input/Select/Combobox sınıf kullanımı',
    },
    {
      id: 'arge-recete-30', criterion: 5, severity: 'P2', openedRound: 5,
      text: '"Birim maliyet" sütun başlığının sağ kenarı 1118px, aynı sütundaki değerlerin sağ kenarı 1122px — 4px kayma. Sağ hizalı sayı sütununda başlık ile değer aynı optik eksende olmalı.',
      measure: '1440px: th "Birim maliyet" right=1118; değerler ₺120,00/₺15,00/₺22,00 ve manuel input right=1122 → 4px fark',
      target: 'Başlık ve değer sağ kenarları eşit (±0,5px) — başlık hücresine değer hücresiyle aynı sağ padding.',
      file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx (satır tablosu başlık hücresi)',
    },
  ];
  r.closed = [
    ...r.closed,
    { id: 'arge-recete-19', closedRound: 5, verifiedBy: 'ölçüm: <main> fontSizes 1440 içinde 16px yok ({11,12,13,14,15,24}); tablo para değerleri 13px' },
    { id: 'arge-recete-20', closedRound: 5, verifiedBy: 'ölçüm: 390px touchTargetsBelow44 listesinde Kaydet/Onaya gönder YOK (44×44); listede yalnız "Pano" sekmesi genişliği ve etkileşimsiz breadcrumb kaldı' },
    { id: 'arge-recete-21', closedRound: 5, verifiedBy: 'ölçüm: 390px malzeme satırı 321→194,5px; doc scrollHeight 2617→1726px (yeni hedef için arge-recete-27 açıldı: ≤130px)' },
    { id: 'arge-recete-22', closedRound: 5, verifiedBy: 'ölçüm: manuel input sağ kenarı 1122 = metin satırları sağ kenarı 1122 (12px kayma gitti); Fire % sıfırları muted-foreground' },
    { id: 'arge-recete-23', closedRound: 5, verifiedBy: 'ölçüm: satır tablosu başlığı 12px / text-transform none / letter-spacing normal / zeminsiz — DataTable başlığıyla birebir' },
    { id: 'arge-recete-24', closedRound: 5, verifiedBy: 'ölçüm: 1440px\'te <main> içi kenarlıklı/zeminli kapsayıcı iç içe geçme derinliği 2 (tur 4: 4)' },
  ];
  r.measures = {
    ...r.measures,
    round5: {
      scrollWidth_1440: 1440, clientWidth_1440: 1440, overflowX_1440: false,
      scrollWidth_390: 390, clientWidth_390: 390, overflowX_390: false,
      h1_1440: '24px/600', h1_390: '20px/600',
      fontSizes_main_1440: { '11': 19, '12': 7, '13': 28, '14': 6, '15': 2, '24': 1 },
      fontSizes_main_390: { '11': 36, '12': 1, '13': 27, '14': 4, '15': 1, '20': 1 },
      distinctColors_1440: 20, distinctColors_390: 18,
      malzemeSatiri_1440: [35, 39, 39, 39, 38],
      malzemeKarti_390: [194.5, 194.5, 194.5, 193.5],
      hedefPaneliUst_390: { viewport: 329, mainOffset: 281, tur4: 313 },
      hedefPaneliUst_1440: { viewport: 313, mainOffset: 265 },
      paraTipografisi: [
        { yer: 'hedef bandı ₺31,92 / ₺28,00', ff: 'JetBrains Mono', fs: '11px', fw: 500 },
        { yer: 'malzeme tablosu ₺120,00', ff: 'Inter', fs: '13px', fw: 400 },
        { yer: 'özet ₺31,92', ff: 'Inter', fs: '15px', fw: 600 },
      ],
      birimMaliyetSagKenar_1440: { baslik: 1118, degerler: 1122, manuelInput: 1122 },
      birimMaliyetSagKenar_390: { '₺120,00': 163, '₺15,00': 155, '₺22,00': 155 },
      kenarlikliDikdortgen_kartIci: { '1440': 26, '390': 27 },
      nativeSelect_390: [{ label: 'Versiyon', w: 112, h: 44, appearance: 'auto' }],
      shadcnSelect_390: [{ t: 'KG', w: 164, h: 44 }, { t: 'Badem', w: 262, h: 44 }, { t: 'Manuel', w: 107, h: 44 }],
      touchTargetsBelow44_390: ['a "Pano" 31.3×44 (genişlik — arge-board-15)', 'span[data-slot=breadcrumb-page] (etkileşimsiz)'],
      kodTaramasi: 'rnd modülünde transition:all YOK, ease-in YOK, scale(0) YOK, >300ms CSS geçişi YOK; hover globals.css @custom-variant hover ile (hover:hover) and (pointer:fine) altında',
    },
  };
  r.scoreNotes = 'Tur 5 (kritik). Builder\'ın tur-5 düzeltmeleri ÖLÇÜMLE DOĞRULANDI ve 6 bulgu kapatıldı (19, 20, 21, 22, 23, 24). Buna rağmen c1/c3/c6/c11/c12 4\'te KALIYOR — DESIGN-SCORECARD §7 gereği her biri için yeni, ölçülebilir bulgu açıldı (kapanan bulgunun kriteri 5\'e çıkmıyorsa gerekçe zorunlu): c1 → kapanan bulgu 16px MoneyCell\'di; yeni ölçümde ekranın birincil çıktısı hiçbir yerde 15px\'i geçmiyor ve hedef bandı metriği kendi etiketiyle aynı 11px (arge-recete-26). c3 → mobil satır 321→194,5px iyileşti ama referans mobil kart eşiği 56-72px, 194,5px hâlâ üç katı (arge-recete-27). c6 → hizalama düzeldi ama ekranda para için iki ayrı tipografi (JetBrains Mono 11px vs Inter 13/15px) ve 390px\'te 8px tırtıklı sağ kenar bulundu (arge-recete-25). c11 → tablo başlığı DataTable ile eşitlendi ama 390px versiyon seçicisi native <select> (appearance:auto) ve aynı ekrandaki shadcn Select ile görsel olarak farklı (arge-recete-28). c12 → kutu-içinde-kutu 4→2 çözüldü ama kart içinde 26 tam kenarlıklı dikdörtgen kaldı, 20\'si tablo hücresi (arge-recete-29). c9 → arge-recete-18 dördüncü turdur açık ve GERİLEDİ: hedef paneli üst kenarı 313→329px (hedef ≤280). Toplam 54 < 56 (Stripe) → KAZANAN: Stripe. Altı 4\'ün hepsi kapanırsa toplam 60 ≥ 56 olur.';
}

writeFileSync(p, JSON.stringify(c, null, 1));
console.log('yazıldı. round=', c.round);
for (const [k, v] of Object.entries(R)) console.log(k, (v as any).total, (v as any).winner, 'open:', (v as any).open.length);
