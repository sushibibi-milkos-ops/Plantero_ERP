/** Tur 8 kritik — artifacts/critic/bakim.json güncellemesi (docs/DESIGN-SCORECARD.md). */
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'artifacts/critic/bakim.json';
type Finding = Record<string, unknown>;
type Route = { round: number; scores: number[]; total: number; reference: string; open: Finding[]; closed: Finding[]; scoreNotes?: string };
const card = JSON.parse(readFileSync(path, 'utf8')) as { routes: Record<string, Route> };

const set = (r: string, scores: number[], notes: string) => {
  const route = card.routes[r]!;
  route.round = 8;
  route.scores = scores;
  route.total = scores.reduce((a, b) => a + b, 0);
  route.scoreNotes = notes;
};

const M = 'Tur 8 yeniden ölçüm (artifacts/critic/measure-bakim-r8/*.json)';

set('/bakim/makineler', [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  `${M}: satır 36,5–37px × 36 @13px, mobil kart 63,5px (56–72 bandı), scrollWidth 1440=1440 / 390=390 (overflowX false), fontSizes {13:238, 11:110, 12:12}, distinctColors 17/15, h1 24px/600 (mobil 20px/600), 390px'te 44px altı görünür dokunma hedefi yok, mobil kartlarda <8px boşluklu metin çifti yok (scripts/probe-bakim-r8c.ts tight=[]). Delta 0. KPI şeridi @390 4 karttan 2'si tam görünüyor — ortak bileşen (kpi-strip.tsx), bakim-oee-04 (P2) altında bir kez izleniyor.`);

set('/bakim/planlar', [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  `${M}: satır 36px × 12, mobil kart 63,5px, scrollWidth 1440=1440 / 390=390, fontSizes {13:94, 12:21, 11:14}, distinctColors 17/15, h1 24px/600. Mobil kartlarda <8px boşluklu metin çifti yok (probe-bakim-r8c.ts tight=[]). Delta 0.`);

set('/bakim/is-emirleri', [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  `${M}: satır 36px × 6 (tr class h-9 + hover:bg-accent/50 + focus-visible:outline-2 outline-ring, tabindex=0 — kriter 8 doğrulandı, scripts/probe-bakim-r8e.ts), mobil kart 62–64,5px, scrollWidth 1440=1440 / 390=390, distinctColors 25/23, h1 24px/600. Delta 0.`);

set('/bakim/makineler/[id]', [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  `${M}: MK-001 (ded6686c) üzerinde ölçüldü — scrollWidth 1440=1440 / 390=390, distinctColors 19/18, h1 24px/600 (mobil 20px/600), fontSizes {13:37, 12:9, 11:9, 14:8}, sekmeler 44px ve mobilde yatay kaydırma soldurmasıyla, 390px'te 44px altı görünür dokunma hedefi yok. Delta 0.`);

set('/bakim/is-emirleri/[id]', [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  `Tur 8 delta (+1): k12 4→5 — bakim-isemirleri-06 kapandı ve bağımsız doğrulandı. MO-2026-000001 (2 fotoğraflı, en kötü durum) üzerinde ölçüldü: sayfada <img> yok (measure images=0), "Fotoğraflar (2)" döşemeleri bg-muted zemin + 16px Camera ikonu + 11px dosya adı ("ariza-mk005-1.png") + 11px zaman damgası; opak siyah blok yok (artifacts/screens/bakim-is-emirleri-208a5535-6972-4f54-998e-ac73c325f03c/{desktop,mobile}.png). Diğer ölçümler: scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 19/18, h1 24px/600 (mobil 20px/600), fontSizes {13:47, 12:24, 11:18}, 390px'te 44px altı görünür dokunma hedefi yok.`);

set('/bakim/is-emirleri/yeni', [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  `${M}: scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 16/15, h1 24px/600 (mobil 20px/600), fontSizes {13:30, 14:4, 11:3}, 390px'te 44px altı görünür dokunma hedefi yalnızca FormSelect'in 1×1 gizli native <select>'i (ortak bileşen, görünmez). Delta 0.`);

// --- /bakim/oee ---
const oee = card.routes['/bakim/oee']!;
oee.open.push({
  id: 'bakim-oee-13',
  criterion: 5,
  severity: 'P1',
  text: 'OEE trend grafiğinin Y ekseni yüzde metriğinin tanım üst sınırını aşıyor: en üst tick %150. bakim-oee-12 düzeltmesi (niceTicks girdisine max×1,05 eklenmesi) 104,6 değerini 50 adımlı "nice" ölçekte 150\'ye yuvarladı; çizim alanının üçte biri hiçbir zaman veri alamayacak bir bölgeye ayrılmış durumda ve dört serinin üçü alt %22\'lik şeride eziliyor.',
  measure: 'Tur 8 (scripts/probe-bakim-r8.ts), 1440×900 ve 390×844\'te aynı: yTicks = ["%0","%50","%100","%150"]; gridline y = 233,5 (%0) / 157 (%50) / 80,5 (%100) / 4 (%150); çizim bandı 229,5px. En üst seri (Kullanılabilirlik %99,6) top=80,5 → üstünde 76,5px ölü bant = bandın %33,3\'ü. OEE (top 225,7), Performans (225,7) ve Kalite (182,5) serilerinin tamamı y=182,5–233,5 aralığında = bandın %22\'si.',
  target: 'Yüzde ekseninde en üst tick ≤ %100 ve en üst serinin üstündeki ölü bant ≤ çizim bandının %15\'i (≤ ~34px). Örn. ticks=[0,25,50,75,100] + domain=[0,100]; üst pay domain şişirerek değil AreaChart margin.top=8 ile verilir.',
  file: 'apps/web/src/modules/maintenance/components/oee-charts.tsx:90-108 (niceTicks([...rawValues, max*1.05], 5) + YAxis ticks/domain)',
  openedRound: 8,
});
set('/bakim/oee', [5, 5, 5, 5, 4, 5, 5, 5, 4, 5, 5, 5],
  `Tur 8 delta (0). k5 4 KALDI: bakim-oee-12 kapandı ve doğrulandı (gridTop 4, en üst seri y=80,5 → pay 76,5px ≥ 8px hedefi) ama aynı kriterde YENİ P1 bulgu bakim-oee-13 açıldı — düzeltme, üst payı Y domainini %150'ye şişirerek verdi; yüzde ekseninde %150 tick'i ve çizim bandının %33,3'ü ölü alan. k9 4 KALDI: bakim-oee-04 hâlâ açık — KPI şeridi @390 scrollWidth 792 / clientWidth 358, 5 karttan yalnızca 2'si tam görünüyor (152px kart × 5, ortak bileşen kpi-strip.tsx; scripts/probe-bakim-r8b.ts). Diğer ölçümler: satır 36px × 3, scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 17/15, h1 24px/600 (mobil 20px/600), fontSizes {13:43, 11:37, 12:11}, seri ayrımı 1 vurgu + 3 nötr alfa/kesik-çizgi kademesi (chart-1 solid 2px / muted 90% solid / muted 62% dash 4-3 / muted 40% dash 1-3).`);

writeFileSync(path, JSON.stringify(card, null, 2) + '\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(card.routes).map(([k, v]) => [k, { round: v.round, total: v.total, open: v.open.map((o) => `${o.id}/${o.severity}`) }])), null, 1));
