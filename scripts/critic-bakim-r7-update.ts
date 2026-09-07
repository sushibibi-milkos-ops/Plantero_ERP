/** Tur 7 — gorsel-critic /bakim puan kartı güncellemesi (docs/DESIGN-SCORECARD.md). */
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'artifacts/critic/bakim.json';
const card = JSON.parse(readFileSync(path, 'utf8'));

card.round = 7;
card.measuredAt = '2026-09-07';
card.note = [
  'Tur 7 — gorsel-critic. Tur 6 sonrası builder düzeltmeleri (ad5fa7c) yeniden ölçüldü.',
  'KAPANANLAR (ölçümle doğrulandı): bakim-oee-10 — /bakim/oee @390 açılışta aktif nokta 4→0 (3/3 tekrar, hasTouch+isMobile bağlamı, scripts/probe-bakim-r7d.ts); bakim-oee-11 — "Hat bazlı OEE" sarmalayıcısı artık scrollbar-thin scroll-fade-x (sw 588 > cw 324 ama standart kaydırma göstergesiyle işaretli); bakim-yeni-04 — /bakim/is-emirleri/yeni @390 ölü kaydırma 338→80px, kaydırma sonunda eylem çubuğu alt gezinmenin 23px üstünde (scripts/probe-bakim-r7c.ts, artifacts/critic/bakim-r7-yeni-390-bottom.png).',
  'YENİ (P1): /bakim/is-emirleri/[id] — fotoğrafı olan iş emrinde (MO-2026-000002) "Fotoğraflar" kartı 1×1 px siyah PNG yer tutucusunu object-cover ile 269×269 (masaüstü) / 154×154 (390px) opak siyah kareye ölçekliyor. Tur 6 fotoğrafsız MO-2026-000006 üzerinde ölçüldüğü için görülmemişti.',
  'AÇIK KALAN P2: bakim-oee-12 (OEE trendinde en üst seri ile grafik üst kenarı arasında pay 0px — gridTop 4 = curve y 4, her iki viewport), bakim-oee-04 (KPI şeridi @390: /bakim/oee 5 karttan 2\'si, /bakim/makineler 4 karttan 2\'si tam görünüyor — ortak bileşen kpi-strip.tsx).',
  'Kod düzeyi tarama TEMİZ: apps/web/src/modules/maintenance + app/(app)/bakim içinde transition-all / "transition: all" / ease-in / duration>300ms / scale(0) / origin-* yok; hover globals.css:10 @custom-variant ile (hover:hover) and (pointer:fine) altında.',
  'Not: görevdeki /operator rotası uygulamada yok (apps/web/src/app/(app) altında operator dizini bulunmuyor) — 1024×768 çekimi yapılamadı.',
].join(' ');

type Finding = Record<string, unknown>;
const R = card.routes as Record<string, { round: number; scores: number[]; total: number; verdict: string; scoreNotes: string; open: Finding[]; closed: Finding[] }>;

function set(route: string, scores: number[], verdict: string, notes: string) {
  const r = R[route];
  r.round = 7;
  r.scores = scores;
  r.total = scores.reduce((a, b) => a + b, 0);
  r.verdict = verdict;
  r.scoreNotes = notes;
}
function close(route: string, id: string, measureAfter: string, fixNote: string) {
  const r = R[route];
  const i = r.open.findIndex((o) => o.id === id);
  if (i < 0) return;
  const [f] = r.open.splice(i, 1);
  Object.assign(f as object, { closedRound: 7, verifiedBy: 'ölçüm (scripts/probe-bakim-r7*.ts + pnpm measure, Tur 7)', measureAfter, fixNote });
  r.closed.push(f);
}

// --- /bakim/makineler
set('/bakim/makineler', [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  'KAZANAN: Plantero — 60 ≥ 57, hiçbir kriter < 4, açık P0/P1 yok.',
  'Tur 7 delta (0). Yeniden ölçüm: satır 36.5–37px × 36 @13px, mobil kart 63.5px (56–72 bandı), scrollWidth 1440=1440 / 390=390 (overflowX false), fontSizes {13:238, 11:110, 12:12} = 3 kademe, distinctColors 17/15, h1 24px/600 (mobil 20px/600), 390px\'te 44px altı görünür dokunma hedefi yok. KPI şeridi @390 4 karttan 2\'si tam görünüyor — ortak bileşen (kpi-strip.tsx), bakim-oee-04 (P2) altında bir kez izleniyor, burada tekrar açılmadı.');

// --- /bakim/planlar
set('/bakim/planlar', [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  'KAZANAN: Plantero — 60 ≥ 57, hiçbir kriter < 4, açık P0/P1 yok.',
  'Tur 7 delta (0). Yeniden ölçüm: satır 36px × 12, mobil kart 63.5px, scrollWidth 1440=1440 / 390=390, fontSizes {13:94, 12:21, 11:14}, distinctColors 17/15, h1 24px/600. Mobil kartlarda alt satır metni ile sağa hizalı değer arasındaki boşluk < 8px olan çift yok (scripts/probe-bakim-r7.ts cardGaps = []) — kırpma ellipsis ile, çakışma yok.');

// --- /bakim/is-emirleri
set('/bakim/is-emirleri', [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  'KAZANAN: Plantero — 60 ≥ 57, hiçbir kriter < 4, açık P0/P1 yok.',
  'Tur 7 delta (0). Yeniden ölçüm: satır 36px × 6, mobil kart 62–64.5px, scrollWidth 1440=1440 / 390=390, distinctColors 25/23 (alfa varyantları dahil; hue ailesi 4: nötr/yeşil/amber/kırmızı — Tür sütunu nötr kaldı), h1 24px/600, 390px\'te 44px altı görünür dokunma hedefi yok.');

// --- /bakim/makineler/[id]
set('/bakim/makineler/[id]', [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  'KAZANAN: Plantero — 60 ≥ 57, hiçbir kriter < 4, açık P0/P1 yok.',
  'Tur 7 delta (0). MK-001 (fa4499ea) üzerinde ölçüldü: scrollWidth 1440=1440 / 390=390, emptyBelow -9 (ana sütun dolu), distinctColors 19/18, h1 24px/600, fontSizes {13:37, 12:9, 11:9, 14:8}, 390px\'te 44px altı görünür dokunma hedefi yok, sekmeler h-11 (44px) ve mobilde yatay kaydırma göstergesiyle.');

// --- /bakim/is-emirleri/yeni  (bakim-yeni-04 kapandı → k2 4→5, k9 4→5)
set('/bakim/is-emirleri/yeni', [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  'KAZANAN: Plantero — 60 ≥ 57, hiçbir kriter < 4, açık P0/P1 yok.',
  'Tur 7 delta (+2): k2 4→5 ve k9 4→5 — bakim-yeni-04 kapandı. @390 kaydırma sonunda (scrollY 70 = maxScroll) son akış içeriği y=764\'te bitiyor, sticky eylem çubuğu 691–764, alt gezinme 787–844 → aradaki pay 23px, ölü kaydırma 338→80px (scripts/probe-bakim-r7c.ts). Form artık kendi pb-[9rem]\'ini taşımıyor. Diğer ölçümler: scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 16/15, h1 24px/600 (mobil 20px/600), fontSizes {13:30, 14:4, 11:3} = 3 kademe, 390px\'te 44px altı görünür dokunma hedefi yok (yalnızca FormSelect\'in 1×1 gizli native <select>\'i — ortak bileşen, görünmez). Sticky eylem çubuğunun -mx-4 tam-genişlik taşması form kutusunun scrollWidth\'ini 374 yapıyor ama belge kökünde taşma yok (390=390) ve kırpılan içerik yok — bulgu açılmadı.');

// --- /bakim/oee  (bakim-oee-10 kapandı → k8 4→5; oee-12 ve oee-04 P2 açık kaldı)
set('/bakim/oee', [5, 5, 5, 5, 4, 5, 5, 5, 4, 5, 5, 5],
  'KAZANAN: Plantero — 58 ≥ 56, hiçbir kriter < 4, açık P0/P1 yok (kalan iki bulgu P2).',
  'Tur 7 delta (+1): k8 4→5 — bakim-oee-10 kapandı: @390 (hasTouch+isMobile) açılışta activeDots 0, 3/3 tekrar; @1440 de 0 (scripts/probe-bakim-r7d.ts). k5 4 KALDI: bakim-oee-12 yeniden ölçüldü, değişmedi — en üst gridline y=4, en üst seri eğrisi bbox y=4 → pay 0px (her iki viewport). k9 4 KALDI: bakim-oee-11 kapandı (Hat bazlı OEE sarmalayıcısı artık scrollbar-thin scroll-fade-x, sw 588 / cw 324) ama bakim-oee-04 açık — KPI şeridi @390 sw 792 / cw 358, 5 karttan yalnızca 2\'si tam görünüyor (ortak bileşen kpi-strip.tsx). Diğer ölçümler: satır 36px × 3, scrollWidth 1440=1440 / 390=390, emptyBelow 26 @1440, distinctColors 17/15, h1 24px/600, hat çipleri @390 h-11 (44px), tüm sayılar tabular-nums.');

// --- /bakim/is-emirleri/[id]  (yeni P1 → k12 5→4)
set('/bakim/is-emirleri/[id]', [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 4],
  'KAZANAN: Linear — toplam 59 ≥ 57 ve hiçbir kriter < 4, ama 1 açık P1 var (bakim-isemirleri-06); kazanma kuralı: açık P0/P1 yok.',
  'Tur 7 delta (−1): k12 5→4 — YENİ bulgu bakim-isemirleri-06. Tur 6 fotoğrafsız MO-2026-000006 üzerinde ölçülmüştü; bu tur fotoğraflı MO-2026-000002 (8ac32a70) ölçüldü ve "Fotoğraflar (1)" kartı 1×1 px siyah PNG yer tutucusunu object-cover ile 269×269 px opak siyah kareye (mobilde 154×154) ölçeklerken yakalandı — sayfanın en büyük tek görsel öğesi bozuk bir blok gibi okunuyor. Diğer ölçümler değişmedi: scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 21/20, h1 24px/600 (mobil 20px/600), fontSizes {13:46, 12:23, 11:15} = 3 kademe, 390px\'te 44px altı görünür dokunma hedefi yok, "Boş alanları göster (9)" ile alan gürültüsü kapalı, olay geçmişi ve belge zinciri dolu.');

close('/bakim/oee', 'bakim-oee-11', '', '');

(R['/bakim/is-emirleri/[id]'].open ||= []).push({
  id: 'bakim-isemirleri-06',
  criterion: 12,
  severity: 'P1',
  text: '"Fotoğraflar" kartı, seed\'in 1×1 px siyah PNG yer tutucusunu (packages/db/src/seed/maintenance.ts:149 PLACEHOLDER_PHOTO) `aspect-square` + `object-cover` ile büyütüyor: masaüstünde 269×269, 390px\'te 154×154 opak siyah kare. Sayfanın en büyük tek görsel öğesi bozuk/boş bir blok gibi görünüyor; gerçek fotoğraf ile yer tutucu arasında görsel ayrım yok.',
  measure: 'Tur 7 @1440x900 ve @390x844 (scripts/probe-bakim-r7b.ts / probe-bakim-r7.ts, MO-2026-000002): img naturalWidth×naturalHeight = 1×1, render 269×269 (masaüstü) / 154×154 (390px), src data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB… (1×1 siyah)',
  target: 'Yer tutucu görsel siyah kare basmasın: (a) render tarafında naturalWidth ≤ 8px olan görsel için ikon+dosya adı yer tutucu döşemesi (bg-muted, Camera 16px, 11px muted dosya adı, object-cover yok) ya da (b) seed\'de gerçek boyutlu (≥ 320×320) örnek JPEG. Kabul: fotoğraf döşemesinde tek renk (siyah) piksel oranı < %90.',
  file: 'apps/web/src/modules/maintenance/components/order-detail.tsx:174-187 (Image fill unoptimized object-cover) + packages/db/src/seed/maintenance.ts:149 (PLACEHOLDER_PHOTO)',
  openedRound: 7,
});

writeFileSync(path, `${JSON.stringify(card, null, 1)}\n`, 'utf8');
console.log('güncellendi:', path);
for (const [k, v] of Object.entries(R)) console.log(k, v.total, JSON.stringify(v.scores), 'open:', v.open.length);
