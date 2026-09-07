/** Tur 15 kritik kartı güncellemesi — artifacts/critic/bakim.json (docs/DESIGN-SCORECARD.md). */
import { readFileSync, writeFileSync } from 'node:fs';

const p = 'artifacts/critic/bakim.json';
const card = JSON.parse(readFileSync(p, 'utf8')) as any;
const R = 15;

const notes: Record<string, string> = {
  '/bakim/makineler':
    'Tur 15 delta 0 (59). Tur 14\'ten bu yana apps/web altında bakım/shell kaynaklı hiçbir değişiklik yok (git diff 057d76c..HEAD -- apps/web boş); tüm kriterler yine de yeniden ölçüldü. measure-bakim-r15/makineler-{1440,390}.json: satır 36,5–37px × 36 @13px, mobil kart 63,5px × 36, scrollWidth 1440=1440 / 390=390 (overflowX false), fontSizes {13:230, 11:110, 12:12}, distinctColors 18/15, h1 24px/600 (mobil 20px/600). @390 44px altı tek öğe breadcrumb "Makineler" (span, aria-current) — dokunma hedefi değil. Boş durum yeniden doğrulandı (arama "zzzyokk" → görünür satır 0 + "Eşleşen kayıt yok / Arama ya da filtreleri değiştirmeyi deneyin."). k9 4 kalır: ortak KpiStripRow @390 scrollWidth 632 > clientWidth 358, 4 karttan 2 tam görünür (probe-r15.json kpi_makineler) — kök neden shell, bakim-oee-04 kapsamında izleniyor. Toplam 59 ≥ 57 → KAZANAN: Plantero.',
  '/bakim/planlar':
    'Tur 15 delta 0 (60). Yeniden ölçüm: satır 36px × 12 @13px, mobil kart 63,5px × 12, scrollWidth 1440=1440 / 390=390 (overflowX false), fontSizes {13:86, 12:21, 11:14}, distinctColors 17/15, h1 24px/600 (mobil 20px/600); @390 44px altı gerçek dokunma hedefi yok. Boş durum yeniden doğrulandı (görünür satır 0 + "Eşleşen kayıt yok"). Toplam 60 ≥ 57 → KAZANAN: Plantero.',
  '/bakim/is-emirleri':
    'Tur 15 delta 0 (60). Yeniden ölçüm: masaüstü satır 36px × 6 @13px, mobil kart 62–64,5px × 6, scrollWidth 1440=1440 / 390=390 (overflowX false), h1 24px/600 (mobil 20px/600), distinctColors 25/23. Satır işaretlemesi yerinde: tr.group/row h-9 border-b border-border/50 cursor-pointer hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-2 -outline-offset-2 outline-ring; hover globals.css:10 @custom-variant ile (hover:hover) and (pointer:fine) altında kapılı. Boş durum yeniden doğrulandı. Toplam 60 ≥ 57 → KAZANAN: Plantero.',
  '/bakim/is-emirleri/[id]':
    'Tur 15 delta 0 (60). Kayıt: MO-2026-000001 / 7ffa56f8-fb7b-4867-8c0f-d541b7818736. Ölçümler: scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 20/19, fontSizes {13:39, 12:24, 11:18}, h1 24px/600 (mobil 20px/600); @390 44px altı tek öğe breadcrumb "Detay" (span). AÇIK P2 detay-14 yeniden ölçüldü, DEĞİŞMEDİ: done iş emrinde animationName="pulse" (2s) olan 1 öğe (probe-bakim-r15.ts doneOrderAnimations), kaynak order-timeline.tsx:18 PULSE_STATUSES + :47. GÖZLEM (bulgu değil): olay geçmişindeki üç olayın saati de 14:39 iken üst alanlarda Başlangıç 14:45 / Bitiş 16:09 yazıyor — audit kaynaklı veri tutarsızlığı, tasarım kriteri değil; veri kritiğine ait. Toplam 60 ≥ 57 → KAZANAN: Plantero.',
  '/bakim/makineler/[id]':
    'Tur 15 delta 0 (60). Kayıt: MK-001 / dc3de58c-4baa-437f-bb5b-8d2d4b6aadc3. Ölçümler: scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 19/18, h1 24px/600 (mobil 20px/600), fontSizes {13:29, 14:8, 12:9, 11:9}, "Son iş emirleri" satırı 44px. Bu rotada KPI şeridi yok → k9 5. GÖZLEM (Tur 14 ile aynı, bulgu değil): "OEE (hat geneli — HAT1)" başlığının sağındaki %0 son günün değeri; 30 günlük sparkline ile aynı satırda dönem etiketi yok. Toplam 60 ≥ 57 → KAZANAN: Plantero.',
  '/bakim/is-emirleri/yeni':
    'Tur 15 delta 0 (60). Ölçümler: scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 16/15, h1 24px/600 (mobil 20px/600), fontSizes {13:22, 14:4, 11:3}. @390 44px altı iki ölçüm de gerçek dokunma hedefi DEĞİL: breadcrumb "Yeni" (span) ve Radix Select\'in görsel dışı yerel <select>\'i (1×1px, aria-hidden). Mobilde tek kolon, QR alanı otomatik odaklı (odak halkası görünür), yapışkan eylem şeridi (Vazgeç / Arızayı bildir) alt gezinmenin üstünde. Toplam 60 ≥ 57 → KAZANAN: Plantero.',
  '/bakim/oee':
    'Tur 15 delta 0 (58). İki açık P2 yeniden ölçüldü, ikisi de DEĞİŞMEDİ: (a) bakim-oee-05 → k6 4 kalır, decimalsPerCol OEE {2,1} · Kullanılabilirlik {0,2} · Performans {2,1} · Kalite {2}; satırlar HAT3 %0,14/%100/%0,14/%3,33 · HAT2 %0,24/%99,48/%0,26/%6,63 · HAT1 %1,2/%99,38/%1,2/%9,97 (probe-bakim-r15.ts oeeDecimals). (b) bakim-oee-04 → k9 4 kalır, @390 KpiStripRow scrollWidth 792 > clientWidth 358, 5 karttan 2 tam görünür. Değişmeyen ölçümler: hat tablosu satırı 36px × 3, scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 17/15, h1 24px/600 (mobil 20px/600). Toplam 58 ≥ 56 (Stripe), hiçbir kriter <4, açık P0/P1 yok → KAZANAN: Plantero.',
};

const measures: Record<string, string> = {
  'bakim-isemirleri-detay-14':
    'Tur 15 yeniden ölçüm (scripts/probe-bakim-r15.ts, 1440x900): MO-2026-000001 (status=done, 7ffa56f8…) detayında main içinde animationName!=="none" olan 1 öğe → SPAN.absolute…size-2.5 ring-4 ring-background bg-primary motion-safe:animate-pulse, animationName "pulse", 2s; nabız atan olay listenin SONUNCUSU değil. Kod değişmedi (order-timeline.tsx:18 PULSE_STATUSES). Değişmedi.',
  'bakim-oee-04':
    'Tur 15 yeniden ölçüm (scripts/probe-bakim-r15.ts, 390x844): KpiStripRow scrollWidth 792 > clientWidth 358, 5 karttan tam görünen 2 — Tur 9–14 ile birebir aynı, değişmedi. Aynı bileşen /bakim/makineler @390\'da scrollWidth 632 > clientWidth 358 (4 kart, tam görünen 2).',
  'bakim-oee-05':
    'Tur 15 yeniden ölçüm (scripts/probe-bakim-r15.ts, 1440x900): decimalsPerCol → OEE {2,1}, Kullanılabilirlik {0,2}, Performans {2,1}, Kalite {2}. 4 yüzde sütununun 3\'ü karışık — değişmedi.',
};

for (const [route, r] of Object.entries(card.routes) as [string, any][]) {
  r.round = R;
  r.scoreNotes = notes[route] ?? r.scoreNotes;
  for (const f of r.open ?? []) {
    if (measures[f.id]) f.measure = measures[f.id];
    f.lastMeasuredRound = R;
  }
  r.total = (r.scores as number[]).reduce((a, b) => a + b, 0);
  r.winner = 'Plantero';
}
card.updatedRound = R;
writeFileSync(p, JSON.stringify(card, null, 2) + '\n');
console.log(
  Object.entries(card.routes)
    .map(([k, v]: [string, any]) => `${k}: total=${v.total} open=${(v.open ?? []).length} (${(v.open ?? []).map((f: any) => f.severity).join(',')})`)
    .join('\n'),
);
