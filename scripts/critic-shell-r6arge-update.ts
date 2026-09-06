/** Ar-Ge tur 6 kritiği: ortak bileşen (DataTable mobil kart meta ayracı) bulgusu — shell.json'a bir kez yazılır. */
import { readFileSync, writeFileSync } from 'node:fs';
const p = 'artifacts/critic/shell.json';
const d = JSON.parse(readFileSync(p, 'utf8'));
const key = 'DataTable mobil kart meta satırı (tüm modüller, 390px)';
const r = d.routes[key];
const id = 'shell-mobile-card-meta-gap-01';
if (!r.open.some((o: any) => o.id === id) && !r.closed.some((c: any) => c.id === id)) {
  r.open.push({
    id,
    criterion: 1,
    severity: 'P2',
    text: '[ar-ge Tur 6 tespiti — ortak bileşen] shell-mobile-card-meta-clip-01 düzeltmesi alt başlığı ve meta zincirini İKİ AYRI kutuya böldü; meta zincirinin " · " ayracındaki SOL boşluk kutu sınırında çöküyor (overflow-hidden + whitespace-nowrap). Ekranda "Şekersiz Protein· v1" görünüyor — nokta ada yapışık, ardından boşluk. Ayraç simetrisi bozuk.',
    measure: '390x844, /arge/receteler, .mobile-card-subtitle-row 3/3 kartta: alt başlık kutusu right = meta kutusu left (118,8 / 106,8 / 84,3) → gap 0px; ekran görüntüsü artifacts/screens/arge-receteler/mobile.png',
    target: 'Ayracın iki yanındaki optik boşluk eşit: meta kutusuna `ml-1` (4px) ya da satıra `gap-1` verilip ayracın baştaki boşluğu kaldırılır; ölçüm: subtitle kutusu right ile meta kutusu left arası 3–5px, DOM metni "Ad · v1".',
    file: 'apps/web/src/components/data-table/mobile-cards.tsx (leftBits: subtitle kutusu + meta zinciri kutusu, satır ~131 leadingSeparator)',
    openedRound: 24,
  });
  d.round = Math.max(d.round ?? 0, 24);
  writeFileSync(p, JSON.stringify(d, null, 1) + '\n');
  console.log('shell.json: ' + id + ' açıldı');
} else {
  console.log('shell.json: bulgu zaten kayıtlı, değişiklik yok');
}
