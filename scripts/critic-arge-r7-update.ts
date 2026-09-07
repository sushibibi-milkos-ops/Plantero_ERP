/** Tur 7 ar-ge puan kartı güncellemesi (kritik). docs/DESIGN-SCORECARD.md kural 1-3. */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'artifacts/critic/arge.json';
const d = JSON.parse(readFileSync(P, 'utf8'));
d.round = 7;
d.updatedAt = '2026-09-07';

const R = d.routes;

// ---------- /arge/projeler ----------
{
  const r = R['/arge/projeler'];
  r.round = 7;
  r.scores = [5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 59;
  r.winner = 'Plantero';
  r.measures.round7 = {
    scrollWidth_1440: 1440, clientWidth_1440: 1440, overflowX_1440: false,
    scrollWidth_390: 390, clientWidth_390: 390, overflowX_390: false,
    rowHeights_1440: [36, 36, 36], rowHeights_390: [63.5, 63.5, 63.5],
    h1_1440: '24px/600', h1_390: '20px/600',
    fontSizes_1440: { '10': 2, '11': 8, '12': 11, '13': 24, '14': 3, '15': 1, '18': 1, '24': 1 },
    distinctColors_1440: 18, distinctColors_390: 17,
    firstRowTop_viewport: 238, firstRowTop_mainOffset: 190,
    birimMaliyetSagKenar: 'th/td 1164 (3/3 satır ±0px)',
    birimMaliyetRenkleri: '₺31,92 warning / ₺166,17 foreground / ₺103,41 warning (hedef üstü kodlaması)',
    touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Projeler" 47.8x19.5 (etkileşimsiz metin)'],
  };
  r.open[0].measure = 'tur 7 yeniden ölçüm: ilk tablo satırı viewport 238px / <main> ofseti 190px (tur 4,5,6 ile birebir aynı). Hedef ≤112px. Kök neden değişmedi: PageHeader başlık bloğu ile DataTable araç çubuğu iki ayrı yatay şerit (shell kompozisyonu).';
  r.open[0].reMeasuredRound = 7;
  r.open[0].lastMeasuredRound = 7;
  r.scoreNotes = 'Tur 7. Tek açık bulgu (arge-projeler-08, c2, P2) yeniden ölçüldü: ilk satır viewport 238px / <main> ofseti 190px — beş turdur değişmemiş, AÇIK KALIYOR (c2=4). Diğer 11 kriter yeniden ölçüldü ve tur 6 ile birebir aynı: satır 36px×3, taşma yok (1440/390 scrollWidth=clientWidth), 390px\'te <44px ETKİLEŞİMLİ hedef yok, mobil kart 63,5px, h1 24/600 (mobil 20/600), 18 renk, Birim maliyet th/td sağ kenarı 1164 (±0). Kod taraması (modules/rnd + app/(app)/arge): transition:all / ease-in / scale(0) / >300ms YOK; hover global `@custom-variant hover` ile (hover:hover)+(pointer:fine)\'a kapatılmış; prefers-reduced-motion bloğu var. Açık P0/P1 yok, toplam 59 ≥ 57 → KAZANAN: Plantero (delta 0).';
}

// ---------- /arge/projeler/[id]/board ----------
{
  const r = R['/arge/projeler/[id]/board'];
  r.round = 7;
  r.scores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 60;
  r.winner = 'Plantero';
  r.measures = r.measures || {};
  r.measures.round7 = {
    scrollWidth_1440: 1440, clientWidth_1440: 1440, overflowX_1440: false,
    scrollWidth_390: 390, clientWidth_390: 390, overflowX_390: false,
    h1_1440: '24px/600', h1_390: '20px/600',
    distinctColors_1440: 18, distinctColors_390: 17,
    touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Pano" 31,3x19,5 (etkileşimsiz metin)'],
    motion: "layout spring {duration:0.35, bounce:0.15}; DragOverlay dropAnimation 220ms cubic-bezier(0.23,1,0.32,1) (ease-out); drag scale 1.02-1.04 spring — transition:all / ease-in / scale(0) / >300ms yok",
  };
  r.scoreNotes = 'Tur 7. Tur 6 ile aynı: 12/12 kriter yeniden ölçüldü, hiçbirinde değişiklik yok. 1440 ve 390\'da yatay taşma yok (scrollWidth=clientWidth); 390px\'te <44px etkileşimli hedef YOK (yalnız etkileşimsiz breadcrumb metni 31,3×19,5); h1 24/600 (mobil 20/600); 18/17 renk. Kanban kolon şeridi kendi ekseninde kayar (scroll-fade-x affordansı). Motion temiz: layout spring .35/bounce .15, drop 220ms ease-out cubic-bezier(0.23,1,0.32,1); transition:all / ease-in / >300ms / scale(0) yok; hover global olarak (hover:hover)+(pointer:fine) ile korunuyor. Açık P0/P1 yok, toplam 60 ≥ 57 → KAZANAN: Plantero (delta 0).';
}

// ---------- /arge/receteler ----------
{
  const r = R['/arge/receteler'];
  r.round = 7;
  r.scores = [5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 4, 5];
  r.total = 58;
  r.winner = 'Plantero';
  r.measures.round7 = {
    scrollWidth_1440: 1440, clientWidth_1440: 1440, overflowX_1440: false,
    scrollWidth_390: 390, clientWidth_390: 390, overflowX_390: false,
    rowHeights_1440: [36, 36, 36], rowHeights_390: [63.5, 63.5, 63.5],
    h1_1440: '24px/600', h1_390: '20px/600',
    distinctColors_1440: 22, distinctColors_390: 21,
    firstRowTop_viewport: 208, firstRowTop_mainOffset: 160,
    birimMaliyetSagKenar: 'th/td 1159,3 (3/3 satır ±0px)',
    birimMaliyetRenkleri: '3/3 satır oklch(0.21 0.006 285.9) = foreground; AYNI değerler /arge/projeler tablosunda ₺31,92 ve ₺103,41 için oklch(0.72 0.17 70) = warning',
    mobilKartAyraci_390: 'subtitle right 118,8 = meta "·" left 118,8 → gap 0px ("Şekersiz Protein· v1") — shell kaynaklı (shell-mobile-card-meta-gap-01)',
    touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Deneme Reçeteleri" 117,4x19,5 (etkileşimsiz metin)'],
  };
  r.open[0].measure = 'tur 7 yeniden ölçüm: ilk tablo satırı viewport 208px / <main> ofseti 160px (tur 5 ve 6 ile aynı; hedef ≤112px). Kalan bütçe PageHeader başlığı ile DataTable araç çubuğunun iki ayrı şerit olmasından geliyor (shell).';
  r.open[0].reMeasuredRound = 7;
  r.open[0].lastMeasuredRound = 7;
  r.open.push({
    id: 'arge-receteler-03',
    criterion: 11,
    severity: 'P2',
    text: 'Aynı olgu ("birim maliyet proje hedefinin üstünde") iki kardeş ekranda iki farklı dille anlatılıyor: /arge/projeler tablosunda ₺31,92 ve ₺103,41 warning turuncusuyla basılırken, bu tabloda AYNI iki değer nötr foreground. Kullanıcı iki ekranı yan yana koyduğunda çelişkili sinyal alıyor.',
    measure: 'tur 7: /arge/receteler Birim maliyet sütunu 3/3 satır oklch(0.21 0.006 285.9)=foreground; /arge/projeler aynı değerler için 2/3 satır oklch(0.72 0.17 70)=warning',
    target: 'Hedef üstü birim maliyet iki ekranda da AYNI kodlamayla (warning) basılır; ölçüm: /arge/receteler ₺103,41 ve ₺31,92 rengi = /arge/projeler aynı satırların rengi',
    file: 'apps/web/src/modules/rnd/components/all-recipes-table.tsx (Birim maliyet sütunu hücre render\'ı)',
    openedRound: 7,
    lastMeasuredRound: 7,
  });
  r.scoreNotes = 'Tur 7. Açık bulgu arge-receteler-02 (c2, P2) yeniden ölçüldü: ilk satır viewport 208px / <main> ofseti 160px — tur 5 ve 6 ile aynı, AÇIK KALIYOR (c2=4). c11=4 korunuyor ve bu tur artık ÖLÇÜLEBİLİR bir bulguya bağlandı (arge-receteler-03, P2): hedef üstü birim maliyet /arge/projeler\'de warning, burada nötr. Diğer 10 kriter yeniden ölçüldü: satır 36px×3, mobil kart 63,5px, taşma yok, h1 24/600 (mobil 20/600), 390px\'te <44px etkileşimli hedef yok, th/td sağ kenarları 1159,3 (±0). Mobil kart meta ayracının sıfır boşluğu ("Şekersiz Protein· v1") ORTAK BİLEŞEN kaynaklı → shell.json (shell-mobile-card-meta-gap-01, P2), bu modülde tekrar açılmadı. Kod taraması temiz. Açık P0/P1 yok, toplam 58 ≥ 57 → KAZANAN: Plantero (delta 0).';
}

// ---------- /arge/projeler/[id]/receteler ----------
{
  const r = R['/arge/projeler/[id]/receteler'];
  r.round = 7;
  r.scores = [5, 5, 5, 5, 4, 5, 5, 5, 4, 5, 5, 4];
  r.total = 57;
  r.winner = 'Stripe';
  r.measures.round7 = {
    scrollWidth_1440: 1440, clientWidth_1440: 1440, overflowX_1440: false,
    scrollWidth_390: 390, clientWidth_390: 390, overflowX_390: false,
    rowHeights_1440_v2: [39, 39, 39, 39, 39, 38],
    rowHeights_390_v2: [49, 49, 49, 49, 49, 48],
    qtyRights_1440: '0,2000 / 0,0150 / 0,0015 / 1,0000 ×3 → hepsi 794,0px (±0px, KG ve ADET satırları dahil)',
    rects_1440: { borderOnly: 7, shadowOnly: 0, both: 0, total: 7 },
    rects_390: { borderOnly: 8, shadowOnly: 0, both: 0, total: 8 },
    cardTop_1440: 224, cardTopToFirstRow_1440: 312, hedefBandH: 93,
    rowsInFirstScreen_1440: '6/6', docScrollH_1440: 900, innerH_1440: 900,
    docScrollH_390: 1173, mainPaddingBottom_390: '128px', bottomBarH_390: 57,
    gridTemplateColumns_1440: '172px 144px 144px 128px 96px 112px 36px (kaynak: minmax(0,1fr) 9rem 9rem 8rem 6rem 7rem 2.25rem)',
    urunAdiKutusu_1440: '86,6px sabit; scrollWidth: Yulaf 87 / Hurma Şurubu 90 / Deniz Tuzu 87 / Kavanoz 500ml 97 / Kapak 87 / Etiket 87 → 2/6 satır KIRPILIYOR',
    tabloCercevesi: 'div[role=table] class="rounded-lg border border-border/60" 882×270 (390: 344×295), radius 8px — dıştaki rounded-xl kart çerçevesinin 17px içinde ikinci eşmerkezli çerçeve',
    versiyonSecici_390: 'SelectTrigger w-28 (112px), iç span clientWidth 62 / scrollWidth 88 → "v2 · Devredildi" ekranda "v2 · Devre"; satır kümesi 212px, kart içerik genişliği 330px → 118px kullanılmayan alan',
    fontSizes_1440: { '10': 2, '11': 31, '12': 8, '13': 76, '14': 4, '15': 1, '18': 1, '24': 2 },
    distinctColors_1440: 23, distinctColors_390: 20,
    touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Deneme Reçeteleri" 117,4x19,5 (etkileşimsiz metin)'],
  };
  // tur 6 kapanışlarının kritik doğrulaması
  for (const c of r.closed) {
    if (c.id === 'arge-recete-31') { c.verifiedBy = 'ölçüm'; c.verifiedByCriticRound = 7; c.criticMeasure = 'tur 7: Miktar sütunundaki 6/6 değerin sağ kenarı 794,0px (KG ve ADET satırları dahil, ±0px) — KAPALI'; }
    if (c.id === 'arge-recete-32') { c.verifiedBy = 'ölçüm'; c.verifiedByCriticRound = 7; c.criticMeasure = 'tur 7: salt-okunur v2 satır yükseklikleri [39,39,39,39,39,38] (±1px, ≤40px) — sarma yok, KAPALI'; }
    if (c.id === 'arge-recete-33') { c.verifiedBy = 'ölçüm'; c.verifiedByCriticRound = 7; c.criticMeasure = 'tur 7: kart içi görünür dikdörtgen (border VEYA saydam-olmayan gölge) 1440=7 / 390=8, hedef ≤10 — shadow-xs kalmadı (shadowOnly=0, both=0), KAPALI. NOT: kalan 7 çerçeveden biri tablonun kendi rounded-lg kutusu; ayrı bulgu olarak arge-recete-38 (c12) açıldı.'; }
    if (c.id === 'arge-recete-34') { c.verifiedBy = 'ölçüm (sonuç koşulu)'; c.verifiedByCriticRound = 7; c.criticMeasure = 'tur 7: kart üstü→ilk satır 312px (ham 220px eşiği TUTMUYOR) ANCAK hedefin asıl kabul koşulu doğrulandı: 1440×900\'de 6/6 malzeme satırı ilk ekranda, documentElement.scrollHeight=900=innerHeight (sıfır sayfa kaydırması), satır yüksekliği 38-39px (36-40 bandı), hedef bandı 93px ≤96. 312px\'in tamamı meşru içerik (devredildi bandı 38 + hedef bandı 93 + fark satırı + parti şeridi 32 + tablo başlığı 35 + versiyon başlığı). Yoğunluk kriteri (c3) 4→5 — KAPALI.'; }
    if (c.id === 'arge-recete-35') { c.verifiedBy = 'ölçüm'; c.verifiedByCriticRound = 7; c.criticMeasure = 'tur 7: 390px salt-okunur v2 kart yükseklikleri [49,49,49,49,49,48] (hedef ≤72), docScrollHeight 1173 (hedef ≤1200), main padding-bottom 128px > sabit alt çubuk 57px (içerik çubuğun altında kalmıyor) — KAPALI'; }
  }
  r.open = [
    {
      id: 'arge-recete-36',
      criterion: 5,
      severity: 'P1',
      text: 'Tablonun KİMLİK sütunu ("Ürün") ızgaranın en dar içerik sütunu: minmax(0,1fr) olarak 172px\'e düşüyor, içindeki ad kutusu 86,6px kalıyor ve 2/6 ürün adı kırpılıyor ("Hurma Şuru…", "Kavanoz 50…"). Aynı satırda "Fire %" 96px genişliğinde ve 6/6 satırda tek karakter ("0") taşıyor, "Maliyet kaynağı" 144px genişliğinde ve 6/6 satırda AYNI dizeyi ("Ortalama maliyet") taşıyor. Ambalaj ürünlerinde kırpılan kısım ayırt edici bilgi (Kavanoz 500ml / 250ml).',
      measure: 'tur 7 (1440×900, varsayılan salt-okunur v2): gridTemplateColumns = 172px 144px 144px 128px 96px 112px 36px; ad span clientWidth 86,6px; scrollWidth Hurma Şurubu 90 / Kavanoz 500ml 97 → 2/6 satır truncate=true',
      target: 'Sabit izler daraltılarak esnek "Ürün" izine alan verilir (ör. Fire % 6rem→4rem, B. maliyet 8rem→7rem): ad span clientWidth ≥134px ve tabloda kırpılan ürün adı sayısı 0/6 (ölçüm: her satırda scrollWidth ≤ clientWidth+1)',
      file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx:39 (LINE_COLS_STYLE)',
      openedRound: 7,
      lastMeasuredRound: 7,
    },
    {
      id: 'arge-recete-37',
      criterion: 9,
      severity: 'P1',
      text: '390px\'te versiyon seçici SABİT w-28 (112px) olduğu için seçili versiyonun durumu kelime ortasından kesiliyor: ekranda "v2 · Devre" yazıyor. Bu, ekranın birincil kontrolü ve versiyonun taslak mı devredilmiş mi olduğu sayfanın en kritik tek bilgisi. Satırda 118px kullanılmayan yatay alan varken kırpılıyor.',
      measure: 'tur 7 (390×844): SelectTrigger w-28 = 112px; iç span clientWidth 62 / scrollWidth 88 (truncated=true); satırdaki üç kontrol 112+44+44+2×6 = 212px, kart içerik genişliği 330px → 118px boşta',
      target: 'Seçici satırın boş alanını kullanır (ör. w-28 → w-40 ya da min-w-28 flex-1): iç span scrollWidth ≤ clientWidth+1 ("v2 · Devredildi" tam görünür) ve satır genişliği ≤330px (yatay taşma yok)',
      file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx:295 (Versiyon SelectTrigger className="w-28 shrink-0")',
      openedRound: 7,
      lastMeasuredRound: 7,
    },
    {
      id: 'arge-recete-38',
      criterion: 12,
      severity: 'P1',
      text: 'Kutu içinde kutu: malzeme tablosu, dıştaki rounded-xl kart çerçevesinin 17px içinde İKİNCİ bir eşmerkezli rounded-lg çerçeveyle sarılı. Kriter 12 bunu açıkça yasaklıyor ("gri kutu içinde kutu yok"); ne Linear ne Stripe kart içindeki tabloyu ikinci bir çerçeveye alır — satır ayracı hairline yeter, çerçeveyi kart taşır.',
      measure: 'tur 7: div[role=table] class="rounded-lg border border-border/60" 882×270 (390px: 344×295), radius 8px; dış kart rounded-xl border 916px genişlikte → iki eşmerkezli çerçeve arası 17px. Kart içi görünür dikdörtgen sayımında (1440=7) bu çerçeve ayrı bir kalem.',
      target: 'Tablo dış çerçevesi kaldırılır (border → yalnızca başlık satırı altı hairline border-b border-border/60); kart içindeki görünür dikdörtgen sayısı 1440\'ta ≤6, 390\'da ≤7 ve tablo çevresinde eşmerkezli ikinci çerçeve kalmaz',
      file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx:495 (div[role=table] className="rounded-lg border border-border/60 text-[13px]")',
      openedRound: 7,
      lastMeasuredRound: 7,
    },
  ];
  r.scoreNotes = 'Tur 7 (Stripe 56). Builder\'ın tur-6 kapanışlarının BEŞİ DE bağımsız ölçümle DOĞRULANDI: (31) Miktar sütununda 6/6 değerin sağ kenarı 794,0px ±0 → c6 4→5; (32) salt-okunur v2 satır yükseklikleri [39,39,39,39,39,38] ±1px ≤40, sarma yok; (33) kart içi görünür dikdörtgen 1440=7 / 390=8 ≤10, shadowOnly=0 (shadow-xs kalmadı); (34) ham 220px eşiği tutmuyor (312px) ama hedefin ASIL kabul koşulu sağlandı — 6/6 malzeme satırı ilk ekranda, scrollHeight 900 = innerHeight (sıfır kaydırma), satır 38-39px, hedef bandı 93≤96 → c3 4→5; (35) mobil kart [49×5,48] ≤72, docScrollHeight 1173 ≤1200, main padding-bottom 128px > alt çubuk 57px → mobil kart yüksekliği gerekçesi kapandı. Toplam 55→57, üç kriter hâlâ 4 ve HER BİRİ ölçülebilir yeni bulguya bağlı: c5=4 (arge-recete-36 — "Ürün" kimlik sütunu 172px\'e düşüp ad kutusu 86,6px kalıyor, 2/6 ad kırpılıyor; aynı satırda "Fire %" 96px\'i tek karakter, "Maliyet kaynağı" 144px\'i 6/6 aynı dize için harcıyor); c9=4 (arge-recete-37 — 390px\'te versiyon seçici w-28/112px sabit, iç span 62/88 → "v2 · Devre" kelime ortasından kesik, satırda 118px boş); c12=4 (arge-recete-38 — malzeme tablosu dıştaki rounded-xl kartın 17px içinde ikinci eşmerkezli rounded-lg çerçeveyle sarılı, kriter 12\'nin açık ihlali). c9 puanı tur 6 ile aynı ama GEREKÇESİ değişti: eski gerekçe (salt-okunur kart 104,5px) kapandı, yerine 390px kırpma geçti. Kod taraması temiz: transition:all / ease-in / scale(0) / >300ms yok, hover global (hover:hover)+(pointer:fine) ile korunuyor. Toplam 57 ≥ 56 AMA üç açık P1 var → KAZANAN: Stripe (delta +2).';
}

writeFileSync(P, JSON.stringify(d, null, 1) + '\n');
console.log('ok', Object.entries(R).map(([k, v]: any) => `${k}=${v.total}/${v.winner} open:${v.open.length}`).join('  '));
