/**
 * Tur 13 — bakim kalıcı puan kartı güncellemesi (docs/DESIGN-SCORECARD.md).
 * Ölçüm kaynakları: artifacts/critic/measure-bakim-r13/*.json,
 * artifacts/critic/probe-bakim-r13.json, artifacts/critic/probe-bakim-r13b.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const p = resolve('artifacts/critic/bakim.json');
const card = JSON.parse(readFileSync(p, 'utf8'));

card.round = 13;
card.measuredAt = new Date().toISOString();
card.note =
  'Tur 13: 7 rotanın tamamı yeniden çekildi (pnpm shot) ve ölçüldü (artifacts/critic/measure-bakim-r13/*.json, ' +
  'scripts/probe-bakim-r13{,b}.ts). Tur 12\'den bu yana bakim kapsamını etkileyen tek kod değişikliği ' +
  'apps/web/src/components/data-table/mobile-cards.tsx (shell aksiyon oluğu). KAPANDI (dolaylı, shell ' +
  'shell-mobile-card-action-gutter-01 düzeltmesiyle): /bakim/is-emirleri @390 mobil kart rozet sağ kenarları ' +
  '[313,313,313,313,313,313] (Tur 12: [313,363,363,363,363,363]) → k5 4→5, toplam 59→60. AÇIK KALDI: ' +
  'bakim-oee-04 (P2, k9, ortak kpi-strip.tsx) — @390 KpiStripRow scrollWidth 792 > clientWidth 358 (5 karttan 2 tam ' +
  'görünür); /bakim/makineler\'de 632 > 358 (4 karttan 2). bakim-oee-05 (P2, k6) — "Hat bazlı OEE" tablosunda ' +
  'ondalık kümeleri OEE {1,2}, Kullanılabilirlik {0,2}, Performans {1,2}, Kalite {2}; 4 yüzde sütununun 3\'ü karışık. ' +
  'bakim-isemirleri-detay-14 (P2, k4) — kapanmış (done) iş emrinin geçmişinde "Yapılıyor" noktası hâlâ nabız atıyor ' +
  '(main içinde animationName="pulse", 2s, 1 öğe; açık iş emrinde 0). Kod taraması TEMİZ: 7 rotanın tamamında ' +
  'hesaplanmış stilde transition-property:all / ≥300ms süre / ease-in ihlali 0; kaynakta transition-all / scale(0) / ' +
  'origin-* yok; `hover:` globals.css:10-16\'da @media (hover:hover) and (pointer:fine) ile korunuyor. Boş durum 3 ' +
  'listede de doğrulandı (ikon + "Eşleşen kayıt yok" + "Arama ya da filtreleri değiştirmeyi deneyin."). Satır hover ' +
  'rgba(0,0,0,0) → oklab(.955 …/0.5); satır focus-visible outline-2 -outline-offset-2 outline-ring. VERİ NOTU ' +
  '(tasarım bulgusu DEĞİL): /bakim/makineler "Çalışma saati" 36/36 satırda 0 sa; /bakim/oee KPI "önceki dönem" ' +
  'deltası "— —" (önceki 30 günlük pencerede oee_records yok); iş emri olay damgalarının tamamı 12:42 iken ' +
  'başlangıç 12:48 / bitiş 14:12 — ekran veriyi doğru basıyor, çelişki seed tarafında. KAPSAM NOTU: /operator ' +
  'bakim modülünün rota listesinde değil (uretim kapsamı), 1024×768 çekimi bu turda yapılmadı.';

const R = card.routes as Record<string, any>;

for (const k of Object.keys(R)) R[k].round = 13;

R['/bakim/makineler'].scoreNotes =
  'Tur 13 delta 0 (59). Yeniden ölçüm (measure-bakim-r13/makineler-{1440,390}.json): satır 36,5–37px × 36 @13px, ' +
  'mobil kart 63,5px × 36, scrollWidth 1440=1440 / 390=390 (overflowX false), fontSizes {13:238, 11:110, 12:12}, ' +
  'distinctColors 17/15, h1 24px/600 (mobil 20px/600). 390px\'te 44px altı tek öğe breadcrumb "Makineler" (span, ' +
  'aria-current) — dokunma hedefi değil. Boş durum doğrulandı (probe-bakim-r13b.ts). k9 4 kalır: bakim-oee-04 ' +
  'kapsamında ortak KpiStripRow @390 scrollWidth 632 > clientWidth 358 (4 karttan 2\'si tam görünür, probe-bakim-r13.ts). ' +
  'Toplam 59 ≥ 57, hiçbir kriter <4, açık P0/P1 yok → KAZANAN: Plantero.';

R['/bakim/planlar'].scoreNotes =
  'Tur 13 delta 0 (60). Yeniden ölçüm: satır 36px × 12 @13px, mobil kart 63,5px × 12, scrollWidth 1440=1440 / ' +
  '390=390 (overflowX false), fontSizes {13:94, 12:21, 11:14}, distinctColors 17/15, h1 24px/600 (mobil 20px/600), ' +
  '390px\'te 44px altı gerçek dokunma hedefi yok. Boş durum doğrulandı. Toplam 60 ≥ 57 → KAZANAN: Plantero.';

R['/bakim/is-emirleri'].scores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
R['/bakim/is-emirleri'].total = 60;
R['/bakim/is-emirleri'].scoreNotes =
  'Tur 13 delta (+1): k5 4→5. Gerekçe: shell-mobile-card-action-gutter-01 düzeltmesi (mobile-cards.tsx, commit ' +
  '27f3d9a) yürürlükte — @390 mobil kart rozet sağ kenarları 6/6 kartta 313px (Tur 12: 5 kart 363, 1 kart 313); ' +
  'menüsüz kartlar gerçek butonla aynı kutuda görünmez yer tutucu alıyor, rozet sütunu artık tırtıklı değil ' +
  '(scripts/probe-bakim-r13.ts). Ölçümler: masaüstü satır 36px × 6, mobil kart 62–64,5px × 6, scrollWidth ' +
  '1440=1440 / 390=390 (overflowX false), h1 24px/600 (mobil 20px/600), distinctColors 25/23. Etkileşim: satır ' +
  'hover rgba(0,0,0,0) → oklab(0.955 …/0.5), satır focus-visible outline-2 -outline-offset-2 outline-ring ' +
  '(probe-bakim-r13b.ts). Boş durum doğrulandı. Toplam 60 ≥ 57 → KAZANAN: Plantero.';

R['/bakim/is-emirleri/[id]'].scoreNotes =
  'Tur 13 delta 0 (60). Kayıt: MO-2026-000001 / e310fac1-bb23-458d-8834-fc4cfbee0b9b (db:reset sonrası yeni id). ' +
  'Ölçümler: scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 19/18, fontSizes {13:47, 12:24, 11:18}, ' +
  'h1 24px/600 (mobil 20px/600); 390px\'te 44px altı tek öğe breadcrumb "Detay" (span). Zaman çizgisi sırası ' +
  'Bildirildi → Yapılıyor → Tamamlandı (monoton, Tur 12\'de kapatılan detay-13 regresyona girmedi). AÇIK P2 ' +
  'detay-14 yeniden ölçüldü ve değişmedi: done iş emrinde animationName="pulse" (2s) olan 1 öğe, açık (reported) ' +
  'iş emrinde 0 — kaynak order-timeline.tsx:19+:47 PULSE_STATUSES koşulu hâlâ olayın son olay / güncel durum ' +
  'olmasına bakmıyor. P2 kazanmayı engellemez → KAZANAN: Plantero.';

R['/bakim/makineler/[id]'].scoreNotes =
  'Tur 13 delta 0 (60). Kayıt: MK-001 / e9446ff8-da45-418f-be58-5905fd4546c1 (db:reset sonrası yeni id). Ölçümler: ' +
  'scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 19/18, h1 24px/600 (mobil 20px/600), fontSizes ' +
  '{13:37, 14:8, 12:9, 11:9}, "Son iş emirleri" satırı 44px. Sekme şeridi mobilde yatay kaydırma + kenar soldurma; ' +
  '390px\'te 44px altı tek öğe breadcrumb "Detay" (span). Bu rotada KPI şeridi yok → k9 5. Boş bölüm metinleri ' +
  'yerinde ("Duruş kaydı yok."), boş alanlar "Boş alanları göster (4)" ile varsayılan gizli. Toplam 60 ≥ 57 → ' +
  'KAZANAN: Plantero.';

R['/bakim/is-emirleri/yeni'].scoreNotes =
  'Tur 13 delta 0 (60). Ölçümler: scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 16/15, ' +
  'h1 24px/600 (mobil 20px/600), fontSizes {13:30, 14:4, 11:3}. 390px\'te 44px altı iki ölçüm de gerçek dokunma ' +
  'hedefi DEĞİL: breadcrumb "Yeni" (span) ve Radix Select\'in görsel dışı yerel <select>\'i (1×1px, aria-hidden, ' +
  'tabIndex=−1). Görünen form kontrollerinin tamamı ≥36px (masaüstü) ve mobilde tek kolon + yapışkan eylem şeridi. ' +
  'QR alanı otomatik odaklı ve odak halkası görünür. Toplam 60 ≥ 57 → KAZANAN: Plantero.';

R['/bakim/oee'].scoreNotes =
  'Tur 13 delta 0 (58). İki açık P2 yeniden ölçüldü, ikisi de DEĞİŞMEDİ: (a) bakim-oee-05 → k6 4 kalır, ' +
  'decimalsPerCol OEE {1,2} · Kullanılabilirlik {0,2} · Performans {1,2} · Kalite {2}; satırlar HAT3 %0,14/%100/' +
  '%0,14/%3,33 · HAT2 %0,24/%99,48/%0,26/%6,63 · HAT1 %1,2/%99,38/%1,2/%9,97 (probe-bakim-r13.ts). (b) bakim-oee-04 ' +
  '→ k9 4 kalır, @390 KpiStripRow scrollWidth 792 > clientWidth 358, 5 karttan 2 tam görünür. Değişmeyen ölçümler: ' +
  'masaüstü scrollWidth 1440=1440, mobil 390=390 (overflowX false), hat tablosu satırı 36px × 3, distinctColors ' +
  '17/15, h1 24px/600 (mobil 20px/600). YANLIŞ ALARM (bulgu AÇILMADI): OEE trend grafiğinde "Kalite" ve "Performans" ' +
  'çizgileri gözle benzer görünüyor ama ölçümde ayrışıyorlar — dash 1px,3px vs 4px,3px ve alfa 0.4 vs 0.62 ' +
  '(oeeChartLines) → k5 5 kalır. Toplam 58 ≥ 56 (Stripe), hiçbir kriter <4, açık P0/P1 yok → KAZANAN: Plantero.';

// Açık bulguların Tur 13 yeniden ölçümleri
const remeasure: Record<string, string> = {
  'bakim-oee-04':
    'Tur 13 yeniden ölçüm (scripts/probe-bakim-r13.ts, 390x844): KpiStripRow scrollWidth 792 > clientWidth 358, ' +
    '5 karttan tam görünen 2 — Tur 9/10/11/12 ile birebir aynı, değişmedi. Aynı bileşen /bakim/makineler @390\'da ' +
    'scrollWidth 632 > clientWidth 358 (4 kart, tam görünen 2).',
  'bakim-oee-05':
    'Tur 13 yeniden ölçüm (scripts/probe-bakim-r13.ts, 1440x900): decimalsPerCol → OEE {1,2}, Kullanılabilirlik ' +
    '{0,2}, Performans {1,2}, Kalite {2}. 4 yüzde sütununun 3\'ü karışık — değişmedi. Kaynak doğrulandı: ' +
    'oee/page.tsx hat tablosunda 4 yüzde hücresi de formatPct() kullanıyor.',
  'bakim-isemirleri-detay-14':
    'Tur 13 yeniden ölçüm (scripts/probe-bakim-r13.ts, 1440x900): MO-2026-000001 (status=done) detayında main ' +
    'içinde animationName!=="none" olan 1 öğe → SPAN.absolute…size-2.5 ring-4 ring-background bg-primary ' +
    'motion-safe:animate-pulse, animationName "pulse", 2s; olay sırası Bildirildi → Yapılıyor → Tamamlandı, nabız ' +
    'atan olay SON olay değil. Açık iş emrinde (MO-2026-000006, reported) animasyonlu öğe 0. Değişmedi.',
};

for (const route of Object.values(R)) {
  for (const f of (route as any).open ?? []) {
    if (remeasure[f.id]) f.measure = remeasure[f.id];
    f.lastMeasuredRound = 13;
  }
}

writeFileSync(p, JSON.stringify(card, null, 2) + '\n');
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(R).map(([k, v]: [string, any]) => [
        k,
        { total: v.total, ref: v.referenceTotal, verdict: v.verdict, open: (v.open ?? []).map((o: any) => `${o.id}:${o.severity}`) },
      ]),
    ),
    null,
    2,
  ),
);
