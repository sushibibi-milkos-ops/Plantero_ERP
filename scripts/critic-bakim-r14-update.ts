/**
 * Tur 14 — bakim kritik kartı güncellemesi (docs/DESIGN-SCORECARD.md).
 * Kod değişmediği için tüm açık bulgular yeniden ölçüldü; puanlar delta 0.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const path = resolve(process.cwd(), 'artifacts/critic/bakim.json');
const card = JSON.parse(readFileSync(path, 'utf8')) as any;

card.round = 14;
card.measuredAt = new Date().toISOString();
card.note =
  'Tur 14: 7 rotanın tamamı yeniden çekildi (pnpm shot) ve ölçüldü (artifacts/critic/measure-bakim-r14/*.json; scripts/probe-bakim-r14{,b,c}.ts). ' +
  'Tur 13 kartından bu yana bakim kapsamını etkileyen HİÇBİR kod değişikliği yok (git diff f893339..HEAD yalnızca ihracat/sevkiyat sayfası, packages/core stock/counts ve packages/db checks). ' +
  'DB sıfırlandığı için kayıt kimlikleri yenilendi: MK-001 = 8d445599-2fa3-4433-96a5-972be1a6f91e, MO-2026-000001 (done) = d96f2887-9da4-47b5-9e5a-efebe3a3158d, MO-2026-000006 (reported) = cb7b9e47-c88e-416f-9784-7ebad33ef5f9. ' +
  'AÇIK P0/P1 YOK; üç P2 yeniden ölçüldü ve üçü de DEĞİŞMEDİ: bakim-oee-04 (@390 KpiStripRow 792>358, 5 karttan 2 tam; /bakim/makineler 632>358, 4 karttan 2), ' +
  'bakim-oee-05 (hat tablosu decimalsPerCol OEE {1,2} · Kullanılabilirlik {0,2} · Performans {1,2} · Kalite {2}), ' +
  'bakim-isemirleri-detay-14 (done iş emrinde animationName=pulse 2s, 1 öğe; reported iş emrinde 0). ' +
  'KOD DÜZEYİ TEMİZ: 7 rotada süresi > 0 olan transition-property:all, ≥300ms süre, ease-in, scale(0) ihlali 0 (probe-bakim-r14b.ts — süre filtresi olmadan yapılan tarama CSS varsayılanı nedeniyle yanlış alarm üretir); kaynakta transition-all/scale(0)/origin-* yok; hover globals.css @custom-variant hover ile (hover:hover) and (pointer:fine) altında. ' +
  'Boş durum 3 listede de doğrulandı (0 satır + ikon + "Eşleşen kayıt yok" + "Arama ya da filtreleri değiştirmeyi deneyin."). ' +
  'Etkileşim: tıklanabilir satırlarda (makineler, iş emirleri) hover rgba(0,0,0,0) → oklab(0.955 …/0.5) ve focus-visible outline-2 -outline-offset-2 outline-ring; /bakim/planlar satırları tıklanabilir değil (sınıf: group/row h-9 border-b) — hover geri bildirimi satır arka planı yerine grup içi "…" eylem düğmesinin belirmesiyle veriliyor, bulgu değil. ' +
  'GÖZLEM (bulgu AÇILMADI): /bakim/makineler/[id] "OEE (hat geneli — HAT1)" başlığındaki büyük rakam son günün değeri (%0) iken altındaki sparkline 30 günü gösteriyor; dönem etiketi yok — ölçülebilir bir eşiğe bağlanamadığı ve rota zaten 60 ≥ 57 olduğu için nit açılmadı. ' +
  'VERİ NOTU (tasarım bulgusu DEĞİL): /bakim/makineler "Çalışma saati" 36/36 satırda 0 sa; /bakim/oee KPI "önceki dönem" deltası "— —"; iş emri olay damgalarının tamamı 13:46 iken Başlangıç 13:52 / Bitiş 15:16 — ekran veriyi doğru basıyor, çelişki seed tarafında.';

const routeNotes: Record<string, string> = {
  '/bakim/makineler':
    'Tur 14 delta 0 (59). Yeniden ölçüm (measure-bakim-r14/makineler-{1440,390}.json): satır 36,5–37px × 36 @13px, mobil kart 63,5px × 36, scrollWidth 1440=1440 / 390=390 (overflowX false), fontSizes {13:238, 11:110, 12:12}, distinctColors 17/15, h1 24px/600 (mobil 20px/600). @390 44px altı tek öğe breadcrumb "Makineler" (span, aria-current) — dokunma hedefi değil. Boş durum doğrulandı (probe-bakim-r14c.ts: 0 satır + "Eşleşen kayıt yok"). Satır hover rgba(0,0,0,0) → oklab(0.955 …/0.5). k9 4 kalır: ortak KpiStripRow @390 scrollWidth 632 > clientWidth 358 (4 karttan 2 tam görünür — bakim-oee-04 kapsamında, kök neden shell). Toplam 59 ≥ 57 → KAZANAN: Plantero.',
  '/bakim/planlar':
    'Tur 14 delta 0 (60). Yeniden ölçüm: satır 36px × 12 @13px, mobil kart 63,5px × 12, scrollWidth 1440=1440 / 390=390 (overflowX false), fontSizes {13:94, 12:21, 11:14}, distinctColors 17/15, h1 24px/600 (mobil 20px/600), @390 44px altı gerçek dokunma hedefi yok. Boş durum doğrulandı. Satırlar tıklanabilir olmadığı için satır arka planı hover almıyor (sınıf group/row h-9 border-b border-border/50); geri bildirim "…" eylem düğmesinin hover ile belirmesi — k8 5 kalır. Toplam 60 ≥ 57 → KAZANAN: Plantero.',
  '/bakim/is-emirleri':
    'Tur 14 delta 0 (60). Yeniden ölçüm: masaüstü satır 36px × 6 @13px, mobil kart 62–64,5px × 6, scrollWidth 1440=1440 / 390=390 (overflowX false), h1 24px/600 (mobil 20px/600), distinctColors 25/23. Shell aksiyon oluğu düzeltmesi regresyona girmedi: @390 mobil kart rozet sağ kenarları 6/6 kartta 313px (menüsü olan kart dahil). Satır hover/focus-visible sınıfları yerinde (cursor-pointer hover:bg-accent/50 focus-visible:outline-2 -outline-offset-2 outline-ring). Boş durum doğrulandı. Toplam 60 ≥ 57 → KAZANAN: Plantero.',
  '/bakim/is-emirleri/[id]':
    'Tur 14 delta 0 (60). Kayıt: MO-2026-000001 / d96f2887-9da4-47b5-9e5a-efebe3a3158d (db:reset sonrası yeni id). Ölçümler: scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 19/18, fontSizes {13:47, 12:24, 11:18}, h1 24px/600 (mobil 20px/600); @390 44px altı tek öğe breadcrumb "Detay" (span). Zaman çizgisi sırası Bildirildi → Yapılıyor → Tamamlandı (monoton). AÇIK P2 detay-14 yeniden ölçüldü, DEĞİŞMEDİ: done iş emrinde animationName="pulse" (2s, iterationCount infinite) olan 1 öğe, reported iş emrinde 0 — kaynak order-timeline.tsx:18 PULSE_STATUSES + :47. Toplam 60 ≥ 57 → KAZANAN: Plantero.',
  '/bakim/makineler/[id]':
    'Tur 14 delta 0 (60). Kayıt: MK-001 / 8d445599-2fa3-4433-96a5-972be1a6f91e (db:reset sonrası yeni id). Ölçümler: scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 19/18, h1 24px/600 (mobil 20px/600), fontSizes {13:37, 14:8, 12:9, 11:9}, "Son iş emirleri" satırı 44px. Sekme şeridi mobilde yatay kaydırma. Bu rotada KPI şeridi yok → k9 5. GÖZLEM (bulgu değil): "OEE (hat geneli — HAT1)" başlığındaki %0 son günün değeri; 30 günlük sparkline ile aynı satırda dönem etiketi yok. Toplam 60 ≥ 57 → KAZANAN: Plantero.',
  '/bakim/is-emirleri/yeni':
    'Tur 14 delta 0 (60). Ölçümler: scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 16/15, h1 24px/600 (mobil 20px/600), fontSizes {13:30, 14:4, 11:3}. @390 44px altı iki ölçüm de gerçek dokunma hedefi DEĞİL: breadcrumb "Yeni" (span) ve Radix Select\'in görsel dışı yerel <select>\'i (1×1px, aria-hidden). Görünen form kontrolleri ≥36px (masaüstü), mobilde tek kolon + yapışkan eylem şeridi; QR alanı otomatik odaklı, odak halkası görünür. Toplam 60 ≥ 57 → KAZANAN: Plantero.',
  '/bakim/oee':
    'Tur 14 delta 0 (58). İki açık P2 yeniden ölçüldü, ikisi de DEĞİŞMEDİ: (a) bakim-oee-05 → k6 4 kalır, decimalsPerCol OEE {1,2} · Kullanılabilirlik {0,2} · Performans {1,2} · Kalite {2}; satırlar HAT3 %0,14/%100/%0,14/%3,33 · HAT2 %0,24/%99,48/%0,26/%6,63 · HAT1 %1,2/%99,38/%1,2/%9,97 (probe-bakim-r14.ts). (b) bakim-oee-04 → k9 4 kalır, @390 KpiStripRow scrollWidth 792 > clientWidth 358, 5 karttan 2 tam görünür. Değişmeyen ölçümler: masaüstü scrollWidth 1440=1440, mobil 390=390 (overflowX false), hat tablosu satırı 36px × 3, distinctColors 17/15, h1 24px/600 (mobil 20px/600). Toplam 58 ≥ 56 (Stripe), hiçbir kriter <4, açık P0/P1 yok → KAZANAN: Plantero.',
};

const measures: Record<string, string> = {
  'bakim-oee-04':
    'Tur 14 yeniden ölçüm (scripts/probe-bakim-r14.ts, 390x844): KpiStripRow scrollWidth 792 > clientWidth 358, 5 karttan tam görünen 2 — Tur 9–13 ile birebir aynı, değişmedi. Aynı bileşen /bakim/makineler @390\'da scrollWidth 632 > clientWidth 358 (4 kart, tam görünen 2).',
  'bakim-oee-05':
    'Tur 14 yeniden ölçüm (scripts/probe-bakim-r14.ts, 1440x900): decimalsPerCol → OEE {1,2}, Kullanılabilirlik {0,2}, Performans {1,2}, Kalite {2}. 4 yüzde sütununun 3\'ü karışık — değişmedi.',
  'bakim-isemirleri-detay-14':
    'Tur 14 yeniden ölçüm (scripts/probe-bakim-r14.ts, 1440x900): MO-2026-000001 (status=done, d96f2887…) detayında main içinde animationName!=="none" olan 1 öğe → SPAN.absolute…size-2.5 ring-4 ring-background bg-primary motion-safe:animate-pulse, animationName "pulse", 2s; nabız atan olay listenin SONUNCUSU değil. Açık iş emrinde (MO-2026-000006, reported) animasyonlu öğe 0. Değişmedi.',
};

for (const [route, note] of Object.entries(routeNotes)) {
  const r = card.routes[route];
  if (!r) throw new Error(`Kartta yok: ${route}`);
  r.round = 14;
  r.scoreNotes = note;
  for (const f of r.open ?? []) {
    f.lastMeasuredRound = 14;
    if (measures[f.id]) f.measure = measures[f.id];
  }
}

writeFileSync(path, JSON.stringify(card, null, 2) + '\n', 'utf8');
console.log('bakim.json → tur 14 güncellendi');
for (const [route, r] of Object.entries<any>(card.routes)) {
  console.log(route, r.total, r.verdict, 'open:', (r.open ?? []).map((f: any) => `${f.id}(${f.severity})`).join(',') || '—');
}
