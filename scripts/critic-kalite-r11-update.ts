/** gorsel-critic tur 11 — kalite puan kartını güncelle (docs/DESIGN-SCORECARD.md kural 1-3). */
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'artifacts/critic/kalite.json';
type Route = Record<string, unknown>;
const card = JSON.parse(readFileSync(P, 'utf8')) as { round: number; note: string; measuredAt: string; routes: Record<string, Route>; summary?: unknown };

card.round = 11;
card.measuredAt = new Date().toISOString();
card.note =
  'Tur 11: kalite modülü bağımsız yeniden ölçüldü (referans sabit: Linear 57 veri / Stripe 56 finans-KPI). ' +
  'Araçlar: pnpm shot 1440x900 + 390x844 (artifacts/screens/kalite-*), pnpm measure (artifacts/critic/measure-kalite-r11/), ' +
  'scripts/probe-kalite-r9-lot.ts (artifacts/critic/probe-kalite-r11/lot-m.json) ve yeni scripts/probe-kalite-r11-colwidth.ts ' +
  '(Range ile gerçek metin genişliği → sütun slack). Tur 10\'dan bu yana kalite modülünde kod değişikliği yok ' +
  '(git log: yalnız bildirimler/tedarik commit\'leri); tüm ölçümler tur 10 değerlerini yeniden üretti, bu yüzden 8/8 route\'ta puan değişmedi. ' +
  'Kod düzeyi tarama (transition: all / ease-in / scale(0) / >300ms / hover gating / transform-origin) apps/web/src/modules/quality + ' +
  'apps/web/src/app/(app)/kalite üzerinde temiz: tek animasyon compute-score-button.tsx:62 `animate-spin` (bekleme göstergesi), ' +
  'hover globals.css:10 `@custom-variant hover` ile (hover:hover) and (pointer:fine) altında, buton geçişi ' +
  'transition-[color,background-color,border-color,box-shadow,transform] duration-150 + focus-visible:ring-[3px]. ' +
  '8/8 route KAZANAN: Plantero (toplam ≥ referans, hiçbir kriter < 4, açık P0/P1 yok). Kalan bulguların tamamı P2.';

const notes: Record<string, string[]> = {
  '/kalite/kontroller': [
    'kriter 3: 4 (değişmedi) — measure-kalite-r11/kontroller-m: mobil ul>li 88px (bant 56-72; kardeş ekranlar sablonlar/geri-cagirma 63,5px). P2 kalite-kontroller-10 açık.',
    'kriter 5: 5 (değişmedi) — probe-kalite-r11/colwidth: tablo 1152px, en geniş slack 98px (Lot) → shell normu ≤120px içinde; kontroller-d scrollWidth 1440/1440, taşma yok.',
    'kriter 1/2/6: 5 (değişmedi) — h1 24px/600, gövde 13px (55 düğüm), etiket 11-12px; kod/lot sütunları mono; rakamlar hizalı.',
    'kriter 9: 5 (değişmedi) — 390px\'te 390/390, <44px dokunma hedefi yalnız breadcrumb-page span\'i (etkileşimli değil, ölçüm aracı yanlış pozitifi).',
  ],
  '/kalite/kontroller/[id]': [
    'kriter 3: 4 (değişmedi) — "bekliyor" (QC-2026-000001) ilk ekranı 6 alan + tek 200px girdi taşıyor; "Sonuç girişi" kartının sağı boş.',
    'kriter 12: 4 (değişmedi) — check-detail.tsx:172 `rounded-lg border border-border/60 p-3` kalemi, satır 150\'deki `rounded-xl border` kartın içinde ikinci çerçeve (P2 kalite-kontroller-id-06).',
    'kriter 7: 5 (değişmedi) — karar bloğu için özenli boş durum ("Karar verebilmek için önce sonuçları kaydedin", ikon + metin).',
  ],
  '/kalite/sablonlar': [
    'kriter 5: 4 (değişmedi) — probe-kalite-r11/colwidth: Ad width 688 / maxContent 197 → slack 491 (shell normu ≤120px). P2 kalite-sablonlar-04 açık.',
    'kriter 6: 4 (değişmedi) — mobil kartta kalem sayısı etiketsiz çıplak "4"/"5" (P2 kalite-sablonlar-01/-03).',
    'kriter 3: 5 (değişmedi) — 2 kayıtla sınırlı veri; tbody tr 36px, gövde 13px (30 düğüm), boş alan veri kaynaklı.',
  ],
  '/kalite/tedarikci-skoru': [
    'kriter 5: 4 (değişmedi) — Tedarikçi width 590 / maxContent 331 → slack 259 (P2 kalite-tedarikci-04).',
    'kriter 7: 4 (değişmedi) — DataTable boş durumu özel metin veriyor ama tıklanabilir eylem yok.',
    'kriter 9: 4 (değişmedi) — 390px\'te KPI şeridi yatay kaydırmalı; 3 KPI\'dan yalnız 2\'si tam görünüyor ("En düşük skor" kırpık).',
    'kriter 6: 5 (değişmedi) — skor/oran hücreleri sağ hizalı, tabular; nonTabularNumbers 0.',
  ],
  '/kalite/izlenebilirlik': [
    'kriter 3: 4 (değişmedi) — arama öncesi 1440x900 ekranında başlık + arama alanı + ~350px kesikli boş durum; alt ~600px boş.',
    'kriter 7: 4 (değişmedi) — boş durum özenli (ikon + başlık + açıklama) ama tıklanabilir sonraki adım yok (P2 kalite-izlenebilirlik-05).',
    'kriter 9: 5 (değişmedi) — 390/390, main içinde <44px dokunma hedefi 0.',
  ],
  '/kalite/geri-cagirma': [
    'kriter 5: 4 (değişmedi) — Ürün / Lot width 419 / maxContent 209 → slack 210 (tur 10\'da 314; veri farkı, hâlâ >120 shell normu). P2 kalite-geri-cagirma-10.',
    'kriter 3: 4 (değişmedi) — tek kayıt; ilk ekranın ~%80\'i boş (veri kaynaklı).',
    'kriter 12: 5 (değişmedi) — çerçeve çorbası yok; "Gerekçe" hücresi 320px\'te ellipsis ile kesiliyor (kabul edilebilir kırpma, taşma yok).',
  ],
  '/kalite/geri-cagirma/[id]': [
    'kriter 9: 4 (değişmedi) — mobil KPI şeridi 6 karttan 2,5\'ini gösteriyor (P2 kalite-geri-cagirma-id-08); /kalite/tedarikci-skoru ile tutarlı puanlama.',
    'kriter 2: 4 (değişmedi) — "Etkilenen müşteriler" kartı sağdaki "Bildirim taslağı" kartından ~220px kısa; sol sütunda ölü alan.',
    'kriter 12: 4 (değişmedi) — "Bildirim taslağı" mono bloğu kart içinde ayrı çerçeveli kutuda (kutu içinde kutu).',
    'kriter 8: 5 (değişmedi) — birincil eylem ("Geri Çağırmayı Başlat") görünür, focus-visible ring 3px, hover (hover:hover) altında.',
  ],
  '/kalite/izlenebilirlik?lot=<lot no|uuid>': [
    'kriter 5: 4 (değişmedi) — probe-kalite-r11/lot-m: div.overflow-x-clip scrollWidth 393 / clientWidth 390; "Proteinsan Gıda Hammaddeleri Ltd. Şti." right=393 > vw=390, clippedTexts 0 (ellipsis yok). kalite-trace-lot-09 AÇIK (P2).',
    'kriter 9: 4 (değişmedi) — "Miktar dengesi" şeridi 792/358 = 434px kayıyor; 5 metrikten 3\'ü (Sevkiyat, Fire, Eldeki) ilk boyada viewport dışında.',
    'kriter 7: 5 (değişmedi) — derin bağlantı çözülürken iskelet basılıyor, boş durum atlanıyor.',
    'kriter 3: 5 (değişmedi) — 9 düğüm, gövde 13px, mobilde alt gezinme çubuğu metin örtmüyor (bottomNav.overlappedText null).',
  ],
};

for (const [key, r] of Object.entries(card.routes)) {
  const prev = r.total as number;
  r.round = 11;
  r.previousTotal = prev;
  r.delta = 0;
  r.verdict = 'KAZANAN: Plantero';
  if (notes[key]) r.scoreNotes = notes[key];
  r.measure = {
    round: 11,
    shots: 'artifacts/screens/',
    measure: 'artifacts/critic/measure-kalite-r11/',
    probes: 'artifacts/critic/probe-kalite-r11/',
  };
}

// kalite-trace-lot-09 yeniden ölçüldü, açık kalıyor
const lot = card.routes['/kalite/izlenebilirlik?lot=<lot no|uuid>'] as { open: Array<Record<string, unknown>> };
for (const o of lot.open) {
  if (o.id === 'kalite-trace-lot-09') {
    o.remeasuredRound = 11;
    o.measure =
      'Tur 11 (probe-kalite-r11/lot-m.json, 390x844, lot PL-260903-H1-01): div.overflow-x-clip scrollWidth 393 / clientWidth 390 (3px); ' +
      'outsideViewport: "Proteinsan Gıda Hammaddeleri Ltd. Şti." left=153 right=393 vw=390; clippedTexts 0 → ellipsis yok. Tur 10 ile aynı.';
    o.severity = 'P2';
  }
}

card.summary = {
  round: 11,
  reference: { linear: 57, stripe: 56 },
  routes: Object.fromEntries(Object.entries(card.routes).map(([k, v]) => [k, { total: (v as { total: number }).total, verdict: (v as { verdict: string }).verdict }])),
  won: 8,
  lost: 0,
  openP0P1: 0,
  openP2: Object.values(card.routes).reduce((n, v) => n + ((v as { open?: unknown[] }).open?.length ?? 0) + ((v as { p2?: unknown[] }).p2?.length ?? 0), 0),
  green: true,
  topRepeatedDefects: [
    'Tablo sütun genişliği içeriğe göre ayarlanmıyor: tek esnek sütun kalan genişliği yutuyor (sablonlar Ad slack 491, tedarikçi-skoru Tedarikçi 259, geri-çağırma Ürün/Lot 210 — shell normu ≤120px).',
    'Mobil KPI/metrik şeritleri 390px\'te yatay kaydırmaya bırakılıyor: geri-çağırma detayında 6 KPI\'ın 3,5\'i, izlenebilirlik miktar dengesinde 5 metriğin 3\'ü ilk boyada görünmüyor.',
    'Boş durumlar özenli ama eylemsiz: izlenebilirlik "Aramaya başlayın" ve tedarikçi skoru boş tablosunda tıklanabilir sonraki adım yok.',
  ],
};

writeFileSync(P, JSON.stringify(card, null, 1));
console.log('kalite.json tur 11 güncellendi.');
