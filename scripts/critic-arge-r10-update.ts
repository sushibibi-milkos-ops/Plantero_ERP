/** Tur 10 kritik — artifacts/critic/arge.json kalıcı puan kartı güncellemesi. */
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'artifacts/critic/arge.json';
type Finding = Record<string, unknown>;
type Route = { round: number; reference: string; referenceTotal: number; scores: number[]; total: number; winner: string; scoreNotes: string; measures: Record<string, unknown>; open: Finding[]; closed: Finding[] };
type Card = { module: string; round: number; updatedAt: string; routes: Record<string, Route>; sharedFindings: Finding[]; codeScan: Record<string, unknown>; projectIdUsed: string; [k: string]: unknown };

const card = JSON.parse(readFileSync(path, 'utf8')) as Card;
card.round = 10;
card.updatedAt = '2026-09-07';
card.projectIdUsed =
  '8f3bffbd-8b3a-41ae-9f82-8f43f810cc52 (RD-2026-000001 Fıstık Bazı — listedeki ilk kayıt, v1 · Taslak/editable; DB yeniden seed edildiği için tur 9 id\'leri geçersiz)';

// ---------------------------------------------------------------- /arge/projeler
{
  const r = card.routes['/arge/projeler']!;
  r.round = 10;
  r.scores = [5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 59;
  r.winner = 'Plantero';
  r.measures.round10 = {
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
    birimMaliyetRenkleri: '₺31,92 oklch(0.72 0.17 70)=warning · ₺166,17 oklch(0.21 0.006 285.9)=foreground · ₺103,41 warning — /arge/receteler ile BİREBİR AYNI (tur 9\'daki c11 sapması kapandı)',
    paraHucreleri: '3/3 tabular-nums + text-align:right',
  };
  r.scoreNotes =
    'Tur 10. Tek açık bulgu (arge-projeler-08, c2, P2) yeniden ölçüldü: ilk tablo satırı viewport 238px / <main> ofseti 190px — sekiz turdur (4-10) birebir aynı, AÇIK KALIYOR (c2=4). Diğer 11 kriter yeniden ölçüldü, tur 9 ile aynı: satır 36px×3, 1440/390 scrollWidth=clientWidth, 390px\'te <44px ETKİLEŞİMLİ hedef yok, mobil kart 63,5px, h1 24/600 (mobil 20/600), 17/16 renk, para 3/3 tabular-nums + sağa hizalı. c11: kardeş ekranla renk kodlaması artık BİREBİR aynı (aşağıya bkz. /arge/receteler arge-receteler-03 kapandı) → c11=5 korunur. Kod taraması (modules/rnd + app/(app)/arge): transition-all / ease-in / scale(0) / >300ms YOK; hover global `@custom-variant hover` ile (hover:hover)+(pointer:fine)\'a kapalı; klavye aktivasyonunda ölçek animasyonu YOK (CDP forcePseudoState: :active+:focus-visible → transform none, yalnız :active → scale(0.97)). Açık P0/P1 yok, toplam 59 ≥ 57 → KAZANAN: Plantero (delta 0).';
  const f = r.open.find((o) => o.id === 'arge-projeler-08')!;
  f.measure =
    'tur 10 yeniden ölçüm: ilk tablo satırı viewport 238px / <main> ofseti 190px (tur 4-9 ile birebir aynı). Hedef ≤112px. Kök neden değişmedi: PageHeader başlık bloğu ile DataTable araç çubuğu iki ayrı yatay şerit (shell kompozisyonu).';
  f.reMeasuredRound = 10;
  f.lastMeasuredRound = 10;
}

// ---------------------------------------------------------------- board
{
  const r = card.routes['/arge/projeler/[id]/board']!;
  r.round = 10;
  r.scores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 60;
  r.winner = 'Plantero';
  r.measures.round10 = {
    scrollWidth_1440: 1440,
    clientWidth_1440: 1440,
    overflowX_1440: false,
    scrollWidth_390: 390,
    clientWidth_390: 390,
    overflowX_390: false,
    h1_1440: '24px/600',
    h1_390: '20px/600',
    distinctColors_1440: 19,
    distinctColors_390: 17,
    fontSizes_1440: { '10': 2, '11': 27, '12': 1, '13': 34, '14': 9, '15': 1, '18': 1, '24': 1 },
    touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Pano" 31.3x19.5 (etkileşimsiz metin)'],
    kartOdakHalkasi: 'gerçek Tab ile: kart :focus-visible → outline 1px auto oklab(0.55 -0.141272 0.0751154 / 0.5) = ring/50 (görsel: artifacts/critic/arge-r10-board-focus.png)',
    kartEkleOdakHalkasi: 'Button focus-visible → boxShadow oklab(0.55 … / 0.5) 0 0 0 3px',
    klavyeAktivasyonu: 'CDP forcePseudoState — :active+:focus-visible → transform none (klavyede ölçek YOK); yalnız :active → scale(0.97)',
  };
  r.scoreNotes =
    'Tur 10. Açık P0/P1 yok; 12 kriter yeniden ölçüldü, tur 9 ile aynı. 1440: sayfa scrollWidth=clientWidth=1440 (kanban kendi overflow-x:auto kaydırıcısında), h1 24/600, 19 renk, font kademeleri 11/13/14 ağırlıklı. 390: scrollWidth=clientWidth=390, <44px etkileşimli hedef YOK, h1 20/600, 17 renk. Bu tur ek olarak KLAVYE akışı doğrudan ölçüldü: gerçek Tab ile kanban kartına gelindiğinde :focus-visible eşleşiyor ve yeşil ring görünüyor (outline 1px auto ring/50); Boşluk basılıyken ölçek animasyonu OYNAMIYOR (globals.css :not(:focus-visible) kuralı CDP forcePseudoState ile doğrulandı) — c8=5 teyit. Kod taraması: transition-[transform,box-shadow,opacity] 150ms ease-out, motion layout spring 0.35s/bounce 0.15, DragOverlay 220ms — transition-all / ease-in / scale(0) / >300ms sabit süre YOK. Yeni tek bulgu P2 (arge-board-16, c11: kart odak halkası UA `outline:auto`, paylaşılan Button ise 3px ring — aynı ekranda iki farklı odak dili); kazanmayı engellemez. Toplam 60 ≥ 57 → KAZANAN: Plantero (delta 0).';
  r.open = [
    {
      id: 'arge-board-16',
      criterion: 11,
      severity: 'P2',
      text: 'Aynı panoda iki farklı odak dili: kanban kartı klavye odağında tarayıcının varsayılan `outline: 1px auto` halkasını gösterirken, paylaşılan Button ("Kart ekle", "Kolon ekle") 3px yumuşak `box-shadow` ring kullanıyor. Kart, panonun birincil klavye hedefi.',
      measure:
        'tur 10 (1440×900, gerçek Tab + CDP forcePseudoState): kart :focus-visible → outline "1px auto oklab(0.55 -0.141272 0.0751154 / 0.5)", boxShadow yalnız 0 1px 2px rgba(0,0,0,.04); Button "Kart ekle" :focus-visible → outline 0px none, boxShadow "oklab(0.55 … / 0.5) 0 0 0 3px". board-card.tsx:35-38 içinde hiç focus-visible sınıfı yok.',
      target: 'Kanban kartı da paylaşılan odak dilini kullansın: focus-visible\'da outline 0 + `ring-[3px] ring-ring/50` (ölçüm: kartın focus-visible boxShadow\'unda 3px ring, outlineWidth 0px)',
      file: 'apps/web/src/modules/rnd/components/board-card.tsx:35-38',
      openedRound: 10,
      lastMeasuredRound: 10,
    },
  ];
}

// ---------------------------------------------------------------- proje reçeteleri
{
  const r = card.routes['/arge/projeler/[id]/receteler']!;
  r.round = 10;
  r.scores = [5, 5, 5, 5, 5, 4, 5, 5, 5, 5, 5, 5];
  r.total = 59;
  r.winner = 'Stripe';
  r.measures.round10 = {
    scrollWidth_1440: 1440,
    clientWidth_1440: 1440,
    overflowX_1440: false,
    scrollWidth_390: 390,
    clientWidth_390: 390,
    overflowX_390: false,
    scrollWidth_375: 375,
    clientWidth_375: 375,
    h1_1440: '24px/600',
    h1_390: '20px/600',
    distinctColors_1440: 21,
    distinctColors_390: 18,
    fontSizes_1440: { '10': 2, '11': 19, '12': 8, '13': 67, '14': 7, '15': 1, '18': 1, '24': 2 },
    touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Deneme Reçeteleri" 117.4x19.5 (etkileşimsiz metin)'],
    eylemSeridi_390: 'sw=cw=344; Versiyon 160×44 · Ekle 44×44 · Kaydet 44×44 · Onaya gönder 44×44; hepsinde overflowRight=0',
    eylemSeridi_375: 'sw=cw=329; dört kontrolün de overflowRight=0 (arge-recete-39 bağımsız doğrulandı)',
    satirHizasi_390:
      'satır içi dikey merkez (cy): Badem (Manuel/NumberInput) B.maliyet 680 = Kaynak 680 (0px); Hurma Şurubu 769 vs 781 (12px), Deniz Tuzu 870 vs 882 (12px), Kavanoz 500ml 971 vs 983 (12px) → salt-okunur B. maliyet 3/4 satırda 12px yukarıda',
    saglamaHizasi_1440: 'B. maliyet sütunu: manuel input right=1155 = MoneyCell right=1155 (±0px); Satır maliyeti 4/4 right=1347; tüm sayı hücreleri tabular-nums',
    paraOnEki_1440: 'Manuel satırda ₺ öneki input\'un solunda (pl-6), rakamlar sağa yaslı → ₺ ile rakam arası ~32px; salt-okunur satırlarda ₺ rakama bitişik (₺120,00)',
    odakHalkasi: 'Button focus-visible → boxShadow oklab(0.55 … / 0.5) 0 0 0 3px',
    bosDurum: 'loading.tsx + EmptyState mevcut (kardeş listede ölçüldü: ikon+başlık+ipucu, "0 kayıt" sayacı, input\'ta temizle ×)',
  };
  r.scoreNotes =
    'Tur 10 (Stripe 56). arge-recete-39 (tur 9 P1) BAĞIMSIZ DOĞRULANDI ve KAPALI kalır: 390 ve 375px\'te eylem şeridi sw=cw (344/344, 329/329), dört kontrolün de overflowRight=0, "Onaya gönder" tam görünür → c9 4→5 (gerekçe: tur 9\'daki tek c9 kusuru ölçümle gitti). ANCAK yeni P1 (arge-recete-40, c6): 390px\'te salt-okunur "B. maliyet" değeri kendi satırının taban hizasının 12px ÜSTÜNDE duruyor (3/4 satırda; manuel satırda 0px) — değer, kendi hücre kutusunun üst kenarından taşıyor (kanıt: artifacts/critic/arge-r10-precete-390-satirlar.png). Bu yüzden c6 5→4. Diğer 10 kriter tur 9 ile aynı: 1440/390/375\'te sayfa taşması yok, para hücreleri tabular-nums ve sütun sağ kenarları ±0px (B. maliyet 1155, Satır maliyeti 1347), h1 24/600 (mobil 20/600), 21/18 renk, hedef bandı tek vurgu rengiyle (%14 hedef üstü), boş/yükleniyor durumları yerinde, Button focus ring 3px. İkinci yeni bulgu P2 (arge-recete-41, c6): manuel satırda ₺ öneki rakamlardan ~32px kopuk, salt-okunur satırlarda bitişik. Kod taraması temiz (en uzun 200ms; transition-all / ease-in / scale(0) yok; hover gated). Toplam 59 ≥ 56 AMA açık P1 var → KAZANAN: Stripe (delta 0; c9 +1, c6 −1).';
  r.open = [
    {
      id: 'arge-recete-40',
      criterion: 6,
      severity: 'P1',
      text: '390px\'te malzeme satırının salt-okunur "B. maliyet" değeri (kaynak = Ortalama/Son alış) satırın taban hizasına oturmuyor: aynı satırdaki Miktar birimi, Kaynak seçici ve Fire % kutuları 44px\'lik izin dikey merkezinde dururken sayı 12px yukarıda, kendi hücresinin üst kenarından taşmış gibi asılı kalıyor. Manuel kaynaklı satırda (NumberInput) hiza doğru — yani aynı sütunun içinde iki farklı dikey hiza var; sayı sütununda taban hizası kırıldığında değer görsel olarak bir üst satıra aitmiş gibi okunuyor.',
      measure:
        'tur 10 (390×844, RD-2026-000001 v1 · Taslak): satır içi dikey merkez (cy) — Badem/Manuel: B.maliyet ₺(input) 680 vs Kaynak 680 → 0px; Hurma Şurubu: ₺120,00 769 vs Ortalama 781 → 12px; Deniz Tuzu: ₺15,00 870 vs 882 → 12px; Kavanoz 500ml: ₺22,00 971 vs 983 → 12px. 3/4 satırda 12px sapma. Görsel kanıt: artifacts/critic/arge-r10-precete-390-satirlar.png',
      target:
        '390px\'te 4/4 satırda |cy(B. maliyet) − cy(Kaynak)| ≤ 1px (ör. salt-okunur hücreye `flex h-11 items-center justify-end md:h-auto md:block`, ya da MoneyCell\'e `flex min-h-11 items-center` mobil sarmalayıcı)',
      file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx:705-732 (`<div className="min-w-0 md:block md:px-2 md:text-right">` + `<MoneyCell value={uCost} digits={2} className="block w-full" />`)',
      openedRound: 10,
      lastMeasuredRound: 10,
    },
    {
      id: 'arge-recete-41',
      criterion: 6,
      severity: 'P2',
      text: 'Aynı "Birim maliyet" sütununda para birimi iki farklı biçimde basılıyor: manuel kaynaklı satırda ₺ öneki hücrenin solunda tek başına duruyor (kutu dinlenmede kenarlıksız olduğu için sahipsiz bir glif gibi görünüyor), salt-okunur satırlarda ₺ rakama bitişik. Stripe tutarları tek bir para dili ile basar.',
      measure:
        'tur 10 (1440×900): manuel satırda NumberInput `pl-6 text-right` → ₺ sol kenarda, rakamlar sağ kenarda, arada ~32px boşluk; salt-okunur satırlarda MoneyCell "₺120,00" tek parça. Aynı sütunda 1 satır kopuk / 3 satır bitişik.',
      target: 'Sütundaki 4/4 satırda ₺ ile ilk rakam arası ≤4px (ör. manuel satırda öneki inline yaz: değerle birlikte sağa yaslı tek metin bloğu)',
      file: 'apps/web/src/modules/rnd/components/cost-simulator.tsx:708-723 (NumberInput prefix="₺" + inputClassName pl-6/md:pl-7)',
      openedRound: 10,
      lastMeasuredRound: 10,
    },
  ];
  const closed39 = r.closed.find((c) => c.id === 'arge-recete-39')!;
  closed39.verifiedBy = 'ölçüm (tur 10 kritik bağımsız doğrulaması)';
  closed39.verifiedByCriticRound = 10;
}

// ---------------------------------------------------------------- /arge/receteler
{
  const r = card.routes['/arge/receteler']!;
  r.round = 10;
  r.scores = [5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 59;
  r.winner = 'Plantero';
  r.measures.round10 = {
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
    distinctColors_1440: 21,
    distinctColors_390: 20,
    fontSizes_1440: { '10': 2, '11': 5, '12': 9, '13': 37, '14': 1, '15': 1, '18': 1, '24': 1 },
    firstRowTop_viewport: 208,
    firstRowTop_mainOffset: 160,
    touchTargetsBelow44_390: ['span[data-slot=breadcrumb-page] "Deneme Reçeteleri" 117.4x19.5 (etkileşimsiz metin)'],
    birimMaliyetRenkleri: '₺166,17 oklch(0.21 0.006 285.9)=foreground · ₺103,41 oklch(0.72 0.17 70)=warning · ₺31,92 warning — /arge/projeler ile BİREBİR aynı (arge-receteler-03 kapandı)',
    bosDurum: 'eşleşmeyen aramada: dairesel ikon + "Eşleşen kayıt yok" + "Arama ya da filtreleri değiştirmeyi deneyin." + "0 kayıt" sayacı + input temizle × (artifacts/critic/arge-r10-bos-1440.png)',
  };
  r.scoreNotes =
    'Tur 10. arge-receteler-03 (c11, P2) BAĞIMSIZ DOĞRULANDI ve KAPALI: Birim maliyet sütunu artık /arge/projeler ile aynı dili konuşuyor (₺166,17 foreground; ₺103,41 ve ₺31,92 warning = hedef üstü) → c11 4→5 (gerekçeli artış). Kalan tek açık bulgu arge-receteler-02 (c2, P2) yeniden ölçüldü: ilk tablo satırı viewport 208px / <main> ofseti 160px — tur 5-10 ile aynı, hedef ≤112px, AÇIK (c2=4). Diğer 10 kriter tur 9 ile aynı: satır 36px×3, 1440/390 taşma yok, mobil kart 63,5px, h1 24/600 (mobil 20/600), 21/20 renk, <44px etkileşimli hedef yok, para 3/3 tabular-nums + sağa hizalı, tablo anatomisi /arge/projeler ile birebir. Boş durum yeniden çekildi (ikon+başlık+ipucu+temizleme affordansı) → c7=5. Kod taraması temiz. Açık P0/P1 yok, toplam 59 ≥ 57 → KAZANAN: Plantero (delta +1, c11 gerekçeli).';
  const f = r.open.find((o) => o.id === 'arge-receteler-02')!;
  f.measure =
    'tur 10 yeniden ölçüm: ilk tablo satırı viewport 208px / <main> ofseti 160px (tur 5-9 ile aynı; hedef ≤112px). Kök neden: PageHeader başlığı ile DataTable araç çubuğunun iki ayrı yatay şerit olması (shell kompozisyonu).';
  f.reMeasuredRound = 10;
  f.lastMeasuredRound = 10;
}

// ---------------------------------------------------------------- kod taraması
card.codeScan = {
  transitionAll: 0,
  easeIn: 0,
  scaleZero: 0,
  durationOver300ms: 0,
  hoverGating: 'globals.css `@custom-variant hover` → (hover:hover) and (pointer:fine); rnd modülündeki 15 hover: kullanımının tamamı bu tanımdan geçiyor.',
  keyboardActivation:
    'Tur 10 doğrudan ölçüm (CDP forcePseudoState, kanban kartı): :active + :focus-visible → transform "none"; yalnız :active → scale(0.97). globals.css:179-182 `:not(:focus-visible)` kuralı yardımcı sınıf `active:scale-[0.98]`ı da yeniyor → klavye aktivasyonunda animasyon YOK.',
  notes:
    'Tur 10: apps/web/src/modules/rnd + app/(app)/arge içinde transition-all / transition: all, ease-in (ease-in-out hariç), scale(0)/scale-0, 300ms üstü sabit süre YOK. En uzunlar: motion layout spring duration 0.35 bounce 0.15 (kesilebilir), DragOverlay dropAnimation 220ms cubic-bezier(0.23,1,0.32,1), card-drawer ilerleme çubuğu 200ms. transform-origin hatası yok.',
};

writeFileSync(path, JSON.stringify(card, null, 1) + '\n', 'utf8');
console.log('güncellendi:', path, 'tur', card.round);
