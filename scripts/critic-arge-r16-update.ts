/** Tur 16 — arge kritik kartı güncellemesi (yalnızca artifacts/critic/arge.json yazar). */
import { readFileSync, writeFileSync } from 'node:fs';
const p = 'artifacts/critic/arge.json';
const card = JSON.parse(readFileSync(p, 'utf8'));
const R = 16;

const set = (route: string, patch: Record<string, unknown>) => {
  const r = card.routes[route];
  if (!r) throw new Error('route yok: ' + route);
  Object.assign(r, patch);
};

// --- /arge/projeler ---
{
  const r = card.routes['/arge/projeler'];
  r.round = R;
  r.scores = [5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 59;
  for (const o of r.open) {
    if (o.id === 'arge-projeler-08') {
      o.measure = 'tur 16 yeniden ölçüm (probe-arge-r16.json): 1440px ilk tablo satırı viewport 238px / <main> ofseti 190px (h1 ofseti 24, thead ofseti 154) — tur 4-16 birebir aynı. 390px: ilk kart <main> ofseti 258px, kart yüksekliği 63,5px. Hedef ≤112px (masaüstü).';
    }
    if (o.id === 'arge-projeler-09') {
      o.measure = 'tur 16 (1440×900): tablo para hücrelerinin 6/6 örneğinde title/aria-label/sr-only YOK; ₺31,92 ve ₺103,41 oklch(0.72 0.17 70)=warning, ₺166,17 oklch(0.21 0.006 285.9)=foreground; 6/6 tabular-nums + sağa hizalı. main.textContent içinde "hedef" sözcüğü YOK.';
    }
  }
  r.scoreNotes = 'Tur 16. Ar-Ge modülünde tur 10\'dan beri kod değişikliği yok (git log: apps/web/src/modules/rnd son dokunuş 4503d9f/tur 10); tüm ölçümler tur 15 ile birebir aynı çıktı. İki açık P2 yeniden ölçüldü, ikisi de AÇIK: (a) arge-projeler-08 (c2) ilk satır <main> ofseti 1440px 190px / 390px 258px. (b) arge-projeler-09 (c4) 6/6 para hücresinde hedef bilgisi yok, 4/6 warning. Diğer 10 kriter: sw=cw=1440 ve 390 (taşma yok), satır 36/36/36 (mobil kart 63,5px), h1 24/600 (mobil 20/600), 13px gövde + 11/12px etiket, 17 renk (mobil 16), para 6/6 tabular-nums + sağa hizalı, hover oklab(0.955 …/0.5), Tab\'da satırda 2px solid oklch(0.55 0.16 152) outline (offset -2px) ve buton/inputta accent box-shadow ring (220ms geçiş sonrası ölçüldü), 390\'da <44px etkileşimli hedef yok (yalnız breadcrumb metni 47,8×19,5), boş durum "Eşleşen kayıt yok" + ipucu + ikon. Kod taraması temiz (transition-all/ease-in/scale(0)/≥300ms yok; hover globals.css:10 @custom-variant ile (hover:hover) and (pointer:fine)\'a kilitli). Açık P0/P1 yok, toplam 59 ≥ 57 → KAZANAN: Plantero (delta 0).';
}

// --- /arge/projeler/[id]/board ---
{
  const r = card.routes['/arge/projeler/[id]/board'];
  r.round = R;
  r.scores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 60;
  r.scoreNotes = 'Tur 16. Açık bulgu yok; yeniden ölçüm tur 15 ile aynı: 1440 ve 390\'da sw=cw (yatay taşma yok — kolon şeridi kendi kabında kayıyor: iç kaydırıcı sw 1864 / cw 1152, mobil sekme şeridi 454/358), 390\'da <44px etkileşimli hedef yok (yalnız breadcrumb metni), dolu-vurgu buton 0 (kanban tamamen nötr), font kademeleri 11/13 baskın + tek h1 (1440\'ta 24/600, 390\'da 20/600), 19 renk (mobil 17). Kod taraması temiz (duration-150/200 yalnızca; transition-all/ease-in/scale(0) yok; kanban-board.tsx:248 spring duration 0.35 layout="position" — kesilebilir). Toplam 60 ≥ 57 → KAZANAN: Plantero (delta 0).';
}

// --- /arge/projeler/[id]/receteler ---
{
  const r = card.routes['/arge/projeler/[id]/receteler'];
  r.round = R;
  r.scores = [5, 5, 5, 5, 5, 4, 5, 5, 5, 5, 5, 5];
  r.total = 59;
  for (const o of r.open) {
    if (o.id === 'arge-recete-41') {
      o.measure = 'tur 16 yeniden ölçüm (probe-arge-r16.json, canvas metin genişliğiyle ilk rakamın x\'i): 1440px manuel satır ₺→"38,00" 42,7px, "Genel gider (parti)" ₺→"0,35" 48,1px; 390px manuel satır 18,7px, genel gider 108,3px. Aynı ekrandaki 11/11 salt-okunur MoneyCell\'de ₺ rakama bitişik ve tabular-nums. Hedef ≤4px.';
    }
    if (o.id === 'arge-recete-42') {
      o.measure = 'tur 16 (1440×900): background oklch(0.55 0.16 152) olan görünür buton sayısı 2 — "Yeni deneme reçetesi" 186×32, "Onaya gönder" 136×32. 390px\'te 1 ("Onaya gönder" 44×44 ikon butonu).';
    }
    if (o.id === 'arge-recete-43') {
      o.measure = 'tur 16 (390×844): satır başına .sr-only "Fire %" etiketi var (4/4 satır) → ekran okuyucuda çözülüyor; görünür (w>1,h>1) "Fire" başlığı 0 (masaüstünde 64×18 görünür, 390px\'te 1×1). Görünen tek "%" işaretleri hedef çubuğundaki "%14" ve "Verim %" alan etiketi.';
    }
  }
  r.scoreNotes = 'Tur 16. Üç açık P2 yeniden ölçüldü, üçü de AÇIK ve tur 15\'e göre değişmemiş: (a) arge-recete-41 (c6) ₺ öneki–ilk rakam arası 1440px 42,7/48,1px, 390px 18,7/108,3px (hedef ≤4px). (b) arge-recete-42 (c1) dolu-vurgu buton 1440px\'te 2. (c) arge-recete-43 (c5/mobil birim) görünür "Fire" işareti 390px\'te 0. Diğer kriterler tur 15 ile aynı: sw=cw 1440/390 (taşma yok), 390\'da <44px etkileşimli hedef yok, hedef maliyet çubuğu tek warning tonu ve "Hedef ₺28,00 · %14 hedef üstü" ekranda yazılı, salt-okunur para 11/11 tabular-nums + sağa hizalı, 21 renk (mobil 18), h1 24/600 (mobil 20/600), buton odağı accent box-shadow ring. Kod taraması temiz (cost-simulator duration-200 ease-out). Açık P0/P1 yok, toplam 59 ≥ 56 → KAZANAN: Plantero (delta 0).';
}

// --- /arge/receteler ---
{
  const r = card.routes['/arge/receteler'];
  r.round = R;
  r.scores = [5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 59;
  for (const o of r.open) {
    if (o.id === 'arge-receteler-02') {
      o.measure = 'tur 16 yeniden ölçüm: 1440px ilk tablo satırı viewport 208px / <main> ofseti 160px (h1 ofseti 24, thead 124) — tur 5-16 aynı. 390px: ilk kart <main> ofseti 172px, kart yüksekliği 63,5px. Hedef ≤112px (masaüstü).';
    }
    if (o.id === 'arge-receteler-04') {
      o.measure = 'tur 16 (1440×900): 6/6 para hücresinde title/aria/sr-only yok; ₺103,41 ve ₺31,92 warning oklch(0.72 0.17 70), ₺166,17 foreground. main.textContent içinde "hedef" YOK.';
    }
  }
  r.scoreNotes = 'Tur 16. İki açık P2 yeniden ölçüldü, ikisi de AÇIK ve DEĞİŞMEMİŞ: (a) arge-receteler-02 (c2) 1440px ilk satır <main> ofseti 160px, 390px 172px. (b) arge-receteler-04 (c4) para hücrelerinde hedef bilgisi yok. Diğer kriterler: sw=cw 1440/390, satır 36/36/36, mobil kart 63,5px, para 6/6 tabular-nums + sağa hizalı, font 12/13/24 kademeleri baskın, 21 renk (mobil 20), hover oklab(0.955 …/0.5), Tab\'da satırda 2px accent outline + butonlarda accent ring, 390\'da <44px etkileşimli hedef yok, boş durum "Eşleşen kayıt yok" + ipucu + ikon. Kod taraması temiz. Açık P0/P1 yok, toplam 59 ≥ 57 → KAZANAN: Plantero (delta 0).';
}

card.round = R;
card.updatedAt = new Date().toISOString();
writeFileSync(p, JSON.stringify(card, null, 2) + '\n');
console.log('güncellendi:', p);
