/** Tur 14 — artifacts/critic/arge.json kalıcı puan kartı güncellemesi (kritik yazar). */
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'artifacts/critic/arge.json';
const card = JSON.parse(readFileSync(path, 'utf8')) as any;
const R = 14;

card.round = R;
card.updatedAt = '2026-09-07';

const m14 = {
  projeler_1440: { scrollWidth: 1440, clientWidth: 1440, overflowX: false, h1: '24px/600', rowHeights: [36, 36, 36], firstRowTop_viewport: 238, firstRowTop_mainOffset: 190, h1Top_mainOffset: 24, theadTop_mainOffset: 154, fontSizes: { '11': 3, '12': 11, '13': 12, '14': 1, '24': 1 }, distinctColors: 18, rowHover: 'oklab(0.955 … / 0.5) = accent/50', rowFocus: 'outline 2px solid oklch(0.55 0.16 152), offset -2px (gerçek Tab)', money: '3/3 tabular-nums + text-align:right; title/aria/sr-only YOK; ₺31,92 ve ₺103,41 warning oklch(0.72 0.17 70), ₺166,17 foreground; main.textContent içinde "hedef" YOK' },
  projeler_390: { scrollWidth: 390, clientWidth: 390, overflowX: false, h1: '20px/600', cardHeights: [63.5, 63.5, 63.5], touchTargetsBelow44: [], money: 'aynı (title/aria/sr-only yok)' },
  receteler_1440: { scrollWidth: 1440, clientWidth: 1440, overflowX: false, h1: '24px/600', rowHeights: [36, 36, 36], firstRowTop_viewport: 208, firstRowTop_mainOffset: 160, h1Top_mainOffset: 24, theadTop_mainOffset: 124, fontSizes: { '12': 9, '13': 17, '24': 1 }, distinctColors: 23, rowHover: 'accent/50', rowFocus: 'outline 2px solid accent, offset -2px', thTdRightEdges: '7/7 sütunda birebir aynı (708/831/921/1051/1171/1276/1416)', money: '3/3 tabular-nums + right; title/aria/sr-only YOK; "hedef" kelimesi main içinde YOK' },
  receteler_390: { scrollWidth: 390, clientWidth: 390, overflowX: false, cardHeights: [63.5, 63.5, 63.5], touchTargetsBelow44: [] },
  precete_1440: { scrollWidth: 1440, clientWidth: 1440, overflowX: false, fontSizes: { '11': 13, '12': 8, '13': 42, '14': 5, '24': 2 }, distinctColors: 21, solidAccentButtons: [{ text: 'Yeni deneme reçetesi', w: 186, h: 32 }, { text: 'Onaya gönder', w: 136, h: 32 }], prefixGap: [{ value: '38,00', gap: 42.7 }, { value: '0,35', gap: 49.1 }] },
  precete_390: { scrollWidth: 390, clientWidth: 390, overflowX: false, touchTargetsBelow44: [], solidAccentButtons: [{ text: 'Onaya gönder', w: 44, h: 44 }], prefixGap: [{ value: '38,00', gap: 18.7 }, { value: '0,35', gap: 109.3 }], fire: '4/4 fire input 52×44, aria-label/title YOK ama satır başına 1 adet .sr-only "Fire %" etiketi VAR (4 adet); görünür (w>0,h>0) "Fire"/"%" işareti 0 — masaüstü başlığı 390px’te w=0/h=0' },
  board_1440: { scrollWidth: 1440, clientWidth: 1440, overflowX: false, fontSizes: { '11': 20, '12': 1, '13': 12, '14': 1, '24': 1 }, distinctColors: 20, solidAccentButtons: [] },
  board_390: { scrollWidth: 390, clientWidth: 390, overflowX: false, fontSizes: { '11': 20, '12': 1, '13': 12, '14': 1, '20': 1 }, distinctColors: 20, touchTargetsBelow44: [] },
  bosDurum: 'Her iki listede arama "zzzzyok" → 0 kayıt + SearchX ikonu + "Eşleşen kayıt yok" başlığı + "Arama ya da filtreleri değiştirmeyi deneyin." ipucu + arama kutusunda ✕ temizle düğmesi',
  kodTaramasi: 'apps/web/src/modules/rnd + app/(app)/arge: transition-all / transition: all / ease-in / scale(0) / scale-0 → 0 eşleşme. Süreler: duration-150 (board-card, board-column, kanban-board, project-list, project-nav-tabs), duration-200 (card-drawer, cost-simulator) — hepsi <300ms. hover: globals.css:11 içinde @media (hover: hover) and (pointer: fine) ile korunuyor.',
};

const R14 = (route: string, scores: number[], note: string, measures: unknown) => {
  const r = card.routes[route];
  r.round = R;
  r.scores = scores;
  r.total = scores.reduce((a: number, b: number) => a + b, 0);
  r.winner = 'Plantero';
  r.scoreNotes = note;
  r.measures = { ...(r.measures ?? {}), round14: measures };
  for (const o of r.open ?? []) o.round14 = 'yeniden ölçüldü — AÇIK';
};

R14(
  '/arge/projeler',
  [5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  'Tur 14. İki açık P2 yeniden ölçüldü, ikisi de AÇIK ve DEĞİŞMEMİŞ: (a) arge-projeler-08 (c2) 1440px ilk tablo satırı viewport 238px / <main> ofseti 190px (h1 24, thead 154) — tur 4-14 birebir aynı; 390px ilk kart 63.5px. (b) arge-projeler-09 (c4) 3/3 para hücresinde title/aria/sr-only yok, 2/3 hücre warning oklch(0.72 0.17 70), main.textContent içinde "hedef" yok. Diğer 10 kriter yeniden ölçüldü, tur 13 ile aynı: sw=cw=1440 ve 390 (taşma yok), satır 36/36/36, h1 24/600 (mobil 20/600), 13px gövde + 11/12px etiket, 18 renk, para 3/3 tabular-nums + sağa hizalı, satır hover accent/50, gerçek Tab’da 2px accent outline (offset -2px), 390’da <44px etkileşimli hedef yok, boş durum SearchX + başlık + ipucu + ✕ temizle. Kod taraması temiz. Açık P0/P1 yok, toplam 59 ≥ 57 → KAZANAN: Plantero (delta 0).',
  { p1440: m14.projeler_1440, p390: m14.projeler_390, bosDurum: m14.bosDurum, kodTaramasi: m14.kodTaramasi },
);

R14(
  '/arge/projeler/[id]/board',
  [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  'Tur 14. Açık bulgu yok; yeniden ölçüm tur 13 ile aynı: 1440 ve 390’da sw=cw (yatay taşma yok — kolon şeridi kendi kabında kayıyor), 390’da <44px etkileşimli hedef yok, dolu-vurgu buton 0 (kanban tamamen nötr), font kademeleri 11/13 baskın + tek h1 (1440’ta 24, 390’da 20), 20 renk. Kod taraması temiz (duration-150, ease-out; transition-all/ease-in/scale(0) yok). Toplam 60 ≥ 57 → KAZANAN: Plantero (delta 0).',
  { b1440: m14.board_1440, b390: m14.board_390, kodTaramasi: m14.kodTaramasi },
);

R14(
  '/arge/projeler/[id]/receteler',
  [5, 5, 5, 5, 5, 4, 5, 5, 5, 5, 5, 5],
  'Tur 14. Üç açık P2 yeniden ölçüldü, üçü de AÇIK: (a) arge-recete-41 (c6) ₺ öneki ile ilk rakam arası 1440px’te 42,7px (manuel satır) ve 49,1px (genel gider); 390px’te 18,7px / 109,3px — hedef ≤4px; aynı sütundaki diğer 3 satır "₺120,00" biçiminde bitişik. (b) arge-recete-42 (c1) 1440px’te dolu-vurgu (oklch(0.55 0.16 152)) buton sayısı hâlâ 2 — "Yeni deneme reçetesi" 186×32 ve "Onaya gönder" 136×32; 390px’te 1. (c) arge-recete-43 (c9) KISMİ İLERLEME: satır başına .sr-only "Fire %" etiketi eklenmiş (4/4 satır), ama görünür "Fire"/"%" işareti hâlâ 0 (masaüstü başlığı 390px’te w=0/h=0) → hedef "görünür birim/etiket" karşılanmadı, açık kalır. Diğer kriterler tur 13 ile aynı: sw=cw 1440/390 (taşma yok), 390’da <44px etkileşimli hedef yok, hedef maliyet çubuğu tek warning tonu, 21 renk. Kod taraması temiz (cost-simulator duration-200 ease-out). Açık P0/P1 yok, toplam 59 ≥ 56 → KAZANAN: Plantero (delta 0).',
  { p1440: m14.precete_1440, p390: m14.precete_390, kodTaramasi: m14.kodTaramasi },
);

R14(
  '/arge/receteler',
  [5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  'Tur 14. İki açık P2 yeniden ölçüldü, ikisi de AÇIK ve DEĞİŞMEMİŞ: (a) arge-receteler-02 (c2) 1440px ilk tablo satırı viewport 208px / <main> ofseti 160px (h1 24, thead 124) — tur 5-14 aynı. (b) arge-receteler-04 (c4) 3/3 para hücresinde title/aria/sr-only yok, "hedef" kelimesi ekranda yok, 2/3 hücre warning. Diğer kriterler: sw=cw 1440/390, satır 36/36/36, mobil kart 63.5px, th/td sağ kenarları 7/7 sütunda birebir aynı, font YALNIZCA 3 kademe (12/13/24 — modüldeki en temiz dağılım), 23 renk, hover accent/50, gerçek Tab’da 2px accent outline, 390’da <44px hedef yok, boş durum SearchX + başlık + ipucu + ✕ temizle. Kod taraması temiz. Açık P0/P1 yok, toplam 59 ≥ 57 → KAZANAN: Plantero (delta 0).',
  { r1440: m14.receteler_1440, r390: m14.receteler_390, bosDurum: m14.bosDurum, kodTaramasi: m14.kodTaramasi },
);

// arge-recete-43'ün ölçümünü güncelle (kısmi ilerleme kayda geçsin)
for (const o of card.routes['/arge/projeler/[id]/receteler'].open ?? []) {
  if (o.id === 'arge-recete-43') {
    o.measure = 'tur 14 (390×844): fire input value "2"/"0", 52×44, x=309; aria-label/title yok ANCAK satır başına .sr-only "Fire %" etiketi eklenmiş (4/4 satır) → ekran okuyucuda çözülüyor. Görünür (w>0,h>0) "Fire"/"%" işareti hâlâ 0 (masaüstü başlığı 390px’te w=0/h=0).';
    o.round14 = 'kısmen ilerledi (sr-only etiket eklendi), görünür etiket hedefi karşılanmadı — AÇIK';
  }
}

writeFileSync(path, JSON.stringify(card, null, 1) + '\n', 'utf8');
console.log('arge.json tur 14 güncellendi:', Object.entries(card.routes).map(([k, v]: any) => `${k}=${v.total}/${v.winner}`).join(' | '));
